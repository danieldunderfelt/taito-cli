import * as p from '@clack/prompts'

/**
 * Parsing and interactive resolution of git-style conflict markers
 * (<<<<<<< / ||||||| / ======= / >>>>>>>), shared by every command
 * that merges template content with project content.
 */

export interface ConflictHunk {
  ours: string[]
  theirs: string[]
  oursLabel: string
  theirsLabel: string
}

export type ConflictSegment =
  | { type: 'text'; lines: string[] }
  | { type: 'conflict'; hunk: ConflictHunk }

export type ChunkChoice = 'ours' | 'theirs' | 'both' | 'markers'

export interface SideLabels {
  ours: string
  theirs: string
}

const MARKER_OURS = '<<<<<<<'
const MARKER_BASE = '|||||||'
const MARKER_SPLIT = '======='
const MARKER_THEIRS = '>>>>>>>'

/**
 * Split content into alternating text/conflict segments.
 * Returns null when the content contains no conflict markers.
 * Lines are kept without terminators; join with '\n' to rebuild.
 */
export function parseConflictSegments(
  content: string
): ConflictSegment[] | null {
  const lines = content.split('\n')
  const segments: ConflictSegment[] = []
  let text: string[] = []
  let found = false
  let i = 0

  const flushText = () => {
    if (text.length > 0) {
      segments.push({ type: 'text', lines: text })
      text = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    if (!line.startsWith(MARKER_OURS)) {
      text.push(line)
      i++
      continue
    }

    // Parse a marker block; bail back to plain text if unterminated
    const oursLabel = line.slice(MARKER_OURS.length).trim() || 'ours'
    const ours: string[] = []
    const theirs: string[] = []
    let theirsLabel = 'theirs'
    let j = i + 1
    let state: 'ours' | 'base' | 'theirs' = 'ours'
    let closed = false

    while (j < lines.length) {
      const inner = lines[j]
      if (state === 'ours' && inner.startsWith(MARKER_BASE)) {
        state = 'base'
      } else if (state !== 'theirs' && inner === MARKER_SPLIT) {
        state = 'theirs'
      } else if (state === 'theirs' && inner.startsWith(MARKER_THEIRS)) {
        theirsLabel = inner.slice(MARKER_THEIRS.length).trim() || 'theirs'
        closed = true
        break
      } else if (state === 'ours') {
        ours.push(inner)
      } else if (state === 'theirs') {
        theirs.push(inner)
      }
      // base section (diff3) is parsed but not offered as a choice
      j++
    }

    if (!closed) {
      text.push(line)
      i++
      continue
    }

    found = true
    flushText()
    segments.push({
      type: 'conflict',
      hunk: { ours, theirs, oursLabel, theirsLabel },
    })
    i = j + 1
  }

  if (!found) return null
  flushText()
  return segments
}

/**
 * Rebuild file content from segments and one choice per conflict hunk.
 */
export function buildResolvedContent(
  segments: ConflictSegment[],
  choices: ChunkChoice[]
): string {
  const out: string[] = []
  let hunkIndex = 0

  for (const segment of segments) {
    if (segment.type === 'text') {
      out.push(...segment.lines)
      continue
    }

    const { hunk } = segment
    const choice = choices[hunkIndex] ?? 'markers'
    hunkIndex++

    if (choice === 'ours' || choice === 'both') {
      out.push(...hunk.ours)
    }
    if (choice === 'theirs' || choice === 'both') {
      out.push(...hunk.theirs)
    }
    if (choice === 'markers') {
      out.push(`${MARKER_OURS} ${hunk.oursLabel}`)
      out.push(...hunk.ours)
      out.push(MARKER_SPLIT)
      out.push(...hunk.theirs)
      out.push(`${MARKER_THEIRS} ${hunk.theirsLabel}`)
    }
  }

  return out.join('\n')
}

export function countConflicts(segments: ConflictSegment[]): number {
  return segments.filter((s) => s.type === 'conflict').length
}

export type ChunkResolution =
  | { action: 'resolved'; content: string; hasMarkers: boolean }
  | { action: 'cancel' }

const MAX_PREVIEW_LINES = 8

function previewLines(lines: string[], prefix: string): string[] {
  const shown = lines.slice(0, MAX_PREVIEW_LINES)
  const rendered = shown.map((line) => `${prefix} ${line}`)
  if (lines.length > MAX_PREVIEW_LINES) {
    rendered.push(`  … (${lines.length - MAX_PREVIEW_LINES} more lines)`)
  }
  if (lines.length === 0) {
    rendered.push(`${prefix} (empty)`)
  }
  return rendered
}

/**
 * Walk every conflict hunk in a merged file and ask the user which side
 * to keep, chunk by chunk. Returns the final content, or 'cancel'.
 */
export async function resolveChunksInteractively(
  relPath: string,
  mergedContent: string,
  labels: SideLabels
): Promise<ChunkResolution> {
  const segments = parseConflictSegments(mergedContent)
  if (!segments) {
    return { action: 'resolved', content: mergedContent, hasMarkers: false }
  }

  const total = countConflicts(segments)
  const choices: ChunkChoice[] = []
  let applyAll: 'ours' | 'theirs' | undefined

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    if (segment.type !== 'conflict') continue

    if (applyAll) {
      choices.push(applyAll)
      continue
    }

    const k = choices.length + 1
    const prev = segments[index - 1]
    const next = segments[index + 1]
    const before = prev?.type === 'text' ? prev.lines : []
    const after = next?.type === 'text' ? next.lines : []

    const preview: string[] = before.slice(-2).map((l) => `  ${l}`)
    preview.push(...previewLines(segment.hunk.ours, `- [${labels.ours}]`))
    preview.push(...previewLines(segment.hunk.theirs, `+ [${labels.theirs}]`))
    preview.push(...after.slice(0, 2).map((l) => `  ${l}`))

    p.log.warn(
      `Conflict ${k}/${total} in ${relPath}\n${preview.join('\n')}`
    )

    const options: { value: string; label: string }[] = [
      { value: 'ours', label: `Keep ${labels.ours}` },
      { value: 'theirs', label: `Keep ${labels.theirs}` },
      { value: 'both', label: `Keep both (${labels.ours} first)` },
      { value: 'markers', label: 'Leave conflict markers in this chunk' },
    ]
    if (k < total) {
      options.push(
        { value: 'all-ours', label: `Keep ${labels.ours} for all remaining` },
        { value: 'all-theirs', label: `Keep ${labels.theirs} for all remaining` }
      )
    }

    const choice = await p.select({ message: 'Which version?', options })

    if (p.isCancel(choice)) {
      return { action: 'cancel' }
    }

    if (choice === 'all-ours' || choice === 'all-theirs') {
      applyAll = choice === 'all-ours' ? 'ours' : 'theirs'
      choices.push(applyAll)
    } else {
      choices.push(choice as ChunkChoice)
    }
  }

  const content = buildResolvedContent(segments, choices)
  return {
    action: 'resolved',
    content,
    hasMarkers: choices.includes('markers'),
  }
}

export interface DiffLine {
  type: ' ' | '-' | '+'
  line: string
}

/**
 * Minimal LCS line diff. Falls back to replace-all for very large inputs.
 */
export function simpleLineDiff(a: string, b: string): DiffLine[] {
  const aLines = a.split('\n')
  const bLines = b.split('\n')

  if (aLines.length * bLines.length > 1_000_000) {
    return [
      ...aLines.map((line) => ({ type: '-' as const, line })),
      ...bLines.map((line) => ({ type: '+' as const, line })),
    ]
  }

  // LCS table
  const m = aLines.length
  const n = bLines.length
  const table: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from<number>({ length: n + 1 }).fill(0)
  )
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      table[i][j] =
        aLines[i] === bLines[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const diff: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      diff.push({ type: ' ', line: aLines[i] })
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      diff.push({ type: '-', line: aLines[i] })
      i++
    } else {
      diff.push({ type: '+', line: bLines[j] })
      j++
    }
  }
  while (i < m) diff.push({ type: '-', line: aLines[i++] })
  while (j < n) diff.push({ type: '+', line: bLines[j++] })
  return diff
}

/**
 * Render a line diff to the user with - / + prefixes.
 */
export function showDiff(
  title: string,
  a: string,
  b: string,
  labels: SideLabels,
  maxLines: number = 80
): void {
  const diff = simpleLineDiff(a, b)
  const lines = diff.map(({ type, line }) => {
    if (type === '-') return `- [${labels.ours}] ${line}`
    if (type === '+') return `+ [${labels.theirs}] ${line}`
    return `  ${line}`
  })
  if (lines.length > maxLines) {
    lines.splice(maxLines, lines.length - maxLines)
    lines.push(`  … (${diff.length - maxLines} more lines)`)
  }
  p.log.message(`${title}\n${lines.join('\n')}`)
}

/** Heuristic binary detection (NUL byte in the first 8000 bytes). */
export function looksBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8000)
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true
  }
  return false
}

/** True when interactive prompting is possible. */
export function isInteractive(): boolean {
  return process.stdin.isTTY && process.stdout.isTTY
}
