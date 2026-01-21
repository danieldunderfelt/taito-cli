import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import { getDefaultValues, parseSkillConfig } from '../lib/config.js'
import { getSkillConfigPath, isCustomizableSkill } from '../lib/paths.js'
import { renderWithDefaults } from '../lib/render.js'
import type { BuildOptions } from '../types.js'

/**
 * Build default files from .taito/ templates
 * For skill authors to regenerate SKILL.md etc. with default values
 */
export async function buildCommand(
  path: string = '.',
  options: BuildOptions
): Promise<void> {
  const spinner = p.spinner()

  try {
    const skillDir = resolve(path)

    // Check if directory exists
    if (!existsSync(skillDir)) {
      p.log.error(`Directory not found: ${skillDir}`)
      process.exit(1)
    }

    // Check if it's a customizable skill
    if (!isCustomizableSkill(skillDir)) {
      p.log.error('No .taito/ folder found. This is not a customizable skill.')
      process.exit(1)
    }

    // Parse config
    const configPath = getSkillConfigPath(skillDir)
    const config = parseSkillConfig(configPath)

    // Get default values
    const defaults = getDefaultValues(config)

    p.log.info(`Building ${config.meta.name} with default values...`)

    // Show defaults being used
    for (const [key, value] of Object.entries(defaults)) {
      const displayValue = Array.isArray(value)
        ? value.join(', ')
        : String(value)
      p.log.message(`  ${key}: ${displayValue}`)
    }

    // Render templates with defaults
    spinner.start('Rendering templates...')
    const files = await renderWithDefaults(skillDir, defaults, options.output)
    spinner.stop('Templates rendered!')

    // Show results
    const outputLocation = options.output ? resolve(options.output) : skillDir
    p.log.success(`Generated files in ${outputLocation}:`)
    for (const file of files) {
      p.log.message(`  ${file}`)
    }
  } catch (error) {
    spinner.stop('Failed')
    const err = error as Error
    p.log.error(err.message)
    process.exit(1)
  }
}
