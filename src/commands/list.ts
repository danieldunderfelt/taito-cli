import { existsSync } from 'node:fs'
import * as p from '@clack/prompts'
import { getInstalledSkills } from '../lib/metadata.js'
import {
  agentConfigs,
  detectAllAgents,
  findWorkspaceRoot,
  getSkillsDir,
} from '../lib/paths.js'

/**
 * List installed skills
 */
export async function listCommand(): Promise<void> {
  const workspaceRoot = findWorkspaceRoot()
  const detectedAgents = detectAllAgents(workspaceRoot)

  if (detectedAgents.length === 0) {
    p.log.info('No agents detected in workspace.')
    return
  }

  let totalSkills = 0

  for (const agent of detectedAgents) {
    const config = agentConfigs[agent]
    const skillsDir = getSkillsDir(agent, false, workspaceRoot)

    if (!existsSync(skillsDir)) {
      continue
    }

    const skills = getInstalledSkills(agent, false, workspaceRoot)

    if (skills.length === 0) {
      continue
    }

    totalSkills += skills.length

    p.log.info(
      `\n${config.name} (${skills.length} skill${skills.length > 1 ? 's' : ''}):`
    )
    p.log.message('')

    for (const skill of skills) {
      const customLabel = skill.customized ? ' (customized)' : ''
      const date = new Date(skill.installedAt).toLocaleDateString()

      p.log.message(`  ${skill.name}${customLabel}`)
      p.log.message(`    Source: ${skill.source}`)
      p.log.message(`    Installed: ${date}`)
      p.log.message('')
    }

    p.log.message(`  Directory: ${skillsDir}`)
  }

  if (totalSkills === 0) {
    p.log.info('No skills installed yet.')
  }
}
