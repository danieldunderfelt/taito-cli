import { existsSync, mkdirSync, readdirSync } from 'node:fs'

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
  getDefaultAgentSelection,
  getSelectableAgents,
  resolveAgentType,
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

      const agents = await resolveProjectAgents(dest, options.agent)

      for (const skill of result.deferredSkills) {
        await installSingleSkill(
          skill.path,
          `template:${template.name}`,
          {
            // Don't pass config — skill gets its own prompts
          },
          agents,
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

async function resolveProjectAgents(
  projectRoot: string,
  agentOption?: string
): Promise<AgentType[]> {
  if (agentOption) {
    const parts = agentOption.split(',').map((s) => s.trim()).filter(Boolean)
    const resolved: AgentType[] = []
    for (const part of parts) {
      const matched = resolveAgentType(part)
      if (!matched) {
        throw new Error(
          `Unknown agent: ${part}. Try .agents, claudeCode, cursor, …`
        )
      }
      if (!resolved.includes(matched)) resolved.push(matched)
    }
    if (!resolved.includes('agents')) resolved.unshift('agents')
    return resolved
  }

  const selectable = getSelectableAgents(projectRoot)
  const preselected = getDefaultAgentSelection(projectRoot)

  const selected = await p.multiselect({
    message: 'Which agents should template skills install for?',
    options: selectable.map((a) => ({
      value: a,
      label: agentConfigs[a].name,
      hint:
        a === 'agents'
          ? 'canonical .agents/skills'
          : `symlink → ${agentConfigs[a].localPath}`,
    })),
    initialValues: preselected,
    required: true,
  })

  if (p.isCancel(selected)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  const agents = [...selected]
  if (!agents.includes('agents')) agents.unshift('agents')
  return agents
}
