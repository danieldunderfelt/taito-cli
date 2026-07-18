import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { discoverSkills } from './discovery.js'
import type { SourceKind } from '../types.js'

/**
 * Check if a directory is a taito project template
 */
export function isTemplate(dir: string): boolean {
  return existsSync(join(dir, '.taito', 'template.config.toml'))
}

/**
 * Get the template config path
 */
export function getTemplateConfigPath(dir: string): string {
  return join(dir, '.taito', 'template.config.toml')
}

/**
 * Get project meta path
 */
export function getProjectMetaPath(dir: string): string {
  return join(dir, '.taito', 'project.meta.toml')
}

/**
 * Check if a directory is a taito-initialized project
 */
export function isTaitoProject(dir: string): boolean {
  return existsSync(getProjectMetaPath(dir))
}

/**
 * Classify a directory as template, skill source, or unknown
 */
export function classifySource(dir: string): SourceKind {
  if (isTemplate(dir)) {
    return 'template'
  }

  const skills = discoverSkills(dir)
  if (skills.length > 0) {
    return 'skill'
  }

  return 'unknown'
}
