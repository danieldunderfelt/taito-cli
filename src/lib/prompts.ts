import * as p from "@clack/prompts";
import type { SkillConfig, Variable, VariableValues } from "../types.js";

/**
 * Prompt user for all variables in a skill config
 */
export async function promptForVariables(
  config: SkillConfig,
  presetValues?: VariableValues
): Promise<VariableValues> {
  const values: VariableValues = {};

  const entries = Object.entries(config.variables);
  if (entries.length === 0) {
    return values;
  }

  p.intro(`Customizing ${config.meta.name}`);

  for (const [key, variable] of entries) {
    // Use preset value if available
    if (presetValues && key in presetValues) {
      values[key] = presetValues[key];
      continue;
    }

    const value = await promptForVariable(key, variable);

    // Check if user cancelled
    if (p.isCancel(value)) {
      p.cancel("Installation cancelled.");
      process.exit(0);
    }

    values[key] = value;
  }

  p.outro("Configuration complete!");

  return values;
}

/**
 * Prompt for a single variable based on its type
 */
async function promptForVariable(
  key: string,
  variable: Variable
): Promise<string | boolean | string[]> {
  switch (variable.type) {
    case "string":
      return promptString(key, variable);

    case "choice":
      return promptChoice(key, variable);

    case "boolean":
      return promptBoolean(key, variable);

    case "array":
      return promptArray(key, variable);

    default:
      throw new Error(`Unknown variable type for '${key}'`);
  }
}

/**
 * Prompt for a string value
 */
async function promptString(
  key: string,
  variable: Extract<Variable, { type: "string" }>
): Promise<string> {
  const result = await p.text({
    message: variable.prompt,
    placeholder: variable.default,
    defaultValue: variable.default,
    validate: variable.validate
      ? (value) => {
          const regex = new RegExp(variable.validate!);
          if (!regex.test(value)) {
            return `Value must match pattern: ${variable.validate}`;
          }
        }
      : undefined,
  });

  if (p.isCancel(result)) {
    return result as never;
  }

  return result;
}

/**
 * Prompt for a choice value
 */
async function promptChoice(
  key: string,
  variable: Extract<Variable, { type: "choice" }>
): Promise<string> {
  const result = await p.select({
    message: variable.prompt,
    options: variable.options.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
    initialValue: variable.default,
  });

  if (p.isCancel(result)) {
    return result as never;
  }

  return result;
}

/**
 * Prompt for a boolean value
 */
async function promptBoolean(
  key: string,
  variable: Extract<Variable, { type: "boolean" }>
): Promise<boolean> {
  const result = await p.confirm({
    message: variable.prompt,
    initialValue: variable.default ?? false,
  });

  if (p.isCancel(result)) {
    return result as never;
  }

  return result;
}

/**
 * Prompt for an array value (comma-separated input)
 */
async function promptArray(
  key: string,
  variable: Extract<Variable, { type: "array" }>
): Promise<string[]> {
  const defaultStr = variable.default?.join(", ") ?? "";

  const result = await p.text({
    message: `${variable.prompt}`,
    placeholder: defaultStr || "value1, value2, value3",
    defaultValue: defaultStr,
  });

  if (p.isCancel(result)) {
    return result as never;
  }

  // Parse comma-separated values
  return result
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
