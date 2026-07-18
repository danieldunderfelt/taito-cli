import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import * as p from '@clack/prompts'

import { installSingleSkill } from './add.js'
import { expandPath } from '../lib/github.js'
import {
  addAllAndCommit,
  initRepo,
  isGitRepo,
  revParse,
} from '../lib/git.js'
import {
  agentConfigs,
  detectAllAgents,
  getSkillOutputDir,
  type AgentType,
} from '../lib/paths.js'
import { getRegisteredTemplate } from '../lib/registry.js'
import {
  collectTemplateInputs,
  materializeTemplate,
  writeProjectMeta,
} from '../lib/template-materialize.js'
import type { NewProjectOptions } from '../types.js'

/**
 * Initialize a new project from a registered template
 */
export async function newProjectCommand(
  path: string = '.',
  options: NewProjectOptions
): Promise<void> {
  const spinner = p.spinner()

  try {
    const template = getRegisteredTemplate(options.template)
    if (!template) {
      p.log.error(`Template '${options.template}' is not registered.`)
      p.log.message('List templates with: taito list')
      p.log.message('Register one with: taito add <path>')
      process.exit(1)
    }

    if (!existsSync(template.path)) {
      p.log.error(`Template path no longer exists: ${template.path}`)
      process.exit(1)
    }

    const dest = expandPath(path)
    mkdirSync(dest, { recursive: true })

    const existing = existsSync(dest) ? readdirSync(dest) : []
    // Ignore .git when checking emptiness if we're about to init
    const nonGitEntries = existing.filter((e) => e !== '.git')
    if (nonGitEntries.length > 0 && !options.force) {
      const proceed = await p.confirm({
        message: `Destination ${dest} is not empty. Continue anyway?`,
        initialValue: false,
      })
      if (p.isCancel(proceed) || !proceed) {
        p.cancel('Cancelled.')
        process.exit(0)
      }
    }

    p.log.info(`Using template '${template.name}' from ${template.path}`)

    const { config, values, components } = await collectTemplateInputs(
      template.path,
      {
        configPath: options.config,
        dryRun: options.dryRun,
      }
    )

    spinner.start('Materializing template...')
    const result = await materializeTemplate(
      template.path,
      dest,
      values,
      components,
      config,
      { dryRun: options.dryRun }
    )
    spinner.stop(
      options.dryRun
        ? `Would write ${result.files.length} files`
        : `Wrote ${result.files.length} files`
    )

    if (options.dryRun) {
      for (const file of result.files.slice(0, 20)) {
        p.log.message(`  ${file}`)
      }
      if (result.files.length > 20) {
        p.log.message(`  ... and ${result.files.length - 20} more`)
      }
      return
    }

    // Install deferred customizable skills into the new project
    if (result.deferredSkills.length > 0) {
      p.log.info(
        `Customizing ${result.deferredSkills.length} skill(s) from template...`
      )

      const agent = await resolveAgent(dest, options.agent)

      for (const skill of result.deferredSkills) {
        const skillName = skill.dirName
        const outputDir = getSkillOutputDir(skillName, agent, false, dest)

        await installSingleSkill(
          skill.path,
          `template:${template.name}`,
          {
            output: outputDir,
            // Don't pass config — skill gets its own prompts
          },
          agent,
          dest
        )
      }
    }

    const templateCommit = await revParse(template.path, 'HEAD')

    writeProjectMeta(dest, {
      project: {
        template: template.name,
        templatePath: template.path,
        templateCommit,
        createdAt: new Date().toISOString(),
      },
      variables: values,
      components,
    })

    if (!(await isGitRepo(dest))) {
      spinner.start('Initializing git repository...')
      await initRepo(dest)
      await addAllAndCommit(dest, `Initialize project from template ${template.name}`)
      spinner.stop('Git repository initialized')
    }

    p.log.success(`Project ready at ${dest}`)
    p.log.message(`Template: ${template.name} @ ${templateCommit.slice(0, 7)}`)
    p.log.message('Pull template updates later with: taito update')
  } catch (error) {
    spinner.stop('Failed')
    const err = error as Error
    p.log.error(err.message)
    process.exit(1)
  }
}

async function resolveAgent(
  projectRoot: string,
  agentOption?: string
): Promise<AgentType> {
  if (agentOption) {
    const normalizedInput = agentOption.toLowerCase()
    const matchedAgent = Object.keys(agentConfigs).find(
      (key) => key.toLowerCase() === normalizedInput
    ) as AgentType | undefined

    if (!matchedAgent) {
      throw new Error(
        `Unknown agent: ${agentOption}. Available: ${Object.keys(agentConfigs).join(', ')}`
      )
    }
    return matchedAgent
  }

  const detected = detectAllAgents(projectRoot)
  if (detected.length === 0) {
    // Prefer amp (.agents/skills) if present in template tree, else cursor
    if (existsSync(join(projectRoot, '.agents'))) {
      return 'amp'
    }
    if (existsSync(join(projectRoot, '.claude'))) {
      return 'claudeCode'
    }
    p.log.warn('No agent detected. Defaulting to Cursor.')
    return 'cursor'
  }

  if (detected.length === 1) {
    p.log.info(`Detected agent: ${agentConfigs[detected[0]].name}`)
    return detected[0]
  }

  const selected = await p.select({
    message: 'Which agent should template skills install for?',
    options: detected.map((a) => ({
      value: a,
      label: agentConfigs[a].name,
    })),
  })

  if (p.isCancel(selected)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  return selected
}
