import { existsSync } from 'node:fs'

import * as p from '@clack/prompts'

import { getInstalledSkills } from '../lib/metadata.js'
import {
  agentConfigs,
  findSkillLinks,
  findWorkspaceRoot,
  getCanonicalSkillsDir,
} from '../lib/paths.js'
import { listRegisteredTemplates } from '../lib/registry.js'

/**
 * List registered templates and installed skills
 */
export async function listCommand(): Promise<void> {
  const templates = listRegisteredTemplates()

  if (templates.length > 0) {
    p.log.info(`\nTemplates (${templates.length}):`)
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
  const skillsDir = getCanonicalSkillsDir(false, workspaceRoot)

  if (!existsSync(skillsDir)) {
    p.log.info('Skills: none installed yet (.agents/skills not found).')
    p.log.message('  Install with: taito add owner/repo')
    return
  }

  const skills = getInstalledSkills('agents', false, workspaceRoot)

  if (skills.length === 0) {
    p.log.info(`Skills: none recorded in ${skillsDir}`)
    return
  }

  p.log.info(
    `Skills (${skills.length}) — canonical: ${skillsDir}`
  )
  p.log.message('')

  for (const skill of skills) {
    const customLabel = skill.customized ? ' (customized)' : ''
    const date = new Date(skill.installedAt).toLocaleDateString()
    const links = findSkillLinks(skill.name, workspaceRoot, false)
    const linkLabel =
      links.length > 0
        ? links.map((a) => agentConfigs[a].name).join(', ')
        : 'none'

    p.log.message(`  ${skill.name}${customLabel}`)
    p.log.message(`    Source: ${skill.source}`)
    p.log.message(`    Installed: ${date}`)
    p.log.message(`    Symlinks: ${linkLabel}`)
    p.log.message('')
  }
}
