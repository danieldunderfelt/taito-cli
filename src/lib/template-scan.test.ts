import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { scanTemplateCandidates } from './template-scan.js'

describe('scanTemplateCandidates', () => {
  test('finds common agent/config files; skips app source, docs, scripts', () => {
    const root = mkdtempSync(join(tmpdir(), 'taito-scan-'))
    mkdirSync(join(root, '.agents', 'skills', 'design'), { recursive: true })
    mkdirSync(join(root, 'docs'), { recursive: true })
    mkdirSync(join(root, 'scripts'), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'CLAUDE.md'), '# claude\n')
    writeFileSync(join(root, 'tsconfig.json'), '{}\n')
    writeFileSync(join(root, '.gitignore'), 'node_modules\n')
    writeFileSync(join(root, '.env'), 'SECRET=1\n')
    writeFileSync(
      join(root, '.agents', 'skills', 'design', 'SKILL.md'),
      '---\nname: design\n---\n'
    )
    writeFileSync(join(root, 'docs', 'PROJECT.md'), 'project docs\n')
    writeFileSync(join(root, 'scripts', 'setup.sh'), '#!/bin/sh\n')
    writeFileSync(join(root, 'src', 'app.ts'), 'export {}\n')
    writeFileSync(join(root, 'README.md'), '# readme\n')

    const result = scanTemplateCandidates(root)
    const paths = new Set(result.candidates.map((c) => c.path))

    expect(paths.has('CLAUDE.md')).toBe(true)
    expect(paths.has('tsconfig.json')).toBe(true)
    expect(paths.has('.agents/skills/design/SKILL.md')).toBe(true)
    expect(paths.has('docs/PROJECT.md')).toBe(false)
    expect(paths.has('scripts/setup.sh')).toBe(false)
    expect(paths.has('src/app.ts')).toBe(false)
    expect(paths.has('README.md')).toBe(false)
    expect(paths.has('.env')).toBe(false)
    expect(result.exclusionPatterns.directories).toContain('node_modules')
    expect(result.excluded.some((e) => e.path === '.env')).toBe(true)
  })
})
