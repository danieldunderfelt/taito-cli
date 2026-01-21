import * as p from "@clack/prompts";
import { getInstalledSkills } from "../lib/metadata.js";
import { findWorkspaceRoot, getSkillsDir } from "../lib/paths.js";
import { existsSync } from "node:fs";

/**
 * List installed skills
 */
export async function listCommand(): Promise<void> {
  const workspaceRoot = findWorkspaceRoot();
  const skillsDir = getSkillsDir(workspaceRoot);

  if (!existsSync(skillsDir)) {
    p.log.info("No skills installed yet.");
    p.log.message(`Skills directory: ${skillsDir}`);
    return;
  }

  const skills = getInstalledSkills(workspaceRoot);

  if (skills.length === 0) {
    p.log.info("No skills installed yet.");
    return;
  }

  p.log.info(`Installed skills (${skills.length}):`);
  p.log.message("");

  for (const skill of skills) {
    const customLabel = skill.customized ? " (customized)" : "";
    const date = new Date(skill.installedAt).toLocaleDateString();

    p.log.message(`  ${skill.name}${customLabel}`);
    p.log.message(`    Source: ${skill.source}`);
    p.log.message(`    Installed: ${date}`);
    p.log.message("");
  }

  p.log.message(`Skills directory: ${skillsDir}`);
}
