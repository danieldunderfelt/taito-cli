import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { parseTemplateConfig } from './config.js'
import { getTemplateConfigPath } from './classify.js'
import {
  collectMissingTemplateInputs,
  findMissingTemplateInputs,
} from './template-materialize.js'

function writeConfig(dir: string, body: string): void {
  mkdirSync(join(dir, '.taito'), { recursive: true })
  writeFileSync(join(dir, '.taito', 'template.config.toml'), body)
}

describe('findMissingTemplateInputs', () => {
  test('reports only keys absent from stored answers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'taito-missing-'))
    writeConfig(
      dir,
      `[meta]
name = "demo"
version = "0.1.0"

[variables.PROJECT_NAME]
type = "string"
prompt = "Name?"
default = "app"

[variables.OWNER]
type = "string"
prompt = "Owner?"
default = "me"

[components.docs]
prompt = "Docs?"
default = true
paths = ["docs/**"]

[components.ci]
prompt = "CI?"
default = false
paths = [".github/**"]
`
    )
    const config = parseTemplateConfig(getTemplateConfigPath(dir))
    const missing = findMissingTemplateInputs(config, {
      values: { PROJECT_NAME: 'acme' },
      components: { docs: true },
    })
    expect(missing.variables).toEqual(['OWNER'])
    expect(missing.components).toEqual(['ci'])
  })

  test('empty when project already has every key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'taito-missing-'))
    writeConfig(
      dir,
      `[meta]
name = "demo"
version = "0.1.0"

[variables.PROJECT_NAME]
type = "string"
prompt = "Name?"
default = "app"
`
    )
    const config = parseTemplateConfig(getTemplateConfigPath(dir))
    const missing = findMissingTemplateInputs(config, {
      values: { PROJECT_NAME: 'acme' },
      components: {},
    })
    expect(missing.variables).toEqual([])
    expect(missing.components).toEqual([])
  })
})

describe('collectMissingTemplateInputs', () => {
  test('keeps stored answers and fills new keys from defaults when nonInteractive', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'taito-collect-'))
    writeConfig(
      dir,
      `[meta]
name = "demo"
version = "0.1.0"

[variables.PROJECT_NAME]
type = "string"
prompt = "Name?"
default = "app"

[variables.OWNER]
type = "string"
prompt = "Owner?"
default = "team"

[components.docs]
prompt = "Docs?"
default = true
paths = ["docs/**"]
`
    )

    const result = await collectMissingTemplateInputs(
      dir,
      {
        values: { PROJECT_NAME: 'acme' },
        components: {},
      },
      { nonInteractive: true }
    )

    expect(result.values).toEqual({
      PROJECT_NAME: 'acme',
      OWNER: 'team',
    })
    expect(result.components).toEqual({ docs: true })
    expect(result.prompted).toEqual({ variables: [], components: [] })
  })

  test('merges answers file over stored values for missing keys', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'taito-collect-'))
    writeConfig(
      dir,
      `[meta]
name = "demo"
version = "0.1.0"

[variables.PROJECT_NAME]
type = "string"
prompt = "Name?"
default = "app"

[variables.OWNER]
type = "string"
prompt = "Owner?"
default = "team"
`
    )
    const answers = join(dir, 'answers.toml')
    writeFileSync(answers, 'OWNER = "from-file"\n')

    const result = await collectMissingTemplateInputs(
      dir,
      { values: { PROJECT_NAME: 'acme' } },
      { configPath: answers }
    )

    expect(result.values.PROJECT_NAME).toBe('acme')
    expect(result.values.OWNER).toBe('from-file')
  })
})
