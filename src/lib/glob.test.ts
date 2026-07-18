import { describe, expect, test } from 'bun:test'

import { matchAnyGlob, matchGlob } from './glob.js'

describe('matchGlob', () => {
  test('matches exact path', () => {
    expect(matchGlob('docs/PROJECT.md', 'docs/PROJECT.md')).toBe(true)
  })

  test('matches ** globs', () => {
    expect(matchGlob('docs/**', 'docs/architecture/foo.md')).toBe(true)
    expect(matchGlob('docs/**', 'docs')).toBe(true)
    expect(matchGlob('docs/**', 'src/foo.ts')).toBe(false)
  })

  test('matches single-segment *', () => {
    expect(matchGlob('docs/*.md', 'docs/PROJECT.md')).toBe(true)
    expect(matchGlob('docs/*.md', 'docs/a/b.md')).toBe(false)
  })

  test('matchAnyGlob', () => {
    expect(
      matchAnyGlob(['docs/**', 'src/**'], 'docs/architecture/x.md')
    ).toBe(true)
    expect(matchAnyGlob(['docs/**'], 'README.md')).toBe(false)
  })
})
