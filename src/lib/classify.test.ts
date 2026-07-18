import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { classifySource, isTemplate, isTaitoProject } from './classify.js'

const temps: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'taito-test-'))
  temps.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('classifySource', () => {
  test('detects template', () => {
    const dir = tempDir()
    mkdirSync(join(dir, '.taito'), { recursive: true })
    writeFileSync(
      join(dir, '.taito', 'template.config.toml'),
      '[meta]\nname = "t"\n'
    )
    expect(isTemplate(dir)).toBe(true)
    expect(classifySource(dir)).toBe('template')
  })

  test('detects skill', () => {
    const dir = tempDir()
    const skillDir = join(dir, 'my-skill')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: my-skill\n---\n')
    expect(classifySource(dir)).toBe('skill')
  })

  test('template takes precedence over skills', () => {
    const dir = tempDir()
    mkdirSync(join(dir, '.taito'), { recursive: true })
    writeFileSync(
      join(dir, '.taito', 'template.config.toml'),
      '[meta]\nname = "t"\n'
    )
    mkdirSync(join(dir, 'skill'), { recursive: true })
    writeFileSync(join(dir, 'skill', 'SKILL.md'), '---\nname: s\n---\n')
    expect(classifySource(dir)).toBe('template')
  })

  test('unknown when empty', () => {
    const dir = tempDir()
    expect(classifySource(dir)).toBe('unknown')
  })

  test('detects project meta', () => {
    const dir = tempDir()
    mkdirSync(join(dir, '.taito'), { recursive: true })
    writeFileSync(
      join(dir, '.taito', 'project.meta.toml'),
      '[project]\ntemplate = "t"\n'
    )
    expect(isTaitoProject(dir)).toBe(true)
  })
})
