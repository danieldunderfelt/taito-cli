import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Find the workspace root by looking for common markers
 */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let current = resolve(startDir);
  const root = resolve("/");

  while (current !== root) {
    // Check for workspace markers in order of preference
    if (existsSync(join(current, ".cursor"))) {
      return current;
    }
    if (existsSync(join(current, ".git"))) {
      return current;
    }
    if (existsSync(join(current, "package.json"))) {
      return current;
    }

    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }

  // Fallback to start directory
  return startDir;
}

/**
 * Get the skills output directory
 */
export function getSkillsDir(workspaceRoot?: string): string {
  const root = workspaceRoot ?? findWorkspaceRoot();
  return join(root, ".cursor", "skills");
}

/**
 * Get the output path for a specific skill
 */
export function getSkillOutputDir(skillName: string, workspaceRoot?: string): string {
  return join(getSkillsDir(workspaceRoot), skillName);
}

/**
 * Get the metadata file path for tracking installed skills
 */
export function getMetadataPath(workspaceRoot?: string): string {
  return join(getSkillsDir(workspaceRoot), ".skillz-meta.json");
}

/**
 * Check if a directory contains a customizable skill
 */
export function isCustomizableSkill(skillDir: string): boolean {
  return existsSync(join(skillDir, ".skillz", "skill.config.toml"));
}

/**
 * Get the .skillz config directory path
 */
export function getSkillzConfigDir(skillDir: string): string {
  return join(skillDir, ".skillz");
}

/**
 * Get the skill config file path
 */
export function getSkillConfigPath(skillDir: string): string {
  return join(skillDir, ".skillz", "skill.config.toml");
}
