import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import * as p from '@clack/prompts'

import { installSingleSkill } from './add.js'
import {
  buildApplyPlan,
  materializeForApply,
  readRenderedFile,
  writeApplyFile,
} from '../lib/apply-plan.js'
import {
  getDefaultComponentValues,
  getDefaultValues,
  parsePresetComponents,
  parsePresetConfig,
  parseTemplateConfig,
} from '../lib/config.js'
import { getTemplateConfigPath } from '../lib/classify.js'
import { expandPath } from '../lib/github.js'
import { revParse } from '../lib/git.js'
import {
  isInteractive,
  looksBinary,
  showDiff,
} from '../lib/merge-conflicts.js'
import {
  agentConfigs,
  getDefaultAgentSelection,
  getSelectableAgents,
  resolveAgentType,
  type AgentType,
} from '../lib/paths.js'
import { getRegisteredTemplate } from '../lib/registry.js'
import { writeProjectMeta } from '../lib/template-materialize.js'
import type { ApplyOptions, ApplyPlan } from '../types.js'

/**
 * taito apply plan -t <template> [path]
 */
export async function applyPlanCommand(
  path: string = '.',
  options: ApplyOptions
): Promise<void> {
  const { plan, cleanup } = await buildApplyPlan({
    template: options.template,
    projectPath: path,
    configPath: options.config,
    nonInteractive: options.json || Boolean(options.config),
  })

  try {
    if (options.json) {
      console.log(JSON.stringify(plan, null, 2))
      return
    }

    printPlanHuman(plan)
  } finally {
    cleanup()
  }
}

/**
 * taito apply cat -t <template> --file <path>
 */
export async function applyCatCommand(
  options: ApplyOptions & { file: string }
): Promise<void> {
  const registered = getRegisteredTemplate(options.template)
  if (!registered) {
    p.log.error(`Template '${options.template}' is not registered.`)
    process.exit(1)
  }

  const { values, components } = resolveInputs(registered.path, options.config)
  const { renderedDir, cleanup } = await materializeForApply(
    options.template,
    values,
    components,
    options.config
  )

  try {
    const content = readRenderedFile(renderedDir, options.file)
    if (options.json) {
      console.log(
        JSON.stringify({
          path: options.file,
          content: content.toString('utf-8'),
        })
      )
    } else {
      process.stdout.write(content)
    }
  } finally {
    cleanup()
  }
}

/**
 * taito apply write -t <template> --file <path> [--force]
 */
export async function applyWriteCommand(
  path: string = '.',
  options: ApplyOptions & { file: string }
): Promise<void> {
  const projectPath = expandPath(path)
  const registered = getRegisteredTemplate(options.template)
  if (!registered) {
    p.log.error(`Template '${options.template}' is not registered.`)
    process.exit(1)
  }

  const { values, components } = resolveInputs(registered.path, options.config)
  const { renderedDir, cleanup } = await materializeForApply(
    options.template,
    values,
    components,
    options.config
  )

  try {
    const src = join(renderedDir, options.file)
    const dest = join(projectPath, options.file)

    if (!existsSync(src)) {
      throw new Error(`Template file not found: ${options.file}`)
    }

    let result: 'written' | 'skipped'

    if (existsSync(dest) && !options.force) {
      const srcBuf = readFileSync(src)
      const destBuf = readFileSync(dest)

      if (srcBuf.equals(destBuf)) {
        result = 'skipped'
      } else if (options.json || !isInteractive()) {
        throw new Error(
          `Project already has ${options.file} with different content. ` +
            'Use --force to overwrite, or merge manually after `taito apply cat`.'
        )
      } else {
        if (looksBinary(srcBuf) || looksBinary(destBuf)) {
          p.log.message(`${options.file}: binary file, diff not shown`)
        } else {
          showDiff(
            `${options.file}: project vs template`,
            destBuf.toString('utf-8'),
            srcBuf.toString('utf-8'),
            { ours: 'project', theirs: 'template' }
          )
        }
        const choice = await p.select({
          message: `${options.file} differs from the template. What do you want to do?`,
          options: [
            { value: 'keep', label: 'Keep project version (skip)' },
            { value: 'overwrite', label: 'Overwrite with template version' },
          ],
        })
        if (p.isCancel(choice) || choice === 'keep') {
          p.log.info(`Kept project version of ${options.file}`)
          return
        }
        writeFileSync(dest, srcBuf)
        result = 'written'
      }
    } else {
      result = writeApplyFile(
        renderedDir,
        projectPath,
        options.file,
        Boolean(options.force)
      )
    }

    if (options.json) {
      console.log(JSON.stringify({ path: options.file, result }))
    } else if (result === 'written') {
      p.log.success(`Wrote ${options.file}`)
    } else {
      p.log.info(`Skipped ${options.file} (identical)`)
    }
  } catch (error) {
    const err = error as Error
    if (options.json) {
      console.log(JSON.stringify({ error: err.message }))
      process.exit(1)
    }
    p.log.error(err.message)
    process.exit(1)
  } finally {
    cleanup()
  }
}

/**
 * taito apply skill -t <template> --skill <name>
 */
export async function applySkillCommand(
  path: string = '.',
  options: ApplyOptions & { skill: string }
): Promise<void> {
  const projectPath = expandPath(path)
  const registered = getRegisteredTemplate(options.template)
  if (!registered) {
    p.log.error(`Template '${options.template}' is not registered.`)
    process.exit(1)
  }

  const { plan, cleanup } = await buildApplyPlan({
    template: options.template,
    projectPath,
    configPath: options.config,
    nonInteractive: true,
  })

  try {
    const skill = plan.skills.find(
      (s) => s.name === options.skill || s.relativePath === options.skill
    )
    if (!skill) {
      p.log.error(`Skill '${options.skill}' not found in template.`)
      p.log.message('Available skills:')
      for (const s of plan.skills) {
        p.log.message(`  - ${s.name} (${s.relativePath})`)
      }
      process.exit(1)
    }

    const agents = await resolveApplyAgents(projectPath, options.agent)

    await installSingleSkill(
      skill.templatePath,
      `template:${registered.name}`,
      {
        config: options.config,
        force: options.force,
      },
      agents,
      projectPath
    )
  } finally {
    cleanup()
  }
}

/**
 * taito apply finalize -t <template>
 * Writes .taito/project.meta.toml so future `taito update` works.
 */
export async function applyFinalizeCommand(
  path: string = '.',
  options: ApplyOptions
): Promise<void> {
  const projectPath = expandPath(path)
  const registered = getRegisteredTemplate(options.template)
  if (!registered) {
    p.log.error(`Template '${options.template}' is not registered.`)
    process.exit(1)
  }

  if (!existsSync(projectPath)) {
    p.log.error(`Project path not found: ${projectPath}`)
    process.exit(1)
  }

  const { values, components } = resolveInputs(registered.path, options.config)
  const templateCommit = await revParse(registered.path, 'HEAD')

  const existingMeta = join(projectPath, '.taito', 'project.meta.toml')
  if (existsSync(existingMeta) && !options.force) {
    const overwrite = options.json
      ? false
      : await p.confirm({
          message: 'project.meta.toml already exists. Overwrite?',
          initialValue: false,
        })
    if (options.json) {
      p.log.error(
        'project.meta.toml already exists. Pass --force to overwrite.'
      )
      process.exit(1)
    }
    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
  }

  writeProjectMeta(projectPath, {
    project: {
      template: registered.name,
      templatePath: registered.path,
      templateCommit,
      createdAt: new Date().toISOString(),
    },
    variables: values,
    components,
  })

  // Persist the answers used for apply so agents can reuse them
  const answersPath = join(projectPath, '.taito', 'apply-answers.toml')
  writeFileSync(answersPath, stringifyAnswers(values, components))

  if (options.json) {
    console.log(
      JSON.stringify({
        ok: true,
        projectMeta: join(projectPath, '.taito', 'project.meta.toml'),
        templateCommit,
        answers: answersPath,
      })
    )
  } else {
    p.log.success('Wrote .taito/project.meta.toml')
    p.log.message(`Template: ${registered.name} @ ${templateCommit.slice(0, 7)}`)
    p.log.message('Future updates: taito update')
  }
}

function resolveInputs(templatePath: string, configPath?: string) {
  const config = parseTemplateConfig(getTemplateConfigPath(templatePath))
  const preset = configPath ? parsePresetConfig(configPath) : undefined
  const presetComponents = configPath
    ? parsePresetComponents(configPath)
    : undefined
  return {
    values: getDefaultValues(config, preset),
    components: getDefaultComponentValues(config, presetComponents),
  }
}

function stringifyAnswers(
  values: ApplyPlan['variables'],
  components: ApplyPlan['components']
): string {
  const lines: string[] = ['# Answers used when applying this template', '']
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') {
      lines.push(`${key} = ${JSON.stringify(value)}`)
    } else if (typeof value === 'boolean') {
      lines.push(`${key} = ${value}`)
    } else if (Array.isArray(value)) {
      lines.push(
        `${key} = [${value.map((v) => JSON.stringify(v)).join(', ')}]`
      )
    }
  }
  if (Object.keys(components).length > 0) {
    lines.push('', '[components]')
    for (const [key, value] of Object.entries(components)) {
      lines.push(`${key} = ${value}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

function printPlanHuman(plan: ApplyPlan): void {
  p.log.info(`Apply plan: ${plan.template} → ${plan.projectPath}`)
  p.log.message(`Commit: ${plan.templateCommit.slice(0, 7)}`)
  p.log.message(
    `Files: ${plan.summary.missing} missing, ${plan.summary.identical} identical, ${plan.summary.differs} differ`
  )
  p.log.message(
    `Skills: ${plan.summary.skillsMissing} missing, ${plan.summary.skillsPresent} present`
  )
  p.log.message('')

  if (plan.files.length > 0) {
    p.log.info('Files:')
    for (const file of plan.files) {
      const richer = file.projectRicher ? ' (project richer)' : ''
      p.log.message(
        `  [${file.status}/${file.hint}] ${file.path}${richer}`
      )
    }
    p.log.message('')
  }

  if (plan.skills.length > 0) {
    p.log.info('Skills:')
    for (const skill of plan.skills) {
      const custom = skill.customizable ? ' customizable' : ''
      p.log.message(
        `  [${skill.status}] ${skill.name} (${skill.relativePath})${custom}`
      )
    }
  }

  p.log.message('')
  p.log.message('Agent workflow:')
  p.log.message('  1. taito apply plan -t NAME --json')
  p.log.message('  2. For missing: taito apply write -t NAME --file PATH')
  p.log.message(
    '  3. For differs: taito apply cat -t NAME --file PATH  → merge carefully'
  )
  p.log.message('  4. taito apply skill -t NAME --skill SKILL')
  p.log.message('  5. taito apply finalize -t NAME')
}

async function resolveApplyAgents(
  projectRoot: string,
  agentOption?: string
): Promise<AgentType[]> {
  if (agentOption) {
    const parts = agentOption.split(',').map((s) => s.trim()).filter(Boolean)
    const resolved: AgentType[] = []
    for (const part of parts) {
      const matched = resolveAgentType(part)
      if (!matched) throw new Error(`Unknown agent: ${part}`)
      if (!resolved.includes(matched)) resolved.push(matched)
    }
    if (!resolved.includes('agents')) resolved.unshift('agents')
    return resolved
  }

  const selectable = getSelectableAgents(projectRoot)
  const preselected = getDefaultAgentSelection(projectRoot)

  const selected = await p.multiselect({
    message: 'Which agents for skill install?',
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
