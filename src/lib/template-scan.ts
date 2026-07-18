import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { matchAnyGlob } from './glob.js'

export type CandidateCategory =
  | 'agent_docs'
  | 'skills'
  | 'lint_format'
  | 'typescript'
  | 'git'
  | 'license'
  | 'editor'

export interface TemplateCandidate {
  path: string
  category: CandidateCategory
  reason: string
  bytes: number
}

export interface TemplateScanResult {
  sourcePath: string
  /**
   * Small baseline of common agent/config files found in the project.
   * The agent should discover additional files based on the user's template request.
   */
  candidates: TemplateCandidate[]
  /** Paths under the project that matched exclusion rules (sample) */
  excluded: { path: string; reason: string }[]
  /** Glob/dir patterns that are never template material */
  exclusionPatterns: {
    directories: string[]
    files: string[]
  }
  summary: {
    total: number
    excludedSample: number
  }
}

const SKIP_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  'vendor',
  'target',
  '.taito',
]

const SKIP_FILES = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  'credentials.json',
  '**/secrets/**',
  'package-lock.json',
  'bun.lock',
  'bun.lockb',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.taito/project.meta.toml',
  '.taito/apply-answers.toml',
]

/**
 * Minimal baseline: very common agent + tooling config files only.
 * Docs, scripts, CI, app source, etc. are left for the agent to propose.
 */
const COMMON: {
  pattern: string
  category: CandidateCategory
  reason: string
}[] = [
  { pattern: 'CLAUDE.md', category: 'agent_docs', reason: 'Claude agent doc' },
  { pattern: 'AGENTS.md', category: 'agent_docs', reason: 'Agents entry doc' },
  { pattern: 'AGENT.md', category: 'agent_docs', reason: 'Agent routing doc' },
  {
    pattern: '.cursorrules',
    category: 'agent_docs',
    reason: 'Cursor rules file',
  },
  {
    pattern: '.cursor/rules/**',
    category: 'agent_docs',
    reason: 'Cursor rules',
  },

  {
    pattern: '.agents/skills/**',
    category: 'skills',
    reason: 'Agent skill',
  },
  {
    pattern: '.claude/skills/**',
    category: 'skills',
    reason: 'Agent skill',
  },
  {
    pattern: '.cursor/skills/**',
    category: 'skills',
    reason: 'Agent skill',
  },
  {
    pattern: '.codex/skills/**',
    category: 'skills',
    reason: 'Agent skill',
  },
  {
    pattern: '.github/skills/**',
    category: 'skills',
    reason: 'Agent skill',
  },

  {
    pattern: 'eslint.config.*',
    category: 'lint_format',
    reason: 'ESLint config',
  },
  {
    pattern: '.eslintrc*',
    category: 'lint_format',
    reason: 'ESLint config',
  },
  {
    pattern: 'prettier.config.*',
    category: 'lint_format',
    reason: 'Prettier config',
  },
  {
    pattern: '.prettierrc*',
    category: 'lint_format',
    reason: 'Prettier config',
  },
  { pattern: 'biome.json', category: 'lint_format', reason: 'Biome config' },
  { pattern: 'biome.jsonc', category: 'lint_format', reason: 'Biome config' },
  {
    pattern: '.oxlintrc*',
    category: 'lint_format',
    reason: 'Oxlint config',
  },
  {
    pattern: '.editorconfig',
    category: 'editor',
    reason: 'EditorConfig',
  },

  {
    pattern: 'tsconfig.json',
    category: 'typescript',
    reason: 'TypeScript config',
  },
  {
    pattern: 'tsconfig.*.json',
    category: 'typescript',
    reason: 'TypeScript config',
  },

  { pattern: '.gitignore', category: 'git', reason: 'Git ignore' },
  { pattern: '.gitattributes', category: 'git', reason: 'Git attributes' },

  { pattern: 'LICENSE', category: 'license', reason: 'License' },
  { pattern: 'LICENSE.md', category: 'license', reason: 'License' },
  { pattern: 'LICENCE', category: 'license', reason: 'License' },
  { pattern: 'LICENCE.md', category: 'license', reason: 'License' },
]

/**
 * Scan a project for a small baseline of common agent/config files,
 * plus report exclusion matches. Broader discovery is the agent's job.
 */
export function scanTemplateCandidates(sourcePath: string): TemplateScanResult {
  const allFiles = listFiles(sourcePath)
  const excluded: TemplateScanResult['excluded'] = []
  const candidates: TemplateCandidate[] = []

  for (const abs of allFiles) {
    const rel = relative(sourcePath, abs).replace(/\\/g, '/')

    const skipReason = exclusionReason(rel)
    if (skipReason) {
      if (excluded.length < 100) {
        excluded.push({ path: rel, reason: skipReason })
      }
      continue
    }

    const matched = matchCommon(rel)
    if (!matched) continue

    candidates.push({
      path: rel,
      category: matched.category,
      reason: matched.reason,
      bytes: safeSize(abs),
    })
  }

  const byPath = new Map<string, TemplateCandidate>()
  for (const c of candidates) {
    if (!byPath.has(c.path)) byPath.set(c.path, c)
  }
  const deduped = [...byPath.values()].toSorted((a, b) =>
    a.path.localeCompare(b.path)
  )

  return {
    sourcePath,
    candidates: deduped,
    excluded,
    exclusionPatterns: {
      directories: [...SKIP_DIRS],
      files: [...SKIP_FILES],
    },
    summary: {
      total: deduped.length,
      excludedSample: excluded.length,
    },
  }
}

function matchCommon(rel: string): (typeof COMMON)[number] | undefined {
  for (const rule of COMMON) {
    if (matchAnyGlob([rule.pattern], rel)) return rule
  }
  return undefined
}

function exclusionReason(rel: string): string | undefined {
  const parts = rel.split('/')
  for (const part of parts) {
    if (SKIP_DIRS.includes(part)) {
      return `directory excluded (${part})`
    }
    if (part.startsWith('.env')) {
      return 'env/secrets'
    }
  }
  if (matchAnyGlob(SKIP_FILES, rel)) {
    return 'lockfile, secret, or taito project meta'
  }
  return undefined
}

function listFiles(root: string): string[] {
  const files: string[] = []

  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      // Still descend into skip dirs? No — we don't list their contents as excluded samples
      // except we want exclusions reported. Skip descending into heavy dirs entirely.
      if (SKIP_DIRS.includes(entry)) continue
      const full = join(dir, entry)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        walk(full)
      } else if (stat.isFile()) {
        files.push(full)
      }
    }
  }

  if (existsSync(root)) {
    walk(root)
  }
  return files
}

function safeSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}
