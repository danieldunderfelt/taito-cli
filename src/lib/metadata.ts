import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getMetadataPath, getSkillsDir } from "./paths.js";
import type { SkillzMetadata, InstalledSkill, VariableValues } from "../types.js";

const CURRENT_VERSION = "1.0";

/**
 * Read the skillz metadata file
 */
export function readMetadata(workspaceRoot?: string): SkillzMetadata {
  const metadataPath = getMetadataPath(workspaceRoot);

  if (!existsSync(metadataPath)) {
    return {
      version: CURRENT_VERSION,
      skills: [],
    };
  }

  try {
    const content = readFileSync(metadataPath, "utf-8");
    return JSON.parse(content) as SkillzMetadata;
  } catch {
    return {
      version: CURRENT_VERSION,
      skills: [],
    };
  }
}

/**
 * Write the skillz metadata file
 */
export function writeMetadata(
  metadata: SkillzMetadata,
  workspaceRoot?: string
): void {
  const metadataPath = getMetadataPath(workspaceRoot);

  // Ensure directory exists
  mkdirSync(dirname(metadataPath), { recursive: true });

  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

/**
 * Add or update an installed skill in metadata
 */
export function recordInstalledSkill(
  name: string,
  source: string,
  customized: boolean,
  variables?: VariableValues,
  workspaceRoot?: string
): void {
  const metadata = readMetadata(workspaceRoot);

  // Remove existing entry if present
  metadata.skills = metadata.skills.filter((s) => s.name !== name);

  // Add new entry
  const skill: InstalledSkill = {
    name,
    source,
    installedAt: new Date().toISOString(),
    customized,
    ...(customized && variables ? { variables } : {}),
  };

  metadata.skills.push(skill);

  writeMetadata(metadata, workspaceRoot);
}

/**
 * Remove a skill from metadata
 */
export function removeSkillFromMetadata(
  name: string,
  workspaceRoot?: string
): boolean {
  const metadata = readMetadata(workspaceRoot);

  const initialCount = metadata.skills.length;
  metadata.skills = metadata.skills.filter((s) => s.name !== name);

  if (metadata.skills.length === initialCount) {
    return false; // Skill not found
  }

  writeMetadata(metadata, workspaceRoot);
  return true;
}

/**
 * Get list of installed skills
 */
export function getInstalledSkills(workspaceRoot?: string): InstalledSkill[] {
  const metadata = readMetadata(workspaceRoot);
  return metadata.skills;
}

/**
 * Check if a skill is installed
 */
export function isSkillInstalled(
  name: string,
  workspaceRoot?: string
): boolean {
  const metadata = readMetadata(workspaceRoot);
  return metadata.skills.some((s) => s.name === name);
}
