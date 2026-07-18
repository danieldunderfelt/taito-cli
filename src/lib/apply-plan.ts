import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'

import type {
  ApplyFileEntry,
  ApplyPlan,
  ApplySkillEntry,
  ApplyStrategyHint,
  ComponentValues,
  TemplateConfig,
  VariableValues,
} from '../types.js'
import { discoverSkills } from './discovery.js'
import { getExcludedPatterns } from './config.js'
import {
  collectTemplateInputs,
  materializeTemplate,
} from './template-materialize.js'
import { getRegisteredTemplate } from './registry.js'
import { expandPath } from './github.js'

export interface BuildApplyPlanOptions {
  template: string
  projectPath?: string
  configPath?: string
  /** Force defaults without prompting */
  nonInteractive?: boolean
}

/**
 * Build a plan comparing a rendered template against an existing project
 */
export async function buildApplyPlan(
  options: BuildApplyPlanOptions
): Promise<{ plan: ApplyPlan; cleanup: () => void }> {
  const registered = getRegisteredTemplate(options.template)
  if (!registered) {
    throw new Error(
      `Template '${options.template}' is not registered. Run: taito add <path>`
    )
  }
  if (!existsSync(registered.path)) {
    throw new Error(`Template path no longer exists: ${registered.path}`)
  }

  const projectPath = expandPath(options.projectPath ?? '.')
  const { config, values, components } = await collectTemplateInputs(
    registered.path,
    {
      configPath: options.configPath,
      nonInteractive: options.nonInteractive ?? Boolean(options.configPath),
    }
  )

  const tempRoot = mkdtempSync(join(tmpdir(), 'taito-apply-'))
  const renderedDir = join(tempRoot, 'rendered')

  const result = await materializeTemplate(
    registered.path,
    renderedDir,
    values,
    components,
    config
  )

  const files = buildFileEntries(renderedDir, projectPath, result.files)
  const skills = buildSkillEntries(
    registered.path,
    projectPath,
    components,
    config
  )

  const plan: ApplyPlan = {
    template: registered.name,
    templatePath: registered.path,
    templateCommit: result.templateCommit,
    projectPath,
    variables: values,
    components,
    files,
    skills,
    summary: {
      missing: files.filter((f) => f.status === 'missing').length,
      identical: files.filter((f) => f.status === 'identical').length,
      differs: files.filter((f) => f.status === 'differs').length,
      skillsMissing: skills.filter((s) => s.status === 'missing').length,
      skillsPresent: skills.filter((s) => s.status === 'present').length,
    },
  }

  return {
    plan,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  }
}

/**
 * Materialize template into a temp dir for reading individual files
 */
export async function materializeForApply(
  templateName: string,
  values: VariableValues,
  components: ComponentValues,
  configPath?: string
): Promise<{
  renderedDir: string
  templatePath: string
  templateCommit: string
  cleanup: () => void
}> {
  const registered = getRegisteredTemplate(templateName)
  if (!registered) {
    throw new Error(`Template '${templateName}' is not registered`)
  }

  const { config } = await collectTemplateInputs(registered.path, {
    configPath,
    nonInteractive: true,
  })

  const tempRoot = mkdtempSync(join(tmpdir(), 'taito-apply-'))
  const renderedDir = join(tempRoot, 'rendered')
  const result = await materializeTemplate(
    registered.path,
    renderedDir,
    values,
    components,
    config
  )

  return {
    renderedDir,
    templatePath: registered.path,
    templateCommit: result.templateCommit,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  }
}

function buildFileEntries(
  renderedDir: string,
  projectPath: string,
  relativeFiles: string[]
): ApplyFileEntry[] {
  const entries: ApplyFileEntry[] = []

  for (const rel of relativeFiles.toSorted()) {
    // Never propose overwriting live project meta from a template tree
    if (rel === '.taito/project.meta.toml') continue

    const templateFile = join(renderedDir, rel)
    const projectFile = join(projectPath, rel)

    if (!existsSync(templateFile) || !statSync(templateFile).isFile()) {
      continue
    }

    const templateBuf = readFileSync(templateFile)
    const templateBytes = templateBuf.length

    if (!existsSync(projectFile)) {
      entries.push({
        path: rel,
        status: 'missing',
        hint: 'write',
        templateBytes,
        projectBytes: 0,
        projectRicher: false,
      })
      continue
    }

    const projectBuf = readFileSync(projectFile)
    const projectBytes = projectBuf.length
    const identical = projectBuf.equals(templateBuf)
    const projectRicher =
      projectBytes > templateBytes * 1.2 || projectBytes > templateBytes + 200

    const status = identical ? 'identical' : 'differs'
    const hint: ApplyStrategyHint = identical
      ? 'skip'
      : projectRicher
        ? 'merge'
        : 'merge'

    entries.push({
      path: rel,
      status,
      hint,
      templateBytes,
      projectBytes,
      projectRicher,
    })
  }

  return entries
}

function buildSkillEntries(
  templatePath: string,
  projectPath: string,
  components: ComponentValues,
  config: TemplateConfig
): ApplySkillEntry[] {
  const excluded = getExcludedPatterns(config, components)
  const discovered = discoverSkills(templatePath)

  return discovered
    .map((s) => {
      const relativePath = relative(templatePath, s.path).replace(/\\/g, '/')
      return {
        name: s.dirName,
        relativePath,
        customizable: s.isCustomizable,
        templatePath: s.path,
        status: 'missing' as const,
      }
    })
    .filter((s) => {
      for (const pattern of excluded.skills) {
        const normalized = pattern.replace(/\\/g, '/').replace(/\/$/, '')
        if (
          s.relativePath === normalized ||
          s.relativePath.startsWith(normalized + '/') ||
          normalized.endsWith('/' + s.name) ||
          normalized === s.name
        ) {
          return false
        }
      }
      return true
    })
    .map((s) => {
      // Skill is "present" if SKILL.md exists at the same relative path in the project
      const projectSkillMd = join(projectPath, s.relativePath, 'SKILL.md')
      // Also check common agent skill dirs by name
      const altPaths = [
        projectSkillMd,
        join(projectPath, '.agents', 'skills', s.name, 'SKILL.md'),
        join(projectPath, '.claude', 'skills', s.name, 'SKILL.md'),
        join(projectPath, '.cursor', 'skills', s.name, 'SKILL.md'),
      ]
      const present = altPaths.some((p) => existsSync(p))
      const entry: ApplySkillEntry = {
        name: s.name,
        relativePath: s.relativePath,
        customizable: s.customizable,
        templatePath: s.templatePath,
        status: present ? 'present' : 'missing',
      }
      return entry
    })
}

/**
 * Copy a single rendered template file into the project
 */
export function writeApplyFile(
  renderedDir: string,
  projectPath: string,
  relativePath: string,
  force: boolean
): 'written' | 'skipped' {
  const src = join(renderedDir, relativePath)
  const dest = join(projectPath, relativePath)

  if (!existsSync(src)) {
    throw new Error(`Template file not found: ${relativePath}`)
  }

  if (existsSync(dest) && !force) {
    const same = readFileSync(src).equals(readFileSync(dest))
    if (same) return 'skipped'
    throw new Error(
      `Project already has ${relativePath} with different content. Use --force to overwrite, or merge manually after \`taito apply cat\`.`
    )
  }

  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, readFileSync(src))
  return 'written'
}

/**
 * Read rendered template file content
 */
export function readRenderedFile(
  renderedDir: string,
  relativePath: string
): Buffer {
  const src = join(renderedDir, relativePath)
  if (!existsSync(src)) {
    throw new Error(`Template file not found: ${relativePath}`)
  }
  return readFileSync(src)
}
