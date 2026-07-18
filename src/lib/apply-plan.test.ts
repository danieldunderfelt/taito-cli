import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { buildApplyPlan } from './apply-plan.js'
import { addAllAndCommit, initRepo } from './git.js'
import { registerTemplate, writeRegistry } from './registry.js'

const originalHome = process.env.TAITO_HOME
let home: string
let root: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'taito-home-'))
  root = mkdtempSync(join(tmpdir(), 'taito-apply-'))
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

async function setup(): Promise<{ templateDir: string; projectDir: string }> {
  const templateDir = join(root, 'tpl')
  mkdirSync(join(templateDir, '.taito'), { recursive: true })
  writeFileSync(
    join(templateDir, '.taito', 'template.config.toml'),
    `[meta]
name = "tpl"
[variables.PROJECT_NAME]
type = "string"
prompt = "Name?"
default = "app"
`
  )
  writeFileSync(join(templateDir, 'README.md'), '# stub readme\n')
  writeFileSync(join(templateDir, 'NEW.md'), 'only in template\n')
  writeFileSync(
    join(templateDir, '.taito', 'README.md.ejs'),
    '# <%= PROJECT_NAME %>\n'
  )
  await initRepo(templateDir)
  await addAllAndCommit(templateDir, 'init')

  registerTemplate({
    name: 'tpl',
    path: templateDir,
    source: 'local',
    addedAt: new Date().toISOString(),
  })

  const projectDir = join(root, 'proj')
  mkdirSync(projectDir, { recursive: true })
  // Richer project README than the rendered template
  writeFileSync(
    join(projectDir, 'README.md'),
    '# app\n\nLots of project-specific documentation that must be preserved.\n'.repeat(
      5
    )
  )

  return { templateDir, projectDir }
}

describe('buildApplyPlan', () => {
  test('classifies missing, differs/richer, and hints', async () => {
    const { projectDir } = await setup()
    const { plan, cleanup } = await buildApplyPlan({
      template: 'tpl',
      projectPath: projectDir,
      nonInteractive: true,
    })
    try {
      const readme = plan.files.find((f) => f.path === 'README.md')
      const neu = plan.files.find((f) => f.path === 'NEW.md')
      expect(readme?.status).toBe('differs')
      expect(readme?.hint).toBe('merge')
      expect(readme?.projectRicher).toBe(true)
      expect(neu?.status).toBe('missing')
      expect(neu?.hint).toBe('write')
    } finally {
      cleanup()
    }
  })
})
