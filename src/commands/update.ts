import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

import * as p from '@clack/prompts'

import {
  parseProjectMeta,
} from '../lib/config.js'
import {
  getProjectMetaPath,
  isTemplate,
  isTaitoProject,
} from '../lib/classify.js'
import {
  abortMerge,
  checkoutFile,
  continueMerge,
  fetchOrigin,
  getCurrentBranch,
  mergeBranch,
  mergeFile,
  mergeTreeDryRun,
  revParse,
  stageFile,
} from '../lib/git.js'
import {
  isInteractive,
  looksBinary,
  resolveChunksInteractively,
  showDiff,
} from '../lib/merge-conflicts.js'
import {
  getRegisteredTemplate,
  listRegisteredTemplates,
} from '../lib/registry.js'
import {
  collectMissingTemplateInputs,
  materializeTemplateAtRef,
  writeProjectMeta,
} from '../lib/template-materialize.js'

/**
 * Update a project or child template from its base template
 */
export async function updateCommand(
  path: string = '.',
  options: { dryRun?: boolean } = {}
): Promise<void> {
  const cwd = resolve(path)

  try {
    if (isTaitoProject(cwd)) {
      await updateProject(cwd, options)
      return
    }

    // Child template: registered with extends, or template.config has extends
    const child = findChildTemplate(cwd)
    if (child) {
      await updateChildTemplate(cwd, child.baseName, child.basePath, options)
      return
    }

    p.log.error(
      'Not a taito project or child template.\n' +
        'Expected .taito/project.meta.toml, or a registered template that extends another.'
    )
    process.exit(1)
  } catch (error) {
    const err = error as Error
    p.log.error(err.message)
    process.exit(1)
  }
}

/**
 * Path equality that survives symlinks: process.cwd() returns the physical
 * path while the registry stores the logical one (e.g. /tmp on macOS).
 */
function samePath(a: string, b: string): boolean {
  const ra = resolve(a)
  const rb = resolve(b)
  if (ra === rb) return true
  try {
    return realpathSync(ra) === realpathSync(rb)
  } catch {
    return false
  }
}

function findChildTemplate(
  dir: string
): { baseName: string; basePath: string } | undefined {
  const registered = listRegisteredTemplates().find(
    (t) => samePath(t.path, dir) && t.extends
  )
  if (registered?.extends) {
    const base = getRegisteredTemplate(registered.extends)
    if (!base) {
      throw new Error(
        `Parent template '${registered.extends}' is not registered`
      )
    }
    return { baseName: registered.extends, basePath: base.path }
  }

  // Also allow unregistered child that is a template with meta.extends
  if (isTemplate(dir)) {
    // Check registry for any entry whose path matches and has extends — already done
    // Fallback: look up by matching path in registry only
  }

  return undefined
}

async function updateChildTemplate(
  childDir: string,
  baseName: string,
  basePath: string,
  options: { dryRun?: boolean } = {}
): Promise<void> {
  const spinner = p.spinner()
  const base = getRegisteredTemplate(baseName)
  if (!base) {
    throw new Error(`Base template '${baseName}' not found in registry`)
  }

  // Fetch if github-sourced
  if (base.source.startsWith('github:')) {
    spinner.start('Fetching base template updates...')
    try {
      await fetchOrigin(basePath)
      spinner.stop('Fetched')
    } catch {
      spinner.stop('Fetch skipped (no remote or offline)')
    }
  }

  let baseBranch: string
  try {
    baseBranch = await getCurrentBranch(basePath)
    if (!baseBranch) {
      // Detached or main worktree on another branch — use main/master
      baseBranch = 'main'
    }
  } catch {
    baseBranch = 'main'
  }

  // For worktrees, merge the base branch tip into the child
  // Prefer merging origin/baseBranch if fetched, else local baseBranch
  const mergeRef = base.source.startsWith('github:')
    ? `origin/${baseBranch}`
    : baseBranch

  // When base is a separate path (same repo for worktrees), merge from that branch name
  // Child worktree shares repo — merge branch name used at base
  p.log.info(`Merging '${mergeRef}' into child template...`)

  if (options.dryRun) {
    const baseHead = await revParse(basePath, 'HEAD')
    const preview = await mergeTreeDryRun(childDir, baseHead)
    if (preview.clean) {
      p.log.info('Dry run — the merge would apply cleanly; nothing was changed.')
    } else {
      p.log.info('Dry run — nothing was changed.')
      p.log.warn(
        `The merge would conflict in ${preview.conflicts.length} file(s):\n` +
          preview.conflicts.map((f) => `  - ${f}`).join('\n')
      )
    }
    return
  }

  spinner.start('Merging...')
  let conflicts: string[]
  try {
    // Use the branch that the base template's primary worktree is on.
    // For local extends, the base path IS the main worktree; child is on taito/<name>.
    // Merge the commit currently at basePath HEAD into child.
    const baseHead = await revParse(basePath, 'HEAD')
    const result = await mergeBranch(childDir, baseHead)
    conflicts = result.conflicts
    spinner.stop(conflicts.length ? 'Merge has conflicts' : 'Merge complete')
  } catch (error) {
    spinner.stop('Merge failed')
    throw error
  }

  if (conflicts.length > 0) {
    await resolveConflictsInteractively(childDir, conflicts)
    await continueMerge(childDir)
    p.log.success('Conflicts resolved; child template updated')
  } else {
    p.log.success(`Child template updated from '${baseName}'`)
  }
}

// --- Project update: plan → resolve → apply -------------------------------

export type UpdateActionKind =
  | 'write' // take the template version (new file, or project never touched it)
  | 'delete' // template deleted the file, project never touched it
  | 'auto-merge' // clean three-way merge
  | 'conflict' // both sides changed; needs user resolution
  | 'deleted-modified' // template deleted it, project modified it
  | 'modified-deleted' // template changed it, project deleted it

export interface UpdateAction {
  rel: string
  kind: UpdateActionKind
  /** True when the file does not exist in the project (for summaries) */
  isNew?: boolean
  /** Content to write in the apply phase (set after resolution for conflicts) */
  content?: Buffer
  /** Merged content with conflict markers, before resolution */
  mergedContent?: string
  /** Template version, kept for whole-file/binary choices */
  theirsContent?: Buffer
  /** Baseline + project content for diff display (deleted-modified) */
  baseText?: string
  oursText?: string
  /** Resolution for deleted-modified */
  delete?: boolean
}

function needsResolution(action: UpdateAction): boolean {
  return (
    action.kind === 'conflict' ||
    action.kind === 'deleted-modified' ||
    action.kind === 'modified-deleted'
  )
}

/**
 * Compare project files against rendered template snapshots (old/new) and
 * decide what to do with each file. Writes nothing to the project.
 */
export async function planProjectUpdate(
  projectDir: string,
  baseDir: string,
  theirsDir: string
): Promise<{
  actions: UpdateAction[]
  unchanged: number
  cleanup: () => void
}> {
  const oldFiles = collectRelativeFiles(baseDir)
  const newFiles = collectRelativeFiles(theirsDir)
  const allPaths = new Set([...oldFiles, ...newFiles])

  const tmpDir = mkdtempSync(join(tmpdir(), 'taito-merge-'))
  const actions: UpdateAction[] = []
  let unchanged = 0

  try {
    for (const rel of allPaths) {
      // Never overwrite project meta via merge
      if (rel === '.taito/project.meta.toml') continue

      const basePath = join(baseDir, rel)
      const theirsPath = join(theirsDir, rel)
      const oursPath = join(projectDir, rel)

      const hasBase = existsSync(basePath)
      const hasTheirs = existsSync(theirsPath)
      const hasOurs = existsSync(oursPath)

      const baseContent = hasBase ? readFileSync(basePath) : null
      const theirsContent = hasTheirs ? readFileSync(theirsPath) : null
      const oursContent = hasOurs ? readFileSync(oursPath) : null

      // Deleted in template
      if (hasBase && !hasTheirs) {
        if (!hasOurs || !oursContent || !baseContent) {
          unchanged++
        } else if (oursContent.equals(baseContent)) {
          actions.push({ rel, kind: 'delete' })
        } else {
          actions.push({
            rel,
            kind: 'deleted-modified',
            baseText: baseContent.toString('utf-8'),
            oursText: oursContent.toString('utf-8'),
          })
        }
        continue
      }

      // Added in template
      if (!hasBase && theirsContent) {
        if (!hasOurs || !oursContent) {
          actions.push({
            rel,
            kind: 'write',
            content: theirsContent,
            isNew: true,
          })
        } else if (oursContent.equals(theirsContent)) {
          unchanged++
        } else {
          // Both have content at a new path — merge against an empty base
          const action = await mergeContents(
            tmpDir,
            rel,
            oursContent,
            Buffer.alloc(0),
            theirsContent
          )
          if (action) actions.push(action)
          else unchanged++
        }
        continue
      }

      // Unchanged in template
      if (
        !baseContent ||
        !theirsContent ||
        baseContent.equals(theirsContent)
      ) {
        unchanged++
        continue
      }

      // Deleted in the project
      if (!hasOurs || !oursContent) {
        actions.push({
          rel,
          kind: 'modified-deleted',
          theirsContent,
        })
        continue
      }

      // Project never touched it — take theirs
      if (baseContent.equals(oursContent)) {
        actions.push({ rel, kind: 'write', content: theirsContent })
        continue
      }

      // Both sides changed — three-way merge
      const action = await mergeContents(
        tmpDir,
        rel,
        oursContent,
        baseContent,
        theirsContent
      )
      if (action) actions.push(action)
      else unchanged++
    }
  } catch (error) {
    rmSync(tmpDir, { recursive: true, force: true })
    throw error
  }

  return {
    actions,
    unchanged,
    cleanup: () => rmSync(tmpDir, { recursive: true, force: true }),
  }
}

async function mergeContents(
  tmpDir: string,
  rel: string,
  ours: Buffer,
  base: Buffer,
  theirs: Buffer
): Promise<UpdateAction | null> {
  if (looksBinary(ours) || looksBinary(base) || looksBinary(theirs)) {
    return { rel, kind: 'conflict', theirsContent: theirs }
  }

  const safe = rel.replace(/[^a-zA-Z0-9._-]/g, '_')
  const tmpOurs = join(tmpDir, `${safe}.ours`)
  const tmpBase = join(tmpDir, `${safe}.base`)
  const tmpTheirs = join(tmpDir, `${safe}.theirs`)
  writeFileSync(tmpOurs, ours)
  writeFileSync(tmpBase, base)
  writeFileSync(tmpTheirs, theirs)

  const clean = await mergeFile(tmpOurs, tmpBase, tmpTheirs, {
    ours: 'project',
    base: 'template (old)',
    theirs: 'template',
  })
  const merged = readFileSync(tmpOurs)

  // Merge produced what the project already has — nothing to do
  if (merged.equals(ours)) return null

  if (clean) {
    return { rel, kind: 'auto-merge', content: merged }
  }
  return { rel, kind: 'conflict', mergedContent: merged.toString('utf-8') }
}

const PROJECT_LABELS = { ours: 'project', theirs: 'template' }

/**
 * Walk every action that needs a decision and prompt the user.
 * Mutates the actions with the chosen outcome. Returns false on cancel.
 */
async function resolveActions(actions: UpdateAction[]): Promise<boolean> {
  for (const action of actions) {
    if (action.kind === 'conflict') {
      if (action.mergedContent === undefined) {
        // Binary or otherwise unmergeable — whole-file choice
        const choice = await p.select({
          message: `${action.rel} differs and cannot be merged. Keep which version?`,
          options: [
            { value: 'ours', label: 'Keep project version' },
            { value: 'theirs', label: 'Use template version' },
          ],
        })
        if (p.isCancel(choice)) return false
        if (choice === 'theirs') action.content = action.theirsContent
        continue
      }

      const result = await resolveChunksInteractively(
        action.rel,
        action.mergedContent,
        PROJECT_LABELS
      )
      if (result.action === 'cancel') return false
      action.content = Buffer.from(result.content, 'utf-8')
      if (result.hasMarkers) {
        p.log.warn(`Left conflict markers in ${action.rel}`)
      }
      continue
    }

    if (action.kind === 'deleted-modified') {
      for (;;) {
        const choice = await p.select({
          message: `The template deleted ${action.rel}, but you changed it. What do you want to do?`,
          options: [
            { value: 'keep', label: 'Keep your version' },
            { value: 'delete', label: 'Delete it (match the template)' },
            { value: 'diff', label: 'Show your changes first' },
          ],
        })
        if (p.isCancel(choice)) return false
        if (choice === 'diff') {
          showDiff(
            `${action.rel}: template baseline → your version`,
            action.baseText ?? '',
            action.oursText ?? '',
            { ours: 'baseline', theirs: 'yours' }
          )
          continue
        }
        action.delete = choice === 'delete'
        break
      }
      continue
    }

    if (action.kind === 'modified-deleted') {
      const choice = await p.select({
        message: `The template changed ${action.rel}, but you deleted it. What do you want to do?`,
        options: [
          { value: 'keep', label: 'Keep it deleted' },
          { value: 'restore', label: 'Restore the template version' },
        ],
      })
      if (p.isCancel(choice)) return false
      if (choice === 'restore') action.content = action.theirsContent
    }
  }
  return true
}

interface UpdateOutcome {
  updated: string[]
  added: string[]
  deleted: string[]
  merged: string[]
  resolved: string[]
  kept: string[]
}

function applyActions(projectDir: string, actions: UpdateAction[]): UpdateOutcome {
  const outcome: UpdateOutcome = {
    updated: [],
    added: [],
    deleted: [],
    merged: [],
    resolved: [],
    kept: [],
  }

  for (const action of actions) {
    const oursPath = join(projectDir, action.rel)

    if (action.kind === 'delete') {
      rmSync(oursPath, { force: true })
      outcome.deleted.push(action.rel)
      continue
    }

    if (action.kind === 'deleted-modified') {
      if (action.delete) {
        rmSync(oursPath, { force: true })
        outcome.deleted.push(action.rel)
      } else {
        outcome.kept.push(action.rel)
      }
      continue
    }

    if (action.kind === 'modified-deleted') {
      if (action.content) {
        mkdirSync(dirname(oursPath), { recursive: true })
        writeFileSync(oursPath, action.content)
        outcome.updated.push(action.rel)
      } else {
        outcome.kept.push(action.rel)
      }
      continue
    }

    if (!action.content) continue

    mkdirSync(dirname(oursPath), { recursive: true })
    writeFileSync(oursPath, action.content)

    if (action.kind === 'auto-merge') {
      outcome.merged.push(action.rel)
    } else if (action.kind === 'conflict') {
      outcome.resolved.push(action.rel)
    } else if (action.isNew) {
      outcome.added.push(action.rel)
    } else {
      outcome.updated.push(action.rel)
    }
  }

  return outcome
}

function logOutcome(outcome: UpdateOutcome): void {
  const groups: [string, string[]][] = [
    ['Updated', outcome.updated],
    ['Added', outcome.added],
    ['Auto-merged', outcome.merged],
    ['Resolved', outcome.resolved],
    ['Deleted', outcome.deleted],
    ['Kept your version', outcome.kept],
  ]
  for (const [label, files] of groups) {
    if (files.length > 0) {
      p.log.message(`  ${label}: ${files.join(', ')}`)
    }
  }
}

const RESOLUTION_REASONS: Record<string, string> = {
  conflict: 'both sides changed it',
  'deleted-modified': 'deleted in the template, you changed it',
  'modified-deleted': 'changed in the template, you deleted it',
}

function printDryRun(actions: UpdateAction[]): void {
  const groups: [string, string[]][] = [
    [
      'Would update',
      actions
        .filter((a) => a.kind === 'write' && !a.isNew)
        .map((a) => a.rel),
    ],
    [
      'Would add',
      actions.filter((a) => a.kind === 'write' && a.isNew).map((a) => a.rel),
    ],
    [
      'Would auto-merge',
      actions.filter((a) => a.kind === 'auto-merge').map((a) => a.rel),
    ],
    [
      'Would delete',
      actions.filter((a) => a.kind === 'delete').map((a) => a.rel),
    ],
  ]

  let any = false
  for (const [label, files] of groups) {
    if (files.length > 0) {
      any = true
      p.log.message(`  ${label}: ${files.join(', ')}`)
    }
  }

  const resolvable = actions.filter(needsResolution)
  if (resolvable.length > 0) {
    any = true
    p.log.message('  Would ask you to resolve:')
    for (const action of resolvable) {
      const reason = RESOLUTION_REASONS[action.kind] ?? 'needs resolution'
      p.log.message(`    - ${action.rel} (${reason})`)
    }
  }

  if (!any) {
    p.log.message('  Nothing would change.')
  }
}

async function updateProject(
  projectDir: string,
  options: { dryRun?: boolean } = {}
): Promise<void> {
  const spinner = p.spinner()
  const meta = parseProjectMeta(getProjectMetaPath(projectDir))
  const template =
    getRegisteredTemplate(meta.project.template) ??
    (existsSync(meta.project.templatePath)
      ? {
          name: meta.project.template,
          path: meta.project.templatePath,
          source: 'local',
          addedAt: '',
        }
      : undefined)

  if (!template || !existsSync(template.path)) {
    throw new Error(
      `Template '${meta.project.template}' not found. Re-register with: taito add <path>`
    )
  }

  if (template.source.startsWith('github:')) {
    spinner.start('Fetching template updates...')
    try {
      await fetchOrigin(template.path)
      spinner.stop('Fetched')
    } catch {
      spinner.stop('Fetch skipped')
    }
  }

  const oldCommit = meta.project.templateCommit
  const newCommit = await revParse(template.path, 'HEAD')

  if (oldCommit === newCommit) {
    p.log.info('Already up to date.')
    return
  }

  p.log.info(
    `Updating ${oldCommit.slice(0, 7)} → ${newCommit.slice(0, 7)}...`
  )

  // Prompt for any variables/components added to the template since last apply/create
  const { values, components, prompted } = await collectMissingTemplateInputs(
    template.path,
    {
      values: meta.variables,
      components: meta.components,
    }
  )
  if (prompted.variables.length > 0 || prompted.components.length > 0) {
    const parts = [
      ...prompted.variables.map((k) => `variable ${k}`),
      ...prompted.components.map((k) => `component ${k}`),
    ]
    p.log.info(`Collected new customization: ${parts.join(', ')}`)
  }

  spinner.start('Rendering template snapshots...')
  const oldSnap = await materializeTemplateAtRef(
    template.path,
    oldCommit,
    values,
    components
  )
  const newSnap = await materializeTemplateAtRef(
    template.path,
    newCommit,
    values,
    components
  )
  spinner.stop('Snapshots ready')

  try {
    const plan = await planProjectUpdate(projectDir, oldSnap.dir, newSnap.dir)

    try {
      const resolvable = plan.actions.filter(needsResolution)
      const autoCount =
        plan.actions.filter((a) => a.kind === 'auto-merge').length
      const writeCount = plan.actions.filter(
        (a) => a.kind === 'write' && !a.isNew
      ).length
      const addCount = plan.actions.filter(
        (a) => a.kind === 'write' && a.isNew
      ).length
      const deleteCount = plan.actions.filter(
        (a) => a.kind === 'delete'
      ).length

      const parts: string[] = []
      if (writeCount > 0) parts.push(`${writeCount} to update`)
      if (addCount > 0) parts.push(`${addCount} to add`)
      if (autoCount > 0) parts.push(`${autoCount} auto-merged`)
      if (deleteCount > 0) parts.push(`${deleteCount} to delete`)
      if (resolvable.length > 0) {
        parts.push(`${resolvable.length} need${resolvable.length === 1 ? 's' : ''} resolution`)
      }
      p.log.info(
        parts.length > 0 ? `Plan: ${parts.join(', ')}` : 'Nothing to change.'
      )

      if (options.dryRun) {
        printDryRun(plan.actions)
        p.log.info('Dry run — no files were changed.')
        return
      }

      if (resolvable.length > 0) {
        if (!isInteractive()) {
          // Non-interactive: apply what is safe, leave conflicts for a rerun
          const safe = plan.actions.filter((a) => !needsResolution(a))
          const outcome = applyActions(projectDir, safe)
          logOutcome(outcome)
          p.log.warn(
            `${resolvable.length} file(s) need resolution and were left untouched:\n` +
              resolvable.map((a) => `  - ${a.rel}`).join('\n') +
              '\nRun `taito update` in a terminal to resolve them.'
          )
          return
        }

        const completed = await resolveActions(resolvable)
        if (!completed) {
          p.log.warn('Update aborted; no files were changed.')
          return
        }
      }

      const outcome = applyActions(projectDir, plan.actions)

      writeProjectMeta(projectDir, {
        ...meta,
        project: {
          ...meta.project,
          templatePath: template.path,
          templateCommit: newCommit,
        },
        variables: values,
        components,
      })

      p.log.success(
        `Updated project: ${oldCommit.slice(0, 7)} → ${newCommit.slice(0, 7)}`
      )
      logOutcome(outcome)
    } finally {
      plan.cleanup()
    }
  } finally {
    oldSnap.cleanup()
    newSnap.cleanup()
  }
}

function collectRelativeFiles(dir: string): string[] {
  const files: string[] = []

  function walk(current: string): void {
    for (const entry of readdirSync(current)) {
      if (entry === '.git') continue
      const full = join(current, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        walk(full)
      } else {
        files.push(relative(dir, full).replace(/\\/g, '/'))
      }
    }
  }

  if (existsSync(dir)) {
    walk(dir)
  }
  return files
}

async function resolveConflictsInteractively(
  repoDir: string,
  conflicts: string[]
): Promise<void> {
  for (const file of conflicts) {
    const choice = await p.select({
      message: `Conflict in ${file}. How do you want to resolve it?`,
      options: [
        { value: 'chunks', label: 'Resolve chunk by chunk' },
        { value: 'ours', label: 'Keep child template version (ours)' },
        { value: 'theirs', label: 'Take base template version (theirs)' },
        {
          value: 'manual',
          label: 'Leave conflict markers for manual edit',
        },
      ],
    })

    if (p.isCancel(choice)) {
      await abortMerge(repoDir)
      p.cancel('Update aborted.')
      process.exit(0)
    }

    if (choice === 'chunks') {
      const content = readFileSync(join(repoDir, file), 'utf-8')
      const result = await resolveChunksInteractively(file, content, {
        ours: 'child template',
        theirs: 'base template',
      })
      if (result.action === 'cancel') {
        await abortMerge(repoDir)
        p.cancel('Update aborted.')
        process.exit(0)
      }
      writeFileSync(join(repoDir, file), result.content)
      await stageFile(repoDir, file)
      if (result.hasMarkers) {
        p.log.warn(`Left conflict markers in ${file}`)
      }
    } else if (choice === 'ours' || choice === 'theirs') {
      await checkoutFile(repoDir, file, choice)
    } else {
      // Leave markers in place but stage the file so the merge can complete
      await stageFile(repoDir, file)
      p.log.warn(`Resolve markers in ${file} later, then commit the fix`)
    }
  }
}
