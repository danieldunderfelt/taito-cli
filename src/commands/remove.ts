import { existsSync, rmSync } from 'node:fs'

import * as p from '@clack/prompts'

import { getInstalledSkills, removeSkillFromMetadata } from '../lib/metadata.js'
import {
  agentConfigs,
  detectAllAgents,
  findWorkspaceRoot,
  getSkillOutputDir,
  type AgentType,
} from '../lib/paths.js'
import {
  getRegisteredTemplate,
  getTemplateCachePath,
  unregisterTemplate,
} from '../lib/registry.js'

/**
 * Remove a registered template or an installed skill
 */
export async function removeCommand(name: string): Promise<void> {
  const template = getRegisteredTemplate(name)

  if (template) {
    await removeTemplate(name, template.path, template.source)
    return
  }

  await removeSkill(name)
}

async function removeTemplate(
  name: string,
  path: string,
  source: string
): Promise<void> {
  // Cached clones live under ~/.taito/templates/<name>
  const cachePath = getTemplateCachePath(name)
  const isGithubCache = source.startsWith('github:') && path === cachePath

  const confirm = await p.confirm({
    message: isGithubCache
      ? `Unregister template '${name}' and delete cached clone at ${path}?`
      : `Unregister template '${name}'? (local files at ${path} will be kept)`,
    initialValue: false,
  })

  if (p.isCancel(confirm) || !confirm) {
    p.log.info('Removal cancelled.')
    return
  }

  unregisterTemplate(name)

  if (isGithubCache && existsSync(path)) {
    rmSync(path, { recursive: true, force: true })
    p.log.success(`Unregistered template '${name}' and deleted cache`)
  } else {
    p.log.success(`Unregistered template '${name}'`)
    p.log.message(`Files kept at ${path}`)
  }
}

async function removeSkill(skillName: string): Promise<void> {
  const workspaceRoot = findWorkspaceRoot()
  const detectedAgents = detectAllAgents(workspaceRoot)

  if (detectedAgents.length === 0) {
    p.log.error(
      `No template named '${skillName}' and no agents detected for skill removal.`
    )
    process.exit(1)
  }

  const agentsWithSkill: AgentType[] = []

  for (const agent of detectedAgents) {
    const skills = getInstalledSkills(agent, false, workspaceRoot)
    if (skills.some((s) => s.name === skillName)) {
      agentsWithSkill.push(agent)
    }
  }

  if (agentsWithSkill.length === 0) {
    p.log.error(
      `'${skillName}' is not a registered template or installed skill.`
    )
    process.exit(1)
  }

  let targetAgent: AgentType

  if (agentsWithSkill.length === 1) {
    targetAgent = agentsWithSkill[0]
    p.log.info(
      `Found '${skillName}' installed for ${agentConfigs[targetAgent].name}`
    )
  } else {
    p.log.info(`Skill '${skillName}' is installed for multiple agents.`)

    const selected = await p.select({
      message: 'Which installation do you want to remove?',
      options: [
        ...agentsWithSkill.map((a) => ({
          value: a,
          label: agentConfigs[a].name,
        })),
        {
          value: 'all',
          label: 'All agents',
        },
      ],
    })

    if (p.isCancel(selected)) {
      p.log.info('Removal cancelled.')
      return
    }

    if (selected === 'all') {
      for (const agent of agentsWithSkill) {
        await removeSingleSkill(skillName, agent, workspaceRoot)
      }
      p.log.success(`Removed skill '${skillName}' from all agents`)
      return
    }

    targetAgent = selected
  }

  const confirm = await p.confirm({
    message: `Remove skill '${skillName}' from ${agentConfigs[targetAgent].name}?`,
    initialValue: false,
  })

  if (p.isCancel(confirm) || !confirm) {
    p.log.info('Removal cancelled.')
    return
  }

  await removeSingleSkill(skillName, targetAgent, workspaceRoot)
  p.log.success(
    `Removed skill '${skillName}' from ${agentConfigs[targetAgent].name}`
  )
}

async function removeSingleSkill(
  skillName: string,
  agent: AgentType,
  workspaceRoot: string
): Promise<void> {
  const skillDir = getSkillOutputDir(skillName, agent, false, workspaceRoot)

  if (existsSync(skillDir)) {
    try {
      rmSync(skillDir, { recursive: true, force: true })
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to remove skill directory: ${err.message}`)
    }
  }

  removeSkillFromMetadata(skillName, agent, false, workspaceRoot)
}
