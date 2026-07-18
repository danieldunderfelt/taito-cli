import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import * as p from '@clack/prompts'

import { expandPath } from '../lib/github.js'
import {
  initTemplateFromProject,
  parseIncludeManifest,
} from '../lib/template-init.js'
import { scanTemplateCandidates } from '../lib/template-scan.js'

export interface TemplateScanOptions {
  json?: boolean
  /** Write baseline candidate paths to a manifest JSON */
  outManifest?: string
}

export interface TemplateInitCommandOptions {
  from?: string
  name?: string
  description?: string
  force?: boolean
  json?: boolean
  /** JSON manifest with { files: string[] } */
  manifest?: string
  /** Repeatable include paths (CLI also accepts comma-separated) */
  include?: string[]
  /** Include all baseline scan candidates (agent should still confirm with user) */
  baseline?: boolean
}

/**
 * taito template scan [path]
 */
export async function templateScanCommand(
  path: string = '.',
  options: TemplateScanOptions = {}
): Promise<void> {
  const sourcePath = expandPath(path)
  if (!existsSync(sourcePath)) {
    p.log.error(`Path not found: ${sourcePath}`)
    process.exit(1)
  }

  const result = scanTemplateCandidates(sourcePath)

  if (options.outManifest) {
    const manifestPath = resolve(options.outManifest)
    const files = result.candidates.map((c) => c.path)
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          name: undefined,
          description: undefined,
          files,
        },
        null,
        2
      ) + '\n'
    )
    if (!options.json) {
      p.log.success(
        `Wrote baseline manifest (${files.length} files) to ${manifestPath}`
      )
    }
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  p.log.info(`Baseline common files in ${result.sourcePath}`)
  p.log.message(
    `Found ${result.summary.total} common agent/config files (not a full template inventory).`
  )
  p.log.message(
    'Discover additional files yourself based on what the user asked for.'
  )
  p.log.message('')

  let currentCat = ''
  for (const c of result.candidates) {
    if (c.category !== currentCat) {
      currentCat = c.category
      p.log.info(`${currentCat}:`)
    }
    p.log.message(`  ${c.path} — ${c.reason}`)
  }

  if (result.excluded.length > 0) {
    p.log.message('')
    p.log.info(
      `Excluded sample (${result.excluded.length}, patterns in exclusionPatterns):`
    )
    for (const e of result.excluded.slice(0, 20)) {
      p.log.message(`  ${e.path} (${e.reason})`)
    }
  }

  p.log.message('')
  p.log.message(
    'Next: propose a full file list to the user, then `taito template init <dest> --manifest ./manifest.json`'
  )
}

/**
 * taito template init <dest>
 */
export async function templateInitCommand(
  dest: string,
  options: TemplateInitCommandOptions = {}
): Promise<void> {
  const destPath = expandPath(dest)
  const sourcePath = expandPath(options.from ?? '.')

  if (!existsSync(sourcePath)) {
    p.log.error(`Source not found: ${sourcePath}`)
    process.exit(1)
  }

  let files: string[] = []
  let name = options.name
  let description = options.description

  if (options.manifest) {
    const parsed = parseIncludeManifest(expandPath(options.manifest))
    files = parsed.files
    name = name ?? parsed.name
    description = description ?? parsed.description
  } else if (options.include && options.include.length > 0) {
    files = options.include.flatMap((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    )
  } else if (options.baseline) {
    files = scanTemplateCandidates(sourcePath).candidates.map((c) => c.path)
  } else {
    p.log.error('Specify files via --manifest, --include, or --baseline')
    process.exit(1)
  }

  if (files.length === 0) {
    p.log.error('No files selected to copy into the template.')
    process.exit(1)
  }

  const scan = scanTemplateCandidates(sourcePath)
  const candidateByPath = new Map(scan.candidates.map((c) => [c.path, c]))

  try {
    const result = await initTemplateFromProject({
      sourcePath,
      destPath,
      files,
      name,
      description,
      force: options.force,
      candidates: files
        .map((f) => candidateByPath.get(f))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    })

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    p.log.success(`Template scaffolded at ${result.destPath}`)
    p.log.message(`Name: ${result.name}`)
    p.log.message(`Copied ${result.copied.length} files`)
    if (result.skipped.length > 0) {
      p.log.warn(`Skipped missing: ${result.skipped.join(', ')}`)
    }
    p.log.message(`Config: ${result.configPath}`)
    p.log.message('')
    p.log.message('Next:')
    p.log.message('  1. Generalize/stub project-specific content + add EJS')
    p.log.message(`  2. taito add ${result.destPath}`)
    p.log.message(
      `  3. Apply back: taito apply plan -t ${result.name} --json (from source project)`
    )
  } catch (error) {
    const err = error as Error
    p.log.error(err.message)
    process.exit(1)
  }
}
