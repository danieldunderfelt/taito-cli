import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  copyTreePreservingSymlinks,
  ensureSkillSymlink,
  getDefaultAgentSelection,
  getDetectedAgents,
  getSelectableAgents,
  getSymlinkAgents,
  resolveAgentType,
  restoreSkillSymlinks,
} from './paths.js'

describe('agent selection and symlinks', () => {
  test('resolveAgentType maps amp/goose/.agents to agents', () => {
    expect(resolveAgentType('amp')).toBe('agents')
    expect(resolveAgentType('goose')).toBe('agents')
    expect(resolveAgentType('.agents')).toBe('agents')
    expect(resolveAgentType('claude')).toBe('claudeCode')
    expect(resolveAgentType('claude-code')).toBe('claudeCode')
  })

  test('getSelectableAgents always returns the full agent list', () => {
    const root = mkdtempSync(join(tmpdir(), 'taito-agents-empty-'))
    const selectable = getSelectableAgents(root)
    expect(selectable).toContain('agents')
    expect(selectable).toContain('claudeCode')
    expect(selectable).toContain('cursor')
    expect(selectable).not.toContain('amp' as never)
    expect(selectable.length).toBeGreaterThan(5)
  })

  test('getDetectedAgents / getDefaultAgentSelection pre-select markers', () => {
    const root = mkdtempSync(join(tmpdir(), 'taito-agents-detect-'))
    mkdirSync(join(root, '.claude'), { recursive: true })
    mkdirSync(join(root, '.cursor'), { recursive: true })

    expect(getDetectedAgents(root)).toEqual(['claudeCode', 'cursor'])
    expect(getDefaultAgentSelection(root)).toEqual([
      'agents',
      'claudeCode',
      'cursor',
    ])
    expect(getSymlinkAgents(getDefaultAgentSelection(root))).toEqual([
      'claudeCode',
      'cursor',
    ])
  })

  test('getDefaultAgentSelection defaults to .agents with no markers', () => {
    const root = mkdtempSync(join(tmpdir(), 'taito-agents-none-'))
    expect(getDetectedAgents(root)).toEqual([])
    expect(getDefaultAgentSelection(root)).toEqual(['agents'])
  })

  test('ensureSkillSymlink links agent path to canonical', () => {
    const root = mkdtempSync(join(tmpdir(), 'taito-link-'))
    const canonical = join(root, '.agents', 'skills', 'demo')
    const link = join(root, '.claude', 'skills', 'demo')
    mkdirSync(canonical, { recursive: true })
    writeFileSync(join(canonical, 'SKILL.md'), '---\nname: demo\n---\n')

    ensureSkillSymlink(canonical, link)
    const target = readlinkSync(link)
    expect(target.includes('.agents')).toBe(true)
  })

  test('copyTreePreservingSymlinks keeps skill symlinks', () => {
    const src = mkdtempSync(join(tmpdir(), 'taito-copy-src-'))
    const dest = mkdtempSync(join(tmpdir(), 'taito-copy-dest-'))

    const canonical = join(src, '.agents', 'skills', 'demo')
    mkdirSync(canonical, { recursive: true })
    writeFileSync(join(canonical, 'SKILL.md'), '---\nname: demo\n---\n')
    ensureSkillSymlink(canonical, join(src, '.claude', 'skills', 'demo'))

    copyTreePreservingSymlinks(src, dest)
    const destLink = join(dest, '.claude', 'skills', 'demo')
    expect(lstatSync(destLink).isSymbolicLink()).toBe(true)
    expect(readlinkSync(destLink).includes('.agents')).toBe(true)
  })

  test('restoreSkillSymlinks re-links dereferenced agent skill dirs', () => {
    const root = mkdtempSync(join(tmpdir(), 'taito-restore-'))
    const canonical = join(root, '.agents', 'skills', 'demo')
    mkdirSync(canonical, { recursive: true })
    writeFileSync(join(canonical, 'SKILL.md'), '---\nname: demo\n---\n')

    // Simulate a bad copy that followed the symlink
    const badCopy = join(root, '.claude', 'skills', 'demo')
    mkdirSync(badCopy, { recursive: true })
    writeFileSync(join(badCopy, 'SKILL.md'), '---\nname: demo\n---\n')

    const restored = restoreSkillSymlinks(root)
    expect(restored).toContain('.claude/skills/demo')
    expect(lstatSync(badCopy).isSymbolicLink()).toBe(true)
  })
})
