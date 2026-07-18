import { existsSync } from 'node:fs'

import * as p from '@clack/prompts'

import { getInstalledSkills } from '../lib/metadata.js'
import {
  agentConfigs,
  detectAllAgents,
  findWorkspaceRoot,
  getSkillsDir,
} from '../lib/paths.js'
import { listRegisteredTemplates } from '../lib/registry.js'

/**
 * List registered templates and installed skills
 */
export async function listCommand(): Promise<void> {
  const templates = listRegisteredTemplates()

  if (templates.length > 0) {
    p.log.info(
      `\nTemplates (${templates.length}):`
    )
    p.log.message('')

    for (const tpl of templates) {
      const extendsLabel = tpl.extends ? ` (extends ${tpl.extends})` : ''
      p.log.message(`  ${tpl.name}${extendsLabel}`)
      p.log.message(`    Path: ${tpl.path}`)
      p.log.message(`    Source: ${tpl.source}`)
      if (tpl.branch) {
        p.log.message(`    Branch: ${tpl.branch}`)
      }
      p.log.message('')
    }
  } else {
    p.log.info('\nTemplates: none registered')
    p.log.message('  Register one with: taito add <path-to-template>')
    p.log.message('')
  }

  const workspaceRoot = findWorkspaceRoot()
  const detectedAgents = detectAllAgents(workspaceRoot)

  if (detectedAgents.length === 0) {
    p.log.info('Skills: no agents detected in workspace.')
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
      `${config.name} (${skills.length} skill${skills.length > 1 ? 's' : ''}):`
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
    p.log.message('')
  }

  if (totalSkills === 0) {
    p.log.info('Skills: none installed yet.')
  }
}
