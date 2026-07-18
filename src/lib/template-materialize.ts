import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'

import {
  getDefaultComponentValues,
  getDefaultValues,
  getExcludedPatterns,
  parsePresetComponents,
  parsePresetConfig,
  parseTemplateConfig,
  stringifyProjectMeta,
} from './config.js'
import { discoverSkills } from './discovery.js'
import { checkoutTree, revParse } from './git.js'
import { getTemplateConfigPath } from './classify.js'
import { promptForComponents, promptForVariables } from './prompts.js'
import { renderTaitoTree } from './render.js'
import type {
  ComponentValues,
  ProjectMeta,
  TemplateConfig,
  VariableValues,
} from '../types.js'

export interface MaterializeOptions {
  dryRun?: boolean
  configPath?: string
  /** Skip interactive prompts; use defaults + preset */
  nonInteractive?: boolean
}

export interface MaterializeResult {
  files: string[]
  values: VariableValues
  components: ComponentValues
  config: TemplateConfig
  templateCommit: string
  /** Customizable skills that were skipped during tree copy (for separate install) */
  deferredSkills: { path: string; dirName: string; relativePath: string }[]
}

/**
 * Collect customization inputs for a template
 */
export async function collectTemplateInputs(
  templateDir: string,
  options: MaterializeOptions = {}
): Promise<{
  config: TemplateConfig
  values: VariableValues
  components: ComponentValues
}> {
  const config = parseTemplateConfig(getTemplateConfigPath(templateDir))

  let presetValues: VariableValues | undefined
  let presetComponents: ComponentValues | undefined

  if (options.configPath) {
    presetValues = parsePresetConfig(options.configPath)
    presetComponents = parsePresetComponents(options.configPath)
  }

  let values: VariableValues
  if (options.nonInteractive || options.configPath) {
    values = getDefaultValues(config, presetValues)
  } else {
    values = await promptForVariables(config, presetValues, {
      intro: `Customizing template ${config.meta.name}`,
      skipOutro: Object.keys(config.components).length > 0,
    })
  }

  let components: ComponentValues
  if (options.nonInteractive || options.configPath) {
    components = getDefaultComponentValues(config, presetComponents)
  } else {
    components = await promptForComponents(config, presetComponents)
  }

  return { config, values, components }
}

/**
 * Keys in the current template config that are not present in stored project answers.
 */
export function findMissingTemplateInputs(
  config: TemplateConfig,
  existing: {
    values?: VariableValues
    components?: ComponentValues
  } = {}
): { variables: string[]; components: string[] } {
  const existingValues = existing.values ?? {}
  const existingComponents = existing.components ?? {}
  return {
    variables: Object.keys(config.variables).filter(
      (key) => !(key in existingValues)
    ),
    components: Object.keys(config.components).filter(
      (key) => !(key in existingComponents)
    ),
  }
}

/**
 * Resolve template inputs for `taito update`: keep stored answers, prompt only for
 * new variables/components introduced since the project was created/last updated.
 *
 * When `nonInteractive` is true (or `configPath` is set), missing keys take defaults
 * / answers-file values instead of prompting.
 */
export async function collectMissingTemplateInputs(
  templateDir: string,
  existing: {
    values?: VariableValues
    components?: ComponentValues
  } = {},
  options: MaterializeOptions = {}
): Promise<{
  config: TemplateConfig
  values: VariableValues
  components: ComponentValues
  prompted: { variables: string[]; components: string[] }
}> {
  const config = parseTemplateConfig(getTemplateConfigPath(templateDir))

  let presetValues: VariableValues = { ...(existing.values ?? {}) }
  let presetComponents: ComponentValues = { ...(existing.components ?? {}) }

  if (options.configPath) {
    presetValues = {
      ...presetValues,
      ...parsePresetConfig(options.configPath),
    }
    presetComponents = {
      ...presetComponents,
      ...parsePresetComponents(options.configPath),
    }
  }

  const missing = findMissingTemplateInputs(config, {
    values: presetValues,
    components: presetComponents,
  })

  const useDefaults =
    options.nonInteractive || Boolean(options.configPath)

  const intro = `Template '${config.meta.name}' has new customization options`

  let values: VariableValues
  if (missing.variables.length === 0 || useDefaults) {
    values = getDefaultValues(config, presetValues)
  } else {
    values = await promptForVariables(config, presetValues, {
      intro,
      skipOutro: missing.components.length > 0,
      outro: 'New options saved for this update.',
    })
  }

  let components: ComponentValues
  if (missing.components.length === 0 || useDefaults) {
    components = getDefaultComponentValues(config, presetComponents)
  } else {
    components = await promptForComponents(config, presetComponents, {
      intro: missing.variables.length === 0 ? intro : undefined,
    })
  }

  return {
    config,
    values,
    components,
    prompted: useDefaults
      ? { variables: [], components: [] }
      : missing,
  }
}

/**
 * Materialize a template into an output directory (render + copy, skip customizable skills)
 */
export async function materializeTemplate(
  templateDir: string,
  outputDir: string,
  values: VariableValues,
  components: ComponentValues,
  config: TemplateConfig,
  options: MaterializeOptions = {}
): Promise<MaterializeResult> {
  const excluded = getExcludedPatterns(config, components)
  const templateCommit = await revParse(templateDir, 'HEAD')

  // Discover customizable skills to defer
  const allSkills = discoverSkills(templateDir)
  const deferredSkills = allSkills
    .filter((s) => s.isCustomizable)
    .map((s) => ({
      path: s.path,
      dirName: s.dirName,
      relativePath: relative(templateDir, s.path).replace(/\\/g, '/'),
    }))
    .filter((s) => {
      // Exclude skills gated off by components
      for (const pattern of excluded.skills) {
        const normalized = pattern.replace(/\\/g, '/').replace(/\/$/, '')
        if (
          s.relativePath === normalized ||
          s.relativePath.startsWith(normalized + '/') ||
          normalized.endsWith('/' + s.dirName) ||
          normalized === s.dirName
        ) {
          return false
        }
      }
      return true
    })

  if (!options.dryRun) {
    mkdirSync(outputDir, { recursive: true })
  }

  const files = await renderTaitoTree(templateDir, outputDir, values, {
    mode: 'template',
    dryRun: options.dryRun,
    excludePaths: excluded.paths,
    excludeSkills: excluded.skills,
    skipCustomizableSkills: true,
  })

  return {
    files,
    values,
    components,
    config,
    templateCommit,
    deferredSkills,
  }
}

/**
 * Materialize a template at a specific git ref into a temp directory
 */
export async function materializeTemplateAtRef(
  templateDir: string,
  ref: string,
  values: VariableValues,
  components: ComponentValues
): Promise<{ dir: string; files: string[]; cleanup: () => void }> {
  const tempRoot = mkdtempSync(join(tmpdir(), 'taito-tpl-'))
  const checkoutDir = join(tempRoot, 'src')
  const outputDir = join(tempRoot, 'out')

  await checkoutTree(templateDir, ref, checkoutDir)

  if (!existsSync(getTemplateConfigPath(checkoutDir))) {
    rmSync(tempRoot, { recursive: true, force: true })
    throw new Error(
      `Template at ${ref} has no .taito/template.config.toml`
    )
  }

  const config = parseTemplateConfig(getTemplateConfigPath(checkoutDir))
  mkdirSync(outputDir, { recursive: true })

  const excluded = getExcludedPatterns(config, components)
  const files = await renderTaitoTree(checkoutDir, outputDir, values, {
    mode: 'template',
    excludePaths: excluded.paths,
    excludeSkills: excluded.skills,
    skipCustomizableSkills: true,
  })

  return {
    dir: outputDir,
    files,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  }
}

/**
 * Write project.meta.toml into a project
 */
export function writeProjectMeta(
  projectDir: string,
  meta: ProjectMeta
): void {
  const taitoDir = join(projectDir, '.taito')
  mkdirSync(taitoDir, { recursive: true })
  writeFileSync(join(taitoDir, 'project.meta.toml'), stringifyProjectMeta(meta))
}

/**
 * Suggest a template name from a path
 */
export function templateNameFromPath(path: string, override?: string): string {
  if (override) return override
  return basename(path.replace(/[/\\]$/, ''))
}
