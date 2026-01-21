import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { InstalledSkill, TaitoMetadata, VariableValues } from '../types.js'
import { getMetadataPath, type AgentType } from './paths.js'

const CURRENT_VERSION = '1.0'

/**
 * Read the taito metadata file
 */
export function readMetadata(
  agent?: AgentType,
  global?: boolean,
  workspaceRoot?: string
): TaitoMetadata {
  const metadataPath = getMetadataPath(agent, global, workspaceRoot)

  if (!existsSync(metadataPath)) {
    return {
      version: CURRENT_VERSION,
      skills: [],
    }
  }

  try {
    const content = readFileSync(metadataPath, 'utf-8')
    return JSON.parse(content) as TaitoMetadata
  } catch {
    return {
      version: CURRENT_VERSION,
      skills: [],
    }
  }
}

/**
 * Write the taito metadata file
 */
export function writeMetadata(
  metadata: TaitoMetadata,
  agent?: AgentType,
  global?: boolean,
  workspaceRoot?: string
): void {
  const metadataPath = getMetadataPath(agent, global, workspaceRoot)

  // Ensure directory exists
  mkdirSync(dirname(metadataPath), { recursive: true })

  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
}

/**
 * Add or update an installed skill in metadata
 */
export function recordInstalledSkill(
  name: string,
  source: string,
  customized: boolean,
  variables?: VariableValues,
  agent?: AgentType,
  global?: boolean,
  workspaceRoot?: string
): void {
  const metadata = readMetadata(agent, global, workspaceRoot)

  // Remove existing entry if present
  metadata.skills = metadata.skills.filter((s) => s.name !== name)

  // Add new entry
  const skill: InstalledSkill = {
    name,
    source,
    installedAt: new Date().toISOString(),
    customized,
    ...(customized && variables ? { variables } : {}),
  }

  metadata.skills.push(skill)

  writeMetadata(metadata, agent, global, workspaceRoot)
}

/**
 * Remove a skill from metadata
 */
export function removeSkillFromMetadata(
  name: string,
  agent?: AgentType,
  global?: boolean,
  workspaceRoot?: string
): boolean {
  const metadata = readMetadata(agent, global, workspaceRoot)

  const initialCount = metadata.skills.length
  metadata.skills = metadata.skills.filter((s) => s.name !== name)

  if (metadata.skills.length === initialCount) {
    return false // Skill not found
  }

  writeMetadata(metadata, agent, global, workspaceRoot)
  return true
}

/**
 * Get list of installed skills
 */
export function getInstalledSkills(
  agent?: AgentType,
  global?: boolean,
  workspaceRoot?: string
): InstalledSkill[] {
  const metadata = readMetadata(agent, global, workspaceRoot)
  return metadata.skills
}

/**
 * Check if a skill is installed
 */
export function isSkillInstalled(
  name: string,
  agent?: AgentType,
  global?: boolean,
  workspaceRoot?: string
): boolean {
  const metadata = readMetadata(agent, global, workspaceRoot)
  return metadata.skills.some((s) => s.name === name)
}
