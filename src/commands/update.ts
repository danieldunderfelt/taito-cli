import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
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
  revParse,
} from '../lib/git.js'
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
export async function updateCommand(path: string = '.'): Promise<void> {
  const cwd = resolve(path)

  try {
    if (isTaitoProject(cwd)) {
      await updateProject(cwd)
      return
    }

    // Child template: registered with extends, or template.config has extends
    const child = findChildTemplate(cwd)
    if (child) {
      await updateChildTemplate(cwd, child.baseName, child.basePath)
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

function findChildTemplate(
  dir: string
): { baseName: string; basePath: string } | undefined {
  const registered = listRegisteredTemplates().find(
    (t) => resolve(t.path) === resolve(dir) && t.extends
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
  basePath: string
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

async function updateProject(projectDir: string): Promise<void> {
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
    const oldFiles = collectRelativeFiles(oldSnap.dir)
    const newFiles = collectRelativeFiles(newSnap.dir)
    const allPaths = new Set([...oldFiles, ...newFiles])

    let updated = 0
    let added = 0
    let conflicts = 0

    for (const rel of allPaths) {
      // Never overwrite project meta via merge
      if (rel === '.taito/project.meta.toml') continue

      const basePath = join(oldSnap.dir, rel)
      const theirsPath = join(newSnap.dir, rel)
      const oursPath = join(projectDir, rel)

      const hasBase = existsSync(basePath)
      const hasTheirs = existsSync(theirsPath)
      const hasOurs = existsSync(oursPath)

      const baseContent = hasBase ? readFileSync(basePath) : null
      const theirsContent = hasTheirs ? readFileSync(theirsPath) : null
      const oursContent = hasOurs ? readFileSync(oursPath) : null

      // Deleted in template
      if (hasBase && !hasTheirs) {
        if (hasOurs && oursContent && baseContent && buffersEqual(oursContent, baseContent)) {
          rmSync(oursPath)
          updated++
        }
        // else: user modified — keep ours
        continue
      }

      // Added in template
      if (!hasBase && hasTheirs) {
        if (!hasOurs) {
          mkdirSync(dirname(oursPath), { recursive: true })
          writeFileSync(oursPath, theirsContent!)
          added++
        } else if (
          oursContent &&
          theirsContent &&
          !buffersEqual(oursContent, theirsContent)
        ) {
          const choice = await resolveFileConflict(rel, 'added-both')
          if (choice === 'theirs') {
            writeFileSync(oursPath, theirsContent)
            updated++
          }
          // ours: keep
        }
        continue
      }

      // Unchanged in template
      if (
        baseContent &&
        theirsContent &&
        buffersEqual(baseContent, theirsContent)
      ) {
        continue
      }

      // User never touched it — take theirs
      if (
        !hasOurs ||
        (baseContent && oursContent && buffersEqual(baseContent, oursContent))
      ) {
        mkdirSync(dirname(oursPath), { recursive: true })
        writeFileSync(oursPath, theirsContent!)
        updated++
        continue
      }

      // Three-way merge
      const tmpDir = join(projectDir, '.taito', '.merge-tmp')
      mkdirSync(tmpDir, { recursive: true })
      const tmpOurs = join(tmpDir, 'ours')
      const tmpBase = join(tmpDir, 'base')
      const tmpTheirs = join(tmpDir, 'theirs')
      writeFileSync(tmpOurs, oursContent!)
      writeFileSync(tmpBase, baseContent!)
      writeFileSync(tmpTheirs, theirsContent!)

      const clean = await mergeFile(tmpOurs, tmpBase, tmpTheirs)
      if (clean) {
        writeFileSync(oursPath, readFileSync(tmpOurs))
        updated++
      } else {
        conflicts++
        const choice = await resolveFileConflict(rel, 'merge')
        if (choice === 'ours') {
          // keep ours — already on disk
        } else if (choice === 'theirs') {
          writeFileSync(oursPath, theirsContent!)
        } else {
          // Keep merge-file result with conflict markers for manual edit
          writeFileSync(oursPath, readFileSync(tmpOurs))
          p.log.warn(`Left conflict markers in ${rel}`)
        }
      }

      rmSync(tmpDir, { recursive: true, force: true })
    }

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
      `Updated project: ${updated} changed, ${added} added, ${conflicts} conflicted`
    )
  } finally {
    oldSnap.cleanup()
    newSnap.cleanup()
  }
}

function buffersEqual(a: Buffer, b: Buffer): boolean {
  return a.equals(b)
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
      message: `Conflict in ${file}. Keep which version?`,
      options: [
        { value: 'ours', label: 'Ours (child template)' },
        { value: 'theirs', label: 'Theirs (base template)' },
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

    if (choice === 'ours' || choice === 'theirs') {
      await checkoutFile(repoDir, file, choice)
    }
    // manual: leave markers; still need to add? user will fix — mark resolved only if not manual
    if (choice === 'manual') {
      p.log.warn(`Resolve markers in ${file}, then re-run or git commit`)
    }
  }
}

async function resolveFileConflict(
  file: string,
  _kind: 'merge' | 'added-both'
): Promise<'ours' | 'theirs' | 'merged'> {
  const choice = await p.select({
    message: `Conflict in ${file}. Keep which version?`,
    options: [
      { value: 'ours', label: 'Ours (current project)' },
      { value: 'theirs', label: 'Theirs (new template)' },
      {
        value: 'merged',
        label: 'Keep merge result (may include conflict markers)',
      },
    ],
  })

  if (p.isCancel(choice)) {
    p.cancel('Update cancelled.')
    process.exit(0)
  }

  return choice
}
