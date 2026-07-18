import { readFileSync } from 'node:fs'

import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

import type {
  ChoiceOption,
  ComponentValues,
  PackageMeta,
  ProjectMeta,
  SkillConfig,
  TemplateComponent,
  TemplateConfig,
  Variable,
  VariableValues,
} from '../types.js'

/**
 * Parse a skill.config.toml file
 */
export function parseSkillConfig(configPath: string): SkillConfig {
  const content = readFileSync(configPath, 'utf-8')
  const parsed = parseToml(content)

  const meta = parseMeta(
    parsed.meta as Record<string, unknown>,
    'skill.config.toml'
  )
  const variables = parseVariables(
    parsed.variables as Record<string, unknown> | undefined
  )

  return { meta, variables }
}

/**
 * Parse a template.config.toml file
 */
export function parseTemplateConfig(configPath: string): TemplateConfig {
  const content = readFileSync(configPath, 'utf-8')
  const parsed = parseToml(content)

  const metaRaw = parsed.meta as Record<string, unknown>
  const meta = parseMeta(metaRaw, 'template.config.toml')
  const extendsVal =
    typeof metaRaw?.extends === 'string' ? metaRaw.extends : undefined

  const variables = parseVariables(
    parsed.variables as Record<string, unknown> | undefined
  )
  const components = parseComponents(
    parsed.components as Record<string, unknown> | undefined
  )

  return {
    meta: { ...meta, extends: extendsVal },
    variables,
    components,
  }
}

/**
 * Parse the [meta] section
 */
function parseMeta(
  meta: Record<string, unknown> | undefined,
  fileLabel: string
): PackageMeta {
  if (!meta || typeof meta !== 'object') {
    throw new Error(`Missing [meta] section in ${fileLabel}`)
  }

  const name = meta.name
  if (typeof name !== 'string' || !name) {
    throw new Error(`Missing or invalid 'name' in [meta] section of ${fileLabel}`)
  }

  return {
    name,
    version: typeof meta.version === 'string' ? meta.version : undefined,
    description:
      typeof meta.description === 'string' ? meta.description : undefined,
  }
}

/**
 * Parse the [variables] section
 */
export function parseVariables(
  variables: Record<string, unknown> | undefined
): Record<string, Variable> {
  if (!variables || typeof variables !== 'object') {
    return {}
  }

  const result: Record<string, Variable> = {}

  for (const [key, value] of Object.entries(variables)) {
    if (typeof value !== 'object' || value === null) {
      continue
    }

    const varDef = value as Record<string, unknown>
    const type = varDef.type as string

    if (!type) {
      throw new Error(`Variable '${key}' is missing 'type' field`)
    }

    const prompt = varDef.prompt as string
    if (!prompt) {
      throw new Error(`Variable '${key}' is missing 'prompt' field`)
    }

    const required = varDef.required as boolean | undefined

    switch (type) {
      case 'string':
        result[key] = {
          type: 'string',
          prompt,
          required,
          default: varDef.default as string | undefined,
          validate: varDef.validate as string | undefined,
        }
        break

      case 'choice': {
        const options = parseChoiceOptions(varDef.options, key)
        result[key] = {
          type: 'choice',
          prompt,
          required,
          default: varDef.default as string | undefined,
          options,
        }
        break
      }

      case 'boolean':
        result[key] = {
          type: 'boolean',
          prompt,
          required,
          default: varDef.default as boolean | undefined,
        }
        break

      case 'array':
        result[key] = {
          type: 'array',
          prompt,
          required,
          default: varDef.default as string[] | undefined,
          itemType: 'string',
        }
        break

      default:
        throw new Error(`Unknown variable type '${type}' for '${key}'`)
    }
  }

  return result
}

function parseComponents(
  components: Record<string, unknown> | undefined
): Record<string, TemplateComponent> {
  if (!components || typeof components !== 'object') {
    return {}
  }

  const result: Record<string, TemplateComponent> = {}

  for (const [key, value] of Object.entries(components)) {
    if (typeof value !== 'object' || value === null) continue
    const def = value as Record<string, unknown>
    const prompt =
      typeof def.prompt === 'string' ? def.prompt : `Include ${key}?`

    result[key] = {
      prompt,
      default: typeof def.default === 'boolean' ? def.default : true,
      paths: Array.isArray(def.paths)
        ? def.paths.filter((p): p is string => typeof p === 'string')
        : undefined,
      skills: Array.isArray(def.skills)
        ? def.skills.filter((p): p is string => typeof p === 'string')
        : undefined,
    }
  }

  return result
}

/**
 * Parse choice options array
 */
function parseChoiceOptions(options: unknown, varName: string): ChoiceOption[] {
  if (!Array.isArray(options)) {
    throw new Error(`Variable '${varName}' is missing 'options' array`)
  }

  return options.map((opt, index) => {
    if (typeof opt !== 'object' || opt === null) {
      throw new Error(
        `Invalid option at index ${index} for variable '${varName}'`
      )
    }

    const optObj = opt as Record<string, unknown>
    const value = optObj.value
    const label = optObj.label

    if (typeof value !== 'string') {
      throw new Error(
        `Option at index ${index} for variable '${varName}' is missing 'value'`
      )
    }
    if (typeof label !== 'string') {
      throw new Error(
        `Option at index ${index} for variable '${varName}' is missing 'label'`
      )
    }

    return { value, label }
  })
}

/**
 * Interpolate ${VAR} tokens in a string with values from the provided object
 */
function interpolateString(template: string, values: VariableValues): string {
  return template.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const value = values[varName.trim()]
    if (value === undefined) {
      return match // Keep original if not found
    }
    if (Array.isArray(value)) {
      return value.join(', ')
    }
    return String(value)
  })
}

/**
 * Extract default values from config with interpolation support
 * Processes variables in order so later defaults can reference earlier values
 */
export function getDefaultValues(
  config: { variables: Record<string, Variable> },
  presetValues?: VariableValues
): VariableValues {
  const values: VariableValues = {}

  for (const [key, variable] of Object.entries(config.variables)) {
    if (presetValues && key in presetValues) {
      values[key] = presetValues[key]
      continue
    }

    if (variable.default !== undefined) {
      if (variable.type === 'string' && typeof variable.default === 'string') {
        values[key] = interpolateString(variable.default, values)
      } else if (
        variable.type === 'choice' &&
        typeof variable.default === 'string'
      ) {
        values[key] = interpolateString(variable.default, values)
      } else {
        values[key] = variable.default
      }
    }
  }

  return values
}

/**
 * Default component selections from template config
 */
export function getDefaultComponentValues(
  config: TemplateConfig,
  preset?: ComponentValues
): ComponentValues {
  const values: ComponentValues = {}
  for (const [key, component] of Object.entries(config.components)) {
    if (preset && key in preset) {
      values[key] = preset[key]
    } else {
      values[key] = component.default ?? true
    }
  }
  return values
}

/**
 * Collect path/skill globs that should be excluded based on component selections
 */
export function getExcludedPatterns(
  config: TemplateConfig,
  components: ComponentValues
): { paths: string[]; skills: string[] } {
  const paths: string[] = []
  const skills: string[] = []

  for (const [key, component] of Object.entries(config.components)) {
    if (components[key]) continue
    if (component.paths) paths.push(...component.paths)
    if (component.skills) skills.push(...component.skills)
  }

  return { paths, skills }
}

/**
 * Parse a preset config file (user-provided answers)
 */
export function parsePresetConfig(configPath: string): VariableValues {
  const content = readFileSync(configPath, 'utf-8')
  const parsed = parseToml(content)

  const values: VariableValues = {}

  for (const [key, value] of Object.entries(parsed)) {
    // Skip nested tables like [components]
    if (
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      Array.isArray(value)
    ) {
      values[key] = value as string | boolean | string[]
    }
  }

  return values
}

/**
 * Parse optional [components] section from a preset file
 */
export function parsePresetComponents(
  configPath: string
): ComponentValues | undefined {
  const content = readFileSync(configPath, 'utf-8')
  const parsed = parseToml(content) as Record<string, unknown>
  const components = parsed.components
  if (typeof components !== 'object' || components === null) {
    return undefined
  }

  const values: ComponentValues = {}
  for (const [key, value] of Object.entries(
    components as Record<string, unknown>
  )) {
    if (typeof value === 'boolean') {
      values[key] = value
    }
  }
  return values
}

/**
 * Parse project.meta.toml
 */
export function parseProjectMeta(metaPath: string): ProjectMeta {
  const content = readFileSync(metaPath, 'utf-8')
  const parsed = parseToml(content) as Record<string, unknown>
  const project = parsed.project as Record<string, unknown> | undefined

  if (!project || typeof project.template !== 'string') {
    throw new Error('Invalid project.meta.toml: missing [project].template')
  }

  const variables: VariableValues = {}
  const variablesRaw = parsed.variables as Record<string, unknown> | undefined
  if (variablesRaw) {
    for (const [key, value] of Object.entries(variablesRaw)) {
      if (
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        Array.isArray(value)
      ) {
        variables[key] = value as string | boolean | string[]
      }
    }
  }

  const components: ComponentValues = {}
  const componentsRaw = parsed.components as Record<string, unknown> | undefined
  if (componentsRaw) {
    for (const [key, value] of Object.entries(componentsRaw)) {
      if (typeof value === 'boolean') {
        components[key] = value
      }
    }
  }

  return {
    project: {
      template: project.template,
      templatePath:
        typeof project.templatePath === 'string' ? project.templatePath : '',
      templateCommit:
        typeof project.templateCommit === 'string'
          ? project.templateCommit
          : '',
      createdAt:
        typeof project.createdAt === 'string'
          ? project.createdAt
          : new Date().toISOString(),
    },
    variables,
    components,
  }
}

/**
 * Serialize project meta to TOML string
 */
export function stringifyProjectMeta(meta: ProjectMeta): string {
  return stringifyToml(meta)
}
