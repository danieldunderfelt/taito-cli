import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  getRegisteredTemplate,
  listRegisteredTemplates,
  registerTemplate,
  unregisterTemplate,
  writeRegistry,
} from './registry.js'

const originalHome = process.env.TAITO_HOME
let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'taito-home-'))
  process.env.TAITO_HOME = home
  writeRegistry({ templates: {} })
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  if (originalHome === undefined) {
    delete process.env.TAITO_HOME
  } else {
    process.env.TAITO_HOME = originalHome
  }
})

describe('registry', () => {
  test('round-trip register and list', () => {
    registerTemplate({
      name: 'demo',
      path: '/tmp/demo',
      source: 'local',
      addedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(getRegisteredTemplate('demo')?.path).toBe('/tmp/demo')
    expect(listRegisteredTemplates()).toHaveLength(1)

    unregisterTemplate('demo')
    expect(getRegisteredTemplate('demo')).toBeUndefined()
  })
})
