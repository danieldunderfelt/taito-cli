import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { parseTemplateConfig } from './config.js'
import { getTemplateConfigPath } from './classify.js'
import { addAllAndCommit, initRepo, revParse } from './git.js'
import {
  getRegisteredTemplate,
  registerTemplate,
  writeRegistry,
} from './registry.js'
import {
  materializeTemplate,
  materializeTemplateAtRef,
  writeProjectMeta,
} from './template-materialize.js'

const originalHome = process.env.TAITO_HOME
let home: string
let root: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'taito-home-'))
  root = mkdtempSync(join(tmpdir(), 'taito-flow-'))
  process.env.TAITO_HOME = home
  writeRegistry({ templates: {} })
})

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.TAITO_HOME
  } else {
    process.env.TAITO_HOME = originalHome
  }
})

async function makeTemplate(): Promise<string> {
  const dir = join(root, 'demo-template')
  mkdirSync(join(dir, '.taito'), { recursive: true })
  mkdirSync(join(dir, 'docs', 'extra'), { recursive: true })

  writeFileSync(
    join(dir, '.taito', 'template.config.toml'),
    `[meta]
name = "demo-template"
version = "0.1.0"

[variables.PROJECT_NAME]
type = "string"
prompt = "Project name?"
default = "smoke-app"

[components.extra]
prompt = "Include extra?"
default = true
paths = ["docs/extra/**"]
`
  )
  writeFileSync(join(dir, 'README.md'), '# readme\n')
  writeFileSync(join(dir, 'docs', 'extra', 'note.md'), 'extra\n')
  writeFileSync(join(dir, 'AGENT.md'), '# Agent\n')
  writeFileSync(
    join(dir, '.taito', 'AGENT.md.ejs'),
    '# Agent for <%= PROJECT_NAME %>\n'
  )

  await initRepo(dir)
  await addAllAndCommit(dir, 'init')
  return dir
}

describe('template materialize + update snapshots', () => {
  test('renders ejs, excludes components, registers meta', async () => {
    const templateDir = await makeTemplate()
    const config = parseTemplateConfig(getTemplateConfigPath(templateDir))
    const projectDir = join(root, 'project')

    const result = await materializeTemplate(
      templateDir,
      projectDir,
      { PROJECT_NAME: 'smoke-app' },
      { extra: false },
      config
    )

    expect(readFileSync(join(projectDir, 'AGENT.md'), 'utf-8')).toBe(
      '# Agent for smoke-app\n'
    )
    expect(existsSync(join(projectDir, 'docs', 'extra', 'note.md'))).toBe(
      false
    )
    expect(result.templateCommit.length).toBeGreaterThan(7)

    writeProjectMeta(projectDir, {
      project: {
        template: 'demo-template',
        templatePath: templateDir,
        templateCommit: result.templateCommit,
        createdAt: new Date().toISOString(),
      },
      variables: { PROJECT_NAME: 'smoke-app' },
      components: { extra: false },
    })

    registerTemplate({
      name: 'demo-template',
      path: templateDir,
      source: 'local',
      addedAt: new Date().toISOString(),
    })
    expect(getRegisteredTemplate('demo-template')?.path).toBe(templateDir)

    // Change template and re-materialize at new ref
    writeFileSync(join(templateDir, 'README.md'), 'changed\n')
    await addAllAndCommit(templateDir, 'change')
    const newCommit = await revParse(templateDir, 'HEAD')

    const snap = await materializeTemplateAtRef(
      templateDir,
      newCommit,
      { PROJECT_NAME: 'smoke-app' },
      { extra: false }
    )
    try {
      expect(readFileSync(join(snap.dir, 'README.md'), 'utf-8')).toBe(
        'changed\n'
      )
      expect(readFileSync(join(snap.dir, 'AGENT.md'), 'utf-8')).toBe(
        '# Agent for smoke-app\n'
      )
    } finally {
      snap.cleanup()
    }
  })
})
