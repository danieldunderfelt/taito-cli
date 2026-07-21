import { describe, expect, test } from 'bun:test'

import {
  buildResolvedContent,
  countConflicts,
  looksBinary,
  parseConflictSegments,
  simpleLineDiff,
} from './merge-conflicts.js'

describe('parseConflictSegments', () => {
  test('returns null without markers', () => {
    expect(parseConflictSegments('just\nsome\ntext\n')).toBeNull()
  })

  test('parses a single hunk with labels', () => {
    const content = [
      'before',
      '<<<<<<< project',
      'mine',
      '=======',
      'yours',
      '>>>>>>> template',
      'after',
      '',
    ].join('\n')

    const segments = parseConflictSegments(content)
    expect(segments).not.toBeNull()
    expect(countConflicts(segments!)).toBe(1)

    const conflict = segments!.find((s) => s.type === 'conflict')
    expect(conflict?.type).toBe('conflict')
    if (conflict?.type === 'conflict') {
      expect(conflict.hunk.ours).toEqual(['mine'])
      expect(conflict.hunk.theirs).toEqual(['yours'])
      expect(conflict.hunk.oursLabel).toBe('project')
      expect(conflict.hunk.theirsLabel).toBe('template')
    }
  })

  test('parses multiple hunks and keeps text between them', () => {
    const content = [
      'a',
      '<<<<<<< ours',
      'b1',
      '=======',
      'b2',
      '>>>>>>> theirs',
      'middle',
      '<<<<<<< ours',
      'c1',
      '=======',
      'c2',
      '>>>>>>> theirs',
      'z',
    ].join('\n')

    const segments = parseConflictSegments(content)!
    expect(countConflicts(segments)).toBe(2)
    const texts = segments.filter((s) => s.type === 'text')
    expect(texts.map((t) => (t.type === 'text' ? t.lines.join(',') : ''))).toEqual([
      'a',
      'middle',
      'z',
    ])
  })

  test('handles diff3 base sections', () => {
    const content = [
      '<<<<<<< ours',
      'mine',
      '||||||| base',
      'original',
      '=======',
      'yours',
      '>>>>>>> theirs',
    ].join('\n')

    const segments = parseConflictSegments(content)!
    expect(countConflicts(segments)).toBe(1)
    const conflict = segments.find((s) => s.type === 'conflict')
    if (conflict?.type === 'conflict') {
      expect(conflict.hunk.ours).toEqual(['mine'])
      expect(conflict.hunk.theirs).toEqual(['yours'])
    }
  })

  test('treats unterminated markers as plain text', () => {
    const content = '<<<<<<< ours\nmine\nno end\n'
    expect(parseConflictSegments(content)).toBeNull()
  })
})

describe('buildResolvedContent', () => {
  const content = [
    'start',
    '<<<<<<< project',
    'o1',
    'o2',
    '=======',
    't1',
    '>>>>>>> template',
    'mid',
    '<<<<<<< project',
    'x',
    '=======',
    'y',
    '>>>>>>> template',
    'end',
  ].join('\n')

  test('ours + theirs', () => {
    const segments = parseConflictSegments(content)!
    expect(buildResolvedContent(segments, ['ours', 'theirs'])).toBe(
      ['start', 'o1', 'o2', 'mid', 'y', 'end'].join('\n')
    )
  })

  test('both keeps ours first', () => {
    const segments = parseConflictSegments(content)!
    expect(buildResolvedContent(segments, ['both', 'both'])).toBe(
      ['start', 'o1', 'o2', 't1', 'mid', 'x', 'y', 'end'].join('\n')
    )
  })

  test('markers round-trips with labels', () => {
    const segments = parseConflictSegments(content)!
    expect(buildResolvedContent(segments, ['markers', 'markers'])).toBe(content)
  })
})

describe('simpleLineDiff', () => {
  test('marks removed, added and common lines', () => {
    const diff = simpleLineDiff('a\nb\nc\n', 'a\nx\nc\n')
    expect(diff).toEqual([
      { type: ' ', line: 'a' },
      { type: '-', line: 'b' },
      { type: '+', line: 'x' },
      { type: ' ', line: 'c' },
      { type: ' ', line: '' },
    ])
  })

  test('handles additions at the end', () => {
    const diff = simpleLineDiff('a\n', 'a\nb\n')
    expect(diff).toEqual([
      { type: ' ', line: 'a' },
      { type: '+', line: 'b' },
      { type: ' ', line: '' },
    ])
  })
})

describe('looksBinary', () => {
  test('detects NUL bytes', () => {
    expect(looksBinary(Buffer.from([0x89, 0x50, 0, 0x47]))).toBe(true)
    expect(looksBinary(Buffer.from('plain text\n'))).toBe(false)
  })
})
