import { readFileSync } from 'node:fs'
import { parse as parseToml } from 'smol-toml'
import type {
  ChoiceOption,
  SkillConfig,
  SkillMeta,
  Variable,
  VariableValues,
} from '../types.js'

/**
 * Parse a skill.config.toml file
 */
export function parseSkillConfig(configPath: string): SkillConfig {
  const content = readFileSync(configPath, 'utf-8')
  const parsed = parseToml(content)

  // Parse meta section
  const meta = parseMeta(parsed.meta as Record<string, unknown>)

  // Parse variables section
  const variables = parseVariables(
    parsed.variables as Record<string, unknown> | undefined
  )

  return { meta, variables }
}

/**
 * Parse the [meta] section
 */
function parseMeta(meta: Record<string, unknown> | undefined): SkillMeta {
  if (!meta || typeof meta !== 'object') {
    throw new Error('Missing [meta] section in skill.config.toml')
  }

  const name = meta.name
  if (typeof name !== 'string' || !name) {
    throw new Error("Missing or invalid 'name' in [meta] section")
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
function parseVariables(
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

      case 'choice':
        const options = parseChoiceOptions(varDef.options, key)
        result[key] = {
          type: 'choice',
          prompt,
          required,
          default: varDef.default as string | undefined,
          options,
        }
        break

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
  config: SkillConfig,
  presetValues?: VariableValues
): VariableValues {
  const values: VariableValues = {}

  for (const [key, variable] of Object.entries(config.variables)) {
    // If preset value exists, use it (allows interpolation to work with user-provided values)
    if (presetValues && key in presetValues) {
      values[key] = presetValues[key]
      continue
    }

    // Process default with interpolation
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
 * Parse a preset config file (user-provided answers)
 */
export function parsePresetConfig(configPath: string): VariableValues {
  const content = readFileSync(configPath, 'utf-8')
  const parsed = parseToml(content)

  const values: VariableValues = {}

  for (const [key, value] of Object.entries(parsed)) {
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
