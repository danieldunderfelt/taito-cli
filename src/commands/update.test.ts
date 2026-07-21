import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { planProjectUpdate, type UpdateAction } from './update.js'

let root: string
let project: string
let base: string
let theirs: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'taito-update-plan-'))
  project = join(root, 'project')
  base = join(root, 'base')
  theirs = join(root, 'theirs')
  mkdirSync(project, { recursive: true })
  mkdirSync(base, { recursive: true })
  mkdirSync(theirs, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function write(dir: string, rel: string, content: string): void {
  const path = join(dir, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

async function plan(): Promise<{
  actions: UpdateAction[]
  unchanged: number
  byKind: Map<string, UpdateAction>
}> {
  const result = await planProjectUpdate(project, base, theirs)
  try {
    const byKind = new Map(result.actions.map((a) => [a.rel, a]))
    return { ...result, byKind }
  } finally {
    result.cleanup()
  }
}

describe('planProjectUpdate', () => {
  test('takes the template version when the project never touched the file', async () => {
    write(base, 'a.md', 'v1\n')
    write(theirs, 'a.md', 'v2\n')
    write(project, 'a.md', 'v1\n')

    const { byKind } = await plan()
    const action = byKind.get('a.md')
    expect(action?.kind).toBe('write')
    expect(action?.content?.toString()).toBe('v2\n')
    expect(action?.isNew).toBeFalsy()
  })

  test('does nothing when only the project changed the file', async () => {
    write(base, 'a.md', 'v1\n')
    write(theirs, 'a.md', 'v1\n')
    write(project, 'a.md', 'mine\n')

    const { actions, unchanged } = await plan()
    expect(actions).toHaveLength(0)
    expect(unchanged).toBe(1)
  })

  test('auto-merges non-overlapping changes from both sides', async () => {
    write(base, 'a.md', 'one\ntwo\nthree\nfour\nfive\n')
    write(theirs, 'a.md', 'one\ntwo\nthree\nfour\nfive template\n')
    write(project, 'a.md', 'one project\ntwo\nthree\nfour\nfive\n')

    const { byKind } = await plan()
    const action = byKind.get('a.md')
    expect(action?.kind).toBe('auto-merge')
    expect(action?.content?.toString()).toBe(
      'one project\ntwo\nthree\nfour\nfive template\n'
    )
  })

  test('flags overlapping changes as conflict with markers', async () => {
    write(base, 'a.md', 'one\n')
    write(theirs, 'a.md', 'template\n')
    write(project, 'a.md', 'project\n')

    const { byKind } = await plan()
    const action = byKind.get('a.md')
    expect(action?.kind).toBe('conflict')
    expect(action?.mergedContent).toContain('<<<<<<< project')
    expect(action?.mergedContent).toContain('=======')
    expect(action?.mergedContent).toContain('>>>>>>> template')
  })

  test('deletes files the template deleted and the project kept pristine', async () => {
    write(base, 'a.md', 'v1\n')
    write(project, 'a.md', 'v1\n')

    const { byKind } = await plan()
    expect(byKind.get('a.md')?.kind).toBe('delete')
  })

  test('asks when the template deleted a file the project modified', async () => {
    write(base, 'a.md', 'v1\n')
    write(project, 'a.md', 'mine\n')

    const { byKind } = await plan()
    const action = byKind.get('a.md')
    expect(action?.kind).toBe('deleted-modified')
    expect(action?.baseText).toBe('v1\n')
    expect(action?.oursText).toBe('mine\n')
  })

  test('adds new template files', async () => {
    write(theirs, 'new.md', 'fresh\n')

    const { byKind } = await plan()
    const action = byKind.get('new.md')
    expect(action?.kind).toBe('write')
    expect(action?.isNew).toBe(true)
  })

  test('merges against an empty base when both sides have a new file', async () => {
    write(theirs, 'new.md', 'template version\n')
    write(project, 'new.md', 'project version\n')

    const { byKind } = await plan()
    const action = byKind.get('new.md')
    expect(action?.kind).toBe('conflict')
    expect(action?.mergedContent).toContain('project version')
    expect(action?.mergedContent).toContain('template version')
  })

  test('asks when the project deleted a file the template changed', async () => {
    write(base, 'a.md', 'v1\n')
    write(theirs, 'a.md', 'v2\n')

    const { byKind } = await plan()
    const action = byKind.get('a.md')
    expect(action?.kind).toBe('modified-deleted')
    expect(action?.theirsContent?.toString()).toBe('v2\n')
  })

  test('skips files that are already identical', async () => {
    write(base, 'a.md', 'v1\n')
    write(theirs, 'a.md', 'v2\n')
    write(project, 'a.md', 'v2\n')

    const { actions } = await plan()
    expect(actions).toHaveLength(0)
  })

  test('ignores .taito/project.meta.toml', async () => {
    write(base, '.taito/project.meta.toml', 'old\n')
    write(theirs, '.taito/project.meta.toml', 'new\n')
    write(project, '.taito/project.meta.toml', 'old\n')

    const { actions } = await plan()
    expect(actions).toHaveLength(0)
  })

  test('no action when the merge result equals the project content', async () => {
    // Template reorders content the project already rewrote identically
    write(base, 'a.md', 'x\ny\nz\n')
    write(theirs, 'a.md', 'x\ny changed\nz\n')
    write(project, 'a.md', 'x\ny changed\nz\nw\n')

    const { byKind } = await plan()
    const action = byKind.get('a.md')
    // project == base + extra line → clean merge adding nothing new
    expect(action === undefined || action.kind === 'auto-merge').toBe(true)
    if (action?.kind === 'auto-merge') {
      expect(action.content?.toString()).toBe(
        readFileSync(join(project, 'a.md'), 'utf-8')
      )
    }
  })
})
