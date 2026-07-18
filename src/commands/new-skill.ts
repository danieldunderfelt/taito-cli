import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import * as p from '@clack/prompts'

import { expandPath } from '../lib/github.js'
import type { NewSkillOptions } from '../types.js'

/**
 * Scaffold a new customizable skill package
 */
export async function newSkillCommand(
  path: string = '.',
  options: NewSkillOptions = {}
): Promise<void> {
  try {
    const dest = expandPath(path)
    mkdirSync(dest, { recursive: true })

    let name = options.name
    if (!name) {
      const result = await p.text({
        message: 'Skill name?',
        placeholder: basename(dest) || 'my-skill',
        defaultValue: basename(dest) || 'my-skill',
      })
      if (p.isCancel(result)) {
        p.cancel('Cancelled.')
        process.exit(0)
      }
      name = result
    }

    let description = options.description
    if (!description) {
      const result = await p.text({
        message: 'Short description?',
        placeholder: 'What this skill helps with',
        defaultValue: 'A customizable agent skill',
      })
      if (p.isCancel(result)) {
        p.cancel('Cancelled.')
        process.exit(0)
      }
      description = result
    }

    const skillMdPath = join(dest, 'SKILL.md')
    const taitoDir = join(dest, '.taito')
    const configPath = join(taitoDir, 'skill.config.toml')
    const ejsPath = join(taitoDir, 'SKILL.md.ejs')

    if (
      (existsSync(skillMdPath) || existsSync(configPath)) &&
      !options.force
    ) {
      const overwrite = await p.confirm({
        message: 'Skill files already exist. Overwrite?',
        initialValue: false,
      })
      if (p.isCancel(overwrite) || !overwrite) {
        p.cancel('Cancelled.')
        process.exit(0)
      }
    }

    mkdirSync(taitoDir, { recursive: true })

    const defaultSkillMd = `---
name: ${name}
description: ${description}
---

# ${name}

${description}

## Instructions

<!-- Write skill instructions here. Keep root SKILL.md in sync via \`taito build\`. -->
`

    const skillEjs = `---
name: ${name}
description: ${description}
---

# ${name}

${description}

## Instructions

<!-- Customize with EJS: <%= VARIABLE_NAME %> -->
`

    const configToml = `[meta]
name = "${name}"
version = "0.1.0"
description = "${description.replace(/"/g, '\\"')}"

# Example variable — delete or replace as needed
[variables.PROJECT_NAME]
type = "string"
prompt = "What is your project name?"
default = "my-project"
`

    writeFileSync(skillMdPath, defaultSkillMd)
    writeFileSync(ejsPath, skillEjs)
    writeFileSync(configPath, configToml)

    p.log.success(`Created customizable skill '${name}' at ${dest}`)
    p.log.message('Files:')
    p.log.message('  SKILL.md')
    p.log.message('  .taito/skill.config.toml')
    p.log.message('  .taito/SKILL.md.ejs')
    p.log.message('')
    p.log.message('Next: edit templates, then run `taito build` to refresh defaults.')
  } catch (error) {
    const err = error as Error
    p.log.error(err.message)
    process.exit(1)
  }
}
