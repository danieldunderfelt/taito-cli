import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import ejs from 'ejs'

import { matchAnyGlob } from './glob.js'
import type { RenderMode, VariableValues } from '../types.js'

export interface RenderOptions {
  mode: RenderMode
  dryRun?: boolean
  /** Relative path globs to exclude from output */
  excludePaths?: string[]
  /** Relative skill directory prefixes to exclude (and their trees) */
  excludeSkills?: string[]
  /**
   * When true, skip copying skill packages that look customizable
   * (contain .taito/skill.config.toml). They are installed separately.
   */
  skipCustomizableSkills?: boolean
}

/**
 * Render all .ejs templates in .taito/ directory
 * and copy non-templated files from root
 */
export async function renderSkill(
  skillDir: string,
  outputDir: string,
  values: VariableValues,
  dryRun: boolean = false
): Promise<string[]> {
  return renderTaitoTree(skillDir, outputDir, values, {
    mode: 'skill',
    dryRun,
  })
}

/**
 * Shared renderer for skills and templates
 */
export async function renderTaitoTree(
  sourceDir: string,
  outputDir: string,
  values: VariableValues,
  options: RenderOptions
): Promise<string[]> {
  const taitoDir = join(sourceDir, '.taito')
  const renderedFiles: string[] = []
  const dryRun = options.dryRun ?? false
  const excludePaths = options.excludePaths ?? []
  const excludeSkills = options.excludeSkills ?? []

  const templateFiles = collectFiles(taitoDir, '.ejs')
  const templateTargets = new Set<string>()

  for (const templatePath of templateFiles) {
    const relativePath = relative(taitoDir, templatePath)
    const outputRelative = relativePath.replace(/\.ejs$/, '')

    // Skip config files and skill configs under .taito
    if (
      outputRelative === 'skill.config.toml' ||
      outputRelative === 'template.config.toml' ||
      outputRelative === 'project.meta.toml'
    ) {
      continue
    }

    if (shouldExclude(outputRelative, excludePaths, excludeSkills)) {
      continue
    }

    // Don't render files that belong to customizable skill packages via template EJS
    // (skill EJS lives under skillDir/.taito/ — those are handled by skill install)
    templateTargets.add(outputRelative)

    const outputPath = join(outputDir, outputRelative)
    const rendered = await renderTemplate(templatePath, values)

    if (dryRun) {
      console.log(`Would write: ${outputPath}`)
      console.log('---')
      console.log(
        rendered.slice(0, 500) + (rendered.length > 500 ? '\n...' : '')
      )
      console.log('---\n')
    } else {
      mkdirSync(dirname(outputPath), { recursive: true })
      writeFileSync(outputPath, rendered)
    }

    renderedFiles.push(outputRelative)
  }

  const rootFiles = collectAllFiles(sourceDir, options.mode)
  for (const filePath of rootFiles) {
    const relativePath = relative(sourceDir, filePath)

    if (
      relativePath === '.taito' ||
      relativePath.startsWith('.taito/') ||
      relativePath === '.git' ||
      relativePath.startsWith('.git/')
    ) {
      continue
    }

    if (templateTargets.has(relativePath)) {
      continue
    }

    if (shouldExclude(relativePath, excludePaths, excludeSkills)) {
      continue
    }

    if (options.mode === 'skill') {
      if (
        relativePath.startsWith('.') ||
        relativePath === 'package.json' ||
        relativePath === 'package-lock.json' ||
        relativePath === 'node_modules' ||
        relativePath.startsWith('node_modules/')
      ) {
        continue
      }
    } else {
      // Template mode: skip node_modules
      if (
        relativePath === 'node_modules' ||
        relativePath.startsWith('node_modules/')
      ) {
        continue
      }
    }

    if (
      options.skipCustomizableSkills &&
      isInsideCustomizableSkill(sourceDir, relativePath)
    ) {
      continue
    }

    const outputPath = join(outputDir, relativePath)

    if (dryRun) {
      console.log(`Would copy: ${outputPath}`)
    } else {
      mkdirSync(dirname(outputPath), { recursive: true })
      copyFileSync(filePath, outputPath)
    }

    renderedFiles.push(relativePath)
  }

  return renderedFiles
}

function shouldExclude(
  relativePath: string,
  excludePaths: string[],
  excludeSkills: string[]
): boolean {
  if (excludePaths.length > 0 && matchAnyGlob(excludePaths, relativePath)) {
    return true
  }
  for (const skill of excludeSkills) {
    const normalized = skill.replace(/\\/g, '/').replace(/\/$/, '')
    if (
      relativePath === normalized ||
      relativePath.startsWith(normalized + '/')
    ) {
      return true
    }
  }
  return false
}

/**
 * Detect if a relative path sits inside a customizable skill package
 */
function isInsideCustomizableSkill(
  sourceDir: string,
  relativePath: string
): boolean {
  const parts = relativePath.replace(/\\/g, '/').split('/')
  // Walk up path prefixes looking for SKILL.md + skill.config.toml
  for (let i = parts.length; i >= 1; i--) {
    const prefix = parts.slice(0, i).join('/')
    const skillMd = join(sourceDir, prefix, 'SKILL.md')
    const skillConfig = join(sourceDir, prefix, '.taito', 'skill.config.toml')
    if (existsSync(skillMd) && existsSync(skillConfig)) {
      return true
    }
    if (existsSync(skillMd) && !existsSync(skillConfig)) {
      // Standard skill — copy with the tree; only customizable skills are deferred
      return false
    }
  }
  return false
}

/**
 * Render a single EJS template file
 */
async function renderTemplate(
  templatePath: string,
  values: VariableValues
): Promise<string> {
  const template = readFileSync(templatePath, 'utf-8')

  try {
    return ejs.render(template, values, {
      filename: templatePath,
    })
  } catch (error) {
    const err = error as Error
    throw new Error(`Failed to render template ${templatePath}: ${err.message}`)
  }
}

/**
 * Collect all files with a specific extension recursively
 */
function collectFiles(dir: string, extension: string): string[] {
  const files: string[] = []

  try {
    const entries = readdirSync(dir)

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        files.push(...collectFiles(fullPath, extension))
      } else if (entry.endsWith(extension)) {
        files.push(fullPath)
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return files
}

/**
 * Collect all files recursively
 */
function collectAllFiles(dir: string, mode: RenderMode): string[] {
  const files: string[] = []

  try {
    const entries = readdirSync(dir)

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === '.git') {
          continue
        }
        // Skill mode: skip hidden dirs except we already skip .taito at call site
        if (mode === 'skill' && entry.startsWith('.')) {
          continue
        }
        // Template mode: include hidden dirs (e.g. .agents, .cursor) except .git
        if (mode === 'template' && entry === '.taito') {
          continue
        }
        files.push(...collectAllFiles(fullPath, mode))
      } else {
        files.push(fullPath)
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return files
}

/**
 * Render templates with default values (for build command)
 */
export async function renderWithDefaults(
  packageDir: string,
  values: VariableValues,
  outputDir?: string
): Promise<string[]> {
  const taitoDir = join(packageDir, '.taito')
  const targetDir = outputDir ? resolve(outputDir) : packageDir
  const renderedFiles: string[] = []

  const templateFiles = collectFiles(taitoDir, '.ejs')

  for (const templatePath of templateFiles) {
    const relativePath = relative(taitoDir, templatePath)
    const outputRelative = relativePath.replace(/\.ejs$/, '')

    if (
      outputRelative === 'skill.config.toml' ||
      outputRelative === 'template.config.toml' ||
      outputRelative === 'project.meta.toml'
    ) {
      continue
    }

    const outputPath = join(targetDir, outputRelative)
    const rendered = await renderTemplate(templatePath, values)

    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, rendered)

    renderedFiles.push(relative(targetDir, outputPath))
  }

  return renderedFiles
}
