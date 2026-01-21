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

/**
 * Remove an installed skill
 */
export async function removeCommand(skillName: string): Promise<void> {
  const workspaceRoot = findWorkspaceRoot()
  const detectedAgents = detectAllAgents(workspaceRoot)

  if (detectedAgents.length === 0) {
    p.log.error('No agents detected in workspace.')
    process.exit(1)
  }

  // Find which agent(s) have this skill installed
  const agentsWithSkill: AgentType[] = []

  for (const agent of detectedAgents) {
    const skills = getInstalledSkills(agent, false, workspaceRoot)
    if (skills.some((s) => s.name === skillName)) {
      agentsWithSkill.push(agent)
    }
  }

  if (agentsWithSkill.length === 0) {
    p.log.error(`Skill '${skillName}' is not installed for any detected agent.`)
    process.exit(1)
  }

  // If skill is installed for multiple agents, ask which one to remove from
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
      // Remove from all agents
      for (const agent of agentsWithSkill) {
        await removeSingleSkill(skillName, agent, workspaceRoot)
      }
      p.log.success(`Removed skill '${skillName}' from all agents`)
      return
    }

    targetAgent = selected as AgentType
  }

  // Confirm removal
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

/**
 * Remove a skill from a specific agent
 */
async function removeSingleSkill(
  skillName: string,
  agent: AgentType,
  workspaceRoot: string
): Promise<void> {
  const skillDir = getSkillOutputDir(skillName, agent, false, workspaceRoot)

  // Remove directory
  if (existsSync(skillDir)) {
    try {
      rmSync(skillDir, { recursive: true, force: true })
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to remove skill directory: ${err.message}`)
    }
  }

  // Remove from metadata
  removeSkillFromMetadata(skillName, agent, false, workspaceRoot)
}
