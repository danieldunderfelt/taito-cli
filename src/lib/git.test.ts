import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  addAllAndCommit,
  initRepo,
  mergeTreeDryRun,
} from './git.js'

let root: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'taito-git-'))
  await initRepo(root)
  writeFileSync(join(root, 'f.md'), 'a\nb\nc\n')
  await addAllAndCommit(root, 'base')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

async function checkout(args: string[]): Promise<void> {
  await $`git checkout ${args}`.cwd(root).quiet()
}

describe('mergeTreeDryRun', () => {
  test('reports conflicts without touching the working tree', async () => {
    await checkout(['-b', 'side'])
    writeFileSync(join(root, 'f.md'), 'a side\nb\nc\n')
    await addAllAndCommit(root, 'side change')
    await checkout(['-']) // back to the default branch
    writeFileSync(join(root, 'f.md'), 'a main\nb\nc\n')
    await addAllAndCommit(root, 'main change')

    const result = await mergeTreeDryRun(root, 'side')
    expect(result.clean).toBe(false)
    expect(result.conflicts).toEqual(['f.md'])

    // Working tree untouched
    expect(await $`git status --porcelain`.cwd(root).text()).toBe('')
  })

  test('reports clean merges', async () => {
    await checkout(['-b', 'side'])
    writeFileSync(join(root, 'f.md'), 'a\nb\nc side\n')
    await addAllAndCommit(root, 'side change')
    await checkout(['-'])
    writeFileSync(join(root, 'g.md'), 'new\n')
    mkdirSync(join(root, 'sub'), { recursive: true })
    await addAllAndCommit(root, 'main change')

    const result = await mergeTreeDryRun(root, 'side')
    expect(result.clean).toBe(true)
    expect(result.conflicts).toEqual([])
  })
})
