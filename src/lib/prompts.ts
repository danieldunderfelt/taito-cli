import * as p from '@clack/prompts'
import type { SkillConfig, Variable, VariableValues } from '../types.js'

// Module-level cache for current session
let sessionVariableCache: VariableValues = {}

/**
 * Clear the session variable cache
 */
export function clearVariableCache(): void {
  sessionVariableCache = {}
}

/**
 * Interpolate ${VAR} tokens in a string with values from the provided object
 * Supports nested references and falls back to empty string for undefined values
 */
export function interpolate(template: string, values: VariableValues): string {
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
 * Interpolate values in a variable definition (prompt, default, options)
 */
function interpolateVariable(
  variable: Variable,
  values: VariableValues
): Variable {
  const interpolatedPrompt = interpolate(variable.prompt, values)

  switch (variable.type) {
    case 'string':
      return {
        ...variable,
        prompt: interpolatedPrompt,
        default:
          variable.default !== undefined
            ? interpolate(variable.default, values)
            : undefined,
      }

    case 'choice':
      return {
        ...variable,
        prompt: interpolatedPrompt,
        default:
          variable.default !== undefined
            ? interpolate(variable.default, values)
            : undefined,
        options: variable.options.map((opt) => ({
          value: opt.value,
          label: interpolate(opt.label, values),
        })),
      }

    case 'boolean':
      return {
        ...variable,
        prompt: interpolatedPrompt,
      }

    case 'array':
      return {
        ...variable,
        prompt: interpolatedPrompt,
      }
  }
}

/**
 * Prompt user for all variables in a skill config
 */
export async function promptForVariables(
  config: SkillConfig,
  presetValues?: VariableValues
): Promise<VariableValues> {
  const values: VariableValues = {}

  const entries = Object.entries(config.variables)
  if (entries.length === 0) {
    return values
  }

  p.intro(`Customizing ${config.meta.name}`)

  for (const [key, variable] of entries) {
    // Use preset value if available
    if (presetValues && key in presetValues) {
      values[key] = presetValues[key]
      // Store in cache for future skills
      sessionVariableCache[key] = presetValues[key]
      continue
    }

    // Interpolate variable definition with already-collected values
    const interpolatedVariable = interpolateVariable(variable, values)

    // Check cache for previously answered value
    const cachedValue = sessionVariableCache[key]
    const value = await promptForVariable(
      key,
      interpolatedVariable,
      cachedValue
    )

    // Check if user cancelled
    if (p.isCancel(value)) {
      p.cancel('Installation cancelled.')
      process.exit(0)
    }

    values[key] = value
    // Store in cache for future skills
    sessionVariableCache[key] = value
  }

  p.outro('Configuration complete!')

  return values
}

/**
 * Prompt for a single variable based on its type
 */
async function promptForVariable(
  key: string,
  variable: Variable,
  cachedValue?: string | boolean | string[]
): Promise<string | boolean | string[]> {
  switch (variable.type) {
    case 'string':
      return promptString(key, variable, cachedValue as string | undefined)

    case 'choice':
      return promptChoice(key, variable, cachedValue as string | undefined)

    case 'boolean':
      return promptBoolean(key, variable, cachedValue as boolean | undefined)

    case 'array':
      return promptArray(key, variable, cachedValue as string[] | undefined)

    default:
      throw new Error(`Unknown variable type for '${key}'`)
  }
}

/**
 * Prompt for a string value
 */
async function promptString(
  key: string,
  variable: Extract<Variable, { type: 'string' }>,
  cachedValue?: string
): Promise<string> {
  // Use cached value as default if available, otherwise use variable default
  const defaultValue = cachedValue ?? variable.default

  const result = await p.text({
    message: variable.prompt,
    placeholder: defaultValue,
    defaultValue: defaultValue,
    validate: variable.validate
      ? (value) => {
          const regex = new RegExp(variable.validate!)
          if (!regex.test(value)) {
            return `Value must match pattern: ${variable.validate}`
          }
        }
      : undefined,
  })

  if (p.isCancel(result)) {
    return result as never
  }

  return result
}

/**
 * Prompt for a choice value
 */
async function promptChoice(
  key: string,
  variable: Extract<Variable, { type: 'choice' }>,
  cachedValue?: string
): Promise<string> {
  // Use cached value as initial if available, otherwise use variable default
  const initialValue = cachedValue ?? variable.default

  const result = await p.select({
    message: variable.prompt,
    options: variable.options.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
    initialValue: initialValue,
  })

  if (p.isCancel(result)) {
    return result as never
  }

  return result
}

/**
 * Prompt for a boolean value
 */
async function promptBoolean(
  key: string,
  variable: Extract<Variable, { type: 'boolean' }>,
  cachedValue?: boolean
): Promise<boolean> {
  // Use cached value as initial if available, otherwise use variable default
  const initialValue = cachedValue ?? variable.default ?? false

  const result = await p.confirm({
    message: variable.prompt,
    initialValue: initialValue,
  })

  if (p.isCancel(result)) {
    return result as never
  }

  return result
}

/**
 * Prompt for an array value (comma-separated input)
 */
async function promptArray(
  key: string,
  variable: Extract<Variable, { type: 'array' }>,
  cachedValue?: string[]
): Promise<string[]> {
  // Use cached value if available, otherwise use variable default
  const defaultArray = cachedValue ?? variable.default
  const defaultStr = defaultArray?.join(', ') ?? ''

  const result = await p.text({
    message: `${variable.prompt}`,
    placeholder: defaultStr || 'value1, value2, value3',
    defaultValue: defaultStr,
  })

  if (p.isCancel(result)) {
    return result as never
  }

  // Parse comma-separated values
  return result
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
