import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import * as p from '@clack/prompts'

import {
  getDefaultValues,
  parseSkillConfig,
  parseTemplateConfig,
} from '../lib/config.js'
import { isTemplate } from '../lib/classify.js'
import { getTemplateConfigPath } from '../lib/classify.js'
import { getSkillConfigPath, isCustomizableSkill } from '../lib/paths.js'
import { renderWithDefaults } from '../lib/render.js'
import type { BuildOptions } from '../types.js'

/**
 * Build default files from .taito/ templates (skills or project templates)
 */
export async function buildCommand(
  path: string = '.',
  options: BuildOptions
): Promise<void> {
  const spinner = p.spinner()

  try {
    const packageDir = resolve(path)

    if (!existsSync(packageDir)) {
      p.log.error(`Directory not found: ${packageDir}`)
      process.exit(1)
    }

    if (isTemplate(packageDir)) {
      const configPath = getTemplateConfigPath(packageDir)
      const config = parseTemplateConfig(configPath)
      const defaults = getDefaultValues(config)

      p.log.info(`Building template ${config.meta.name} with default values...`)
      for (const [key, value] of Object.entries(defaults)) {
        const displayValue = Array.isArray(value)
          ? value.join(', ')
          : String(value)
        p.log.message(`  ${key}: ${displayValue}`)
      }

      spinner.start('Rendering templates...')
      const files = await renderWithDefaults(
        packageDir,
        defaults,
        options.output
      )
      spinner.stop('Templates rendered!')

      const outputLocation = options.output
        ? resolve(options.output)
        : packageDir
      p.log.success(`Generated files in ${outputLocation}:`)
      for (const file of files) {
        p.log.message(`  ${file}`)
      }
      return
    }

    if (!isCustomizableSkill(packageDir)) {
      p.log.error(
        'Not a customizable skill or template. Expected .taito/skill.config.toml or .taito/template.config.toml'
      )
      process.exit(1)
    }

    const configPath = getSkillConfigPath(packageDir)
    const config = parseSkillConfig(configPath)
    const defaults = getDefaultValues(config)

    p.log.info(`Building ${config.meta.name} with default values...`)

    for (const [key, value] of Object.entries(defaults)) {
      const displayValue = Array.isArray(value)
        ? value.join(', ')
        : String(value)
      p.log.message(`  ${key}: ${displayValue}`)
    }

    spinner.start('Rendering templates...')
    const files = await renderWithDefaults(packageDir, defaults, options.output)
    spinner.stop('Templates rendered!')

    const outputLocation = options.output ? resolve(options.output) : packageDir
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
