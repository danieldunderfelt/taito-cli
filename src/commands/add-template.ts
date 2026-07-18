import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import * as p from '@clack/prompts'

import { isTemplate } from '../lib/classify.js'
import { expandPath } from '../lib/github.js'
import {
  cloneRepo,
  getCurrentBranch,
  githubCloneUrl,
  initRepo,
  addAllAndCommit,
  isGitRepo,
  worktreeAdd,
} from '../lib/git.js'
import {
  copyTreePreservingSymlinks,
  restoreSkillSymlinks,
} from '../lib/paths.js'
import {
  getRegisteredTemplate,
  getTemplateCachePath,
  isTemplateNameTaken,
  registerTemplate,
  unregisterTemplate,
} from '../lib/registry.js'
import { templateNameFromPath } from '../lib/template-materialize.js'
import type { AddOptions, RegisteredTemplate, SkillSource } from '../types.js'

/**
 * Register a template from a resolved local directory (already on disk)
 */
export async function registerLocalTemplate(
  templateDir: string,
  options: {
    name?: string
    source?: string
    ref?: string
    extends?: string
    branch?: string
    force?: boolean
  } = {}
): Promise<RegisteredTemplate> {
  const abs = resolve(templateDir)

  if (!existsSync(abs)) {
    throw new Error(`Template path not found: ${abs}`)
  }

  if (!isTemplate(abs)) {
    throw new Error(
      `Not a taito template: ${abs}\nExpected .taito/template.config.toml`
    )
  }

  if (!(await isGitRepo(abs))) {
    throw new Error(
      `Templates must be git repositories. Initialize git in ${abs} first.`
    )
  }

  const name = templateNameFromPath(abs, options.name)

  const existing = getRegisteredTemplate(name)
  if (existing && !options.force) {
    const overwrite = await p.confirm({
      message: `Template '${name}' is already registered (${existing.path}). Replace?`,
      initialValue: false,
    })
    if (p.isCancel(overwrite) || !overwrite) {
      throw new Error('Registration cancelled.')
    }
  }

  const entry: RegisteredTemplate = {
    name,
    path: abs,
    source: options.source ?? 'local',
    ref: options.ref,
    extends: options.extends,
    branch: options.branch,
    addedAt: new Date().toISOString(),
  }

  registerTemplate(entry)
  return entry
}

/**
 * Clone a GitHub repo as a template into ~/.taito/templates/<name> and register it
 */
export async function addGithubTemplate(
  source: SkillSource,
  options: AddOptions
): Promise<RegisteredTemplate> {
  if (source.type !== 'github' || !source.owner || !source.repo) {
    throw new Error('Expected a GitHub source')
  }

  const defaultName = options.name ?? source.repo
  const cachePath = getTemplateCachePath(defaultName)

  if (existsSync(cachePath)) {
    if (options.force) {
      rmSync(cachePath, { recursive: true, force: true })
    } else {
      const overwrite = await p.confirm({
        message: `Template cache already exists at ${cachePath}. Replace?`,
        initialValue: false,
      })
      if (p.isCancel(overwrite) || !overwrite) {
        throw new Error('Registration cancelled.')
      }
      rmSync(cachePath, { recursive: true, force: true })
    }
  }

  const spinner = p.spinner()
  const url = githubCloneUrl(source.owner, source.repo)
  spinner.start(`Cloning ${source.owner}/${source.repo}...`)
  try {
    await cloneRepo(url, cachePath, source.ref)
    spinner.stop(`Cloned ${source.owner}/${source.repo}`)
  } catch (error) {
    spinner.stop('Clone failed')
    throw error
  }

  // If skillPath points at a subdirectory that is the template root
  let templateRoot = cachePath
  if (source.skillPath) {
    const sub = resolve(cachePath, source.skillPath)
    if (isTemplate(sub)) {
      templateRoot = sub
    } else if (!isTemplate(cachePath)) {
      throw new Error(
        `No template.config.toml found at repo root or ${source.skillPath}`
      )
    }
  }

  if (!isTemplate(templateRoot)) {
    rmSync(cachePath, { recursive: true, force: true })
    throw new Error(
      `Repository is not a taito template (missing .taito/template.config.toml)`
    )
  }

  return registerLocalTemplate(templateRoot, {
    name: defaultName,
    source: `github:${source.owner}/${source.repo}`,
    ref: source.ref,
    force: options.force,
  })
}

/**
 * Duplicate a registered template to a new path with a fresh git repo
 */
export async function duplicateTemplate(
  destPath: string,
  sourceName: string,
  options: AddOptions
): Promise<RegisteredTemplate> {
  const source = getRegisteredTemplate(sourceName)
  if (!source) {
    throw new Error(
      `Template '${sourceName}' is not registered. Run: taito add <path>`
    )
  }

  const dest = expandPath(destPath)
  const name = options.name ?? basename(dest.replace(/[/\\]$/, ''))

  if (existsSync(dest) && readdirSync(dest).length > 0 && !options.force) {
    const overwrite = await p.confirm({
      message: `Destination ${dest} is not empty. Continue?`,
      initialValue: false,
    })
    if (p.isCancel(overwrite) || !overwrite) {
      throw new Error('Duplicate cancelled.')
    }
  }

  if (isTemplateNameTaken(name) && !options.force) {
    throw new Error(
      `Template name '${name}' is already registered. Use --name or --force.`
    )
  }

  const spinner = p.spinner()
  spinner.start(`Duplicating '${sourceName}' → ${dest}...`)

  mkdirSync(dest, { recursive: true })
  // Preserve skill symlinks (.claude/skills/foo → ../.agents/skills/foo)
  copyTreePreservingSymlinks(source.path, dest, { skipGit: true })
  const restored = restoreSkillSymlinks(dest)
  if (restored.length > 0) {
    p.log.message(
      `Restored ${restored.length} skill symlink(s) under agent dirs`
    )
  }

  await initRepo(dest)
  await addAllAndCommit(dest, `Duplicate of template ${sourceName}`)

  spinner.stop(`Duplicated to ${dest}`)

  // If another template had this name and we're forcing, unregister first
  if (isTemplateNameTaken(name)) {
    unregisterTemplate(name)
  }

  return registerLocalTemplate(dest, {
    name,
    source: 'local',
    force: true,
  })
}

/**
 * Extend a registered template as a git worktree + branch
 */
export async function extendTemplate(
  destPath: string,
  baseName: string,
  options: AddOptions
): Promise<RegisteredTemplate> {
  const base = getRegisteredTemplate(baseName)
  if (!base) {
    throw new Error(
      `Template '${baseName}' is not registered. Run: taito add <path>`
    )
  }

  if (!(await isGitRepo(base.path))) {
    throw new Error(`Base template is not a git repository: ${base.path}`)
  }

  const dest = expandPath(destPath)
  const name = options.name ?? basename(dest.replace(/[/\\]$/, ''))
  const branch = `taito/${name}`

  if (existsSync(dest) && readdirSync(dest).length > 0) {
    throw new Error(`Destination already exists and is not empty: ${dest}`)
  }

  if (isTemplateNameTaken(name) && !options.force) {
    throw new Error(
      `Template name '${name}' is already registered. Use --name or --force.`
    )
  }

  const spinner = p.spinner()
  spinner.start(`Extending '${baseName}' → ${dest} (branch ${branch})...`)

  try {
    const startPoint =
      (await getCurrentBranch(base.path).catch(() => '')) || 'HEAD'
    await worktreeAdd(base.path, dest, branch, {
      createBranch: true,
      startPoint,
    })
  } catch (error) {
    spinner.stop('Extend failed')
    throw error
  }

  // Git may have stored dereferenced skill dirs; re-link to .agents/skills
  const restored = restoreSkillSymlinks(dest)
  if (restored.length > 0) {
    p.log.message(
      `Restored ${restored.length} skill symlink(s) under agent dirs`
    )
  }

  spinner.stop(`Extended to ${dest}`)

  if (isTemplateNameTaken(name)) {
    unregisterTemplate(name)
  }

  return registerLocalTemplate(dest, {
    name,
    source: 'local',
    extends: baseName,
    branch,
    force: true,
  })
}
