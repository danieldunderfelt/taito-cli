import { existsSync, rmSync } from 'node:fs'

import * as p from '@clack/prompts'

import { getInstalledSkills, removeSkillFromMetadata } from '../lib/metadata.js'
import {
  agentConfigs,
  findSkillLinks,
  findWorkspaceRoot,
  getCanonicalSkillOutputDir,
  getSkillOutputDir,
  removeSkillLink,
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
  const skills = getInstalledSkills('agents', false, workspaceRoot)
  const canonicalDir = getCanonicalSkillOutputDir(
    skillName,
    false,
    workspaceRoot
  )
  const links = findSkillLinks(skillName, workspaceRoot, false)

  const known =
    skills.some((s) => s.name === skillName) ||
    existsSync(canonicalDir) ||
    links.length > 0

  if (!known) {
    p.log.error(
      `'${skillName}' is not a registered template or installed skill.`
    )
    process.exit(1)
  }

  const linkNames =
    links.length > 0
      ? links.map((a) => agentConfigs[a].name).join(', ')
      : 'none'

  const confirm = await p.confirm({
    message: `Remove skill '${skillName}' from .agents/skills (symlinks: ${linkNames})?`,
    initialValue: false,
  })

  if (p.isCancel(confirm) || !confirm) {
    p.log.info('Removal cancelled.')
    return
  }

  for (const agent of links) {
    const linkPath = getSkillOutputDir(skillName, agent, false, workspaceRoot)
    removeSkillLink(linkPath)
  }

  if (existsSync(canonicalDir)) {
    rmSync(canonicalDir, { recursive: true, force: true })
  }

  removeSkillFromMetadata(skillName, 'agents', false, workspaceRoot)

  p.log.success(`Removed skill '${skillName}'`)
}
