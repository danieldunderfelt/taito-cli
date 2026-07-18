import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { addAllAndCommit, initRepo } from './git.js'
import type { TemplateCandidate } from './template-scan.js'

export interface TemplateInitOptions {
  sourcePath: string
  destPath: string
  /** Relative paths to include */
  files: string[]
  name?: string
  description?: string
  force?: boolean
  /** Optional candidate metadata for smarter config stubs */
  candidates?: TemplateCandidate[]
}

export interface TemplateInitResult {
  destPath: string
  name: string
  copied: string[]
  skipped: string[]
  configPath: string
}

/**
 * Scaffold a new template directory from selected project files
 */
export async function initTemplateFromProject(
  options: TemplateInitOptions
): Promise<TemplateInitResult> {
  const sourcePath = resolve(options.sourcePath)
  const destPath = resolve(options.destPath)
  const name =
    options.name ?? basename(destPath.replace(/[/\\]$/, '')) ?? 'my-template'

  if (existsSync(destPath)) {
    const { readdirSync } = await import('node:fs')
    const entries = readdirSync(destPath).filter((e) => e !== '.git')
    if (entries.length > 0 && !options.force) {
      throw new Error(
        `Destination is not empty: ${destPath}. Pass force to continue.`
      )
    }
  }

  mkdirSync(destPath, { recursive: true })

  const copied: string[] = []
  const skipped: string[] = []

  for (const rel of options.files) {
    const normalized = rel.replace(/\\/g, '/')
    const src = join(sourcePath, normalized)
    const dest = join(destPath, normalized)

    if (!existsSync(src)) {
      skipped.push(normalized)
      continue
    }

    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
    copied.push(normalized)
  }

  const taitoDir = join(destPath, '.taito')
  mkdirSync(taitoDir, { recursive: true })
  const configPath = join(taitoDir, 'template.config.toml')
  const description =
    options.description ??
    `Template extracted from project (${basename(sourcePath)})`

  const skillPaths = uniqueSkillRoots(copied)
  const hasDocs = copied.some((f) => f.startsWith('docs/'))
  const config = buildTemplateConfig({
    name,
    description,
    skillPaths,
    hasDocs,
    candidates: options.candidates,
    files: copied,
  })
  writeFileSync(configPath, config)

  // Seed a short EXTRACT.md note for the agent
  writeFileSync(
    join(taitoDir, 'EXTRACT.md'),
    `# Extracted template: ${name}

Source project: ${sourcePath}

Next steps for the authoring agent:
1. Stub/generalize project-specific content (docs, CLAUDE.md, README).
2. Add EJS customization points under \`.taito/\` where values should vary.
3. Expand \`template.config.toml\` variables and components.
4. Run \`taito build\` after editing EJS defaults.
5. \`git add -A && git commit\`, then \`taito add ${destPath}\`.
6. Apply back to the source project with \`taito apply\` / the apply-template skill.
`
  )

  await initRepo(destPath)
  await addAllAndCommit(destPath, `Initialize template ${name} from project`)

  return {
    destPath,
    name,
    copied,
    skipped,
    configPath,
  }
}

function uniqueSkillRoots(files: string[]): string[] {
  const roots = new Set<string>()
  for (const f of files) {
    const match = f.match(
      /^((?:\.agents|\.claude|\.cursor|\.codex|\.github)\/skills\/[^/]+)/
    )
    if (match) {
      roots.add(match[1])
    } else if (f.startsWith('skills/')) {
      const parts = f.split('/')
      if (parts.length >= 2) roots.add(`skills/${parts[1]}`)
    }
  }
  return [...roots].toSorted()
}

function buildTemplateConfig(args: {
  name: string
  description: string
  skillPaths: string[]
  hasDocs: boolean
  candidates?: TemplateCandidate[]
  files: string[]
}): string {
  const lines: string[] = [
    `[meta]`,
    `name = ${tomlString(args.name)}`,
    `version = "0.1.0"`,
    `description = ${tomlString(args.description)}`,
    ``,
    `[variables.PROJECT_NAME]`,
    `type = "string"`,
    `prompt = "Project name?"`,
    `default = "my-project"`,
    `validate = "^[a-z0-9-]+$"`,
    ``,
  ]

  if (args.hasDocs) {
    lines.push(
      `[components.docs]`,
      `prompt = "Include documentation scaffold?"`,
      `default = true`,
      `paths = ["docs/**"]`,
      ``
    )
  }

  if (args.skillPaths.length > 0) {
    lines.push(
      `[components.skills]`,
      `prompt = "Include agent skills from the template?"`,
      `default = true`,
      `skills = [`,
      ...args.skillPaths.map((p) => `  ${tomlString(p)},`),
      `]`,
      ``
    )
  }

  lines.push(
    `# TODO: Add more [variables.*] and [components.*] as you generalize files.`,
    `# Add matching .taito/**/*.ejs customization points for parameterized files.`,
    ``
  )

  return lines.join('\n')
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

/**
 * Parse a simple include manifest (JSON)
 */
export function parseIncludeManifest(manifestPath: string): {
  files: string[]
  name?: string
  description?: string
} {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
    files?: string[]
    include?: string[]
    name?: string
    description?: string
  }
  const files = raw.files ?? raw.include
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Manifest must include a non-empty "files" array')
  }
  return {
    files: files.filter((f): f is string => typeof f === 'string'),
    name: raw.name,
    description: raw.description,
  }
}
