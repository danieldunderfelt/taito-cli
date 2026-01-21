import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { DiscoveredSkill } from '../types.js'
import { isCustomizableSkill } from './paths.js'

/**
 * Discover all skills in a repository directory
 * A skill is defined as a directory containing a SKILL.md file
 * Skills cannot contain other skills, so traversal stops when SKILL.md is found
 */
export function discoverSkills(repoDir: string): DiscoveredSkill[] {
  const skills: DiscoveredSkill[] = []

  function traverseDirectory(dir: string): void {
    // Check if this directory contains a SKILL.md file
    const skillMdPath = join(dir, 'SKILL.md')

    if (existsSync(skillMdPath)) {
      // Found a skill - record it and don't traverse deeper
      const dirName = basename(dir)

      const isCustomizable = isCustomizableSkill(dir)
      skills.push({
        path: dir,
        dirName,
        isCustomizable,
      })
      return
    }

    // No SKILL.md found - continue traversing subdirectories
    try {
      const entries = readdirSync(dir)

      for (const entry of entries) {
        const fullPath = join(dir, entry)
        const stat = statSync(fullPath)

        if (stat.isDirectory()) {
          // Skip common non-skill directories
          if (
            entry === 'node_modules' ||
            entry === '.git' ||
            (entry.startsWith('.') && entry !== '.skillz')
          ) {
            continue
          }

          traverseDirectory(fullPath)
        }
      }
    } catch {
      // Directory doesn't exist or can't be read - skip it
    }
  }

  traverseDirectory(repoDir)
  return skills
}
