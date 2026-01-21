import { existsSync, rmSync } from "node:fs";
import * as p from "@clack/prompts";
import { removeSkillFromMetadata, isSkillInstalled } from "../lib/metadata.js";
import { findWorkspaceRoot, getSkillOutputDir } from "../lib/paths.js";

/**
 * Remove an installed skill
 */
export async function removeCommand(skillName: string): Promise<void> {
  const workspaceRoot = findWorkspaceRoot();
  const skillDir = getSkillOutputDir(skillName, workspaceRoot);

  // Check if skill exists
  if (!existsSync(skillDir)) {
    p.log.error(`Skill '${skillName}' is not installed.`);
    process.exit(1);
  }

  // Confirm removal
  const confirm = await p.confirm({
    message: `Remove skill '${skillName}'?`,
    initialValue: false,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.log.info("Removal cancelled.");
    return;
  }

  // Remove directory
  try {
    rmSync(skillDir, { recursive: true, force: true });
  } catch (error) {
    const err = error as Error;
    p.log.error(`Failed to remove skill directory: ${err.message}`);
    process.exit(1);
  }

  // Remove from metadata
  removeSkillFromMetadata(skillName, workspaceRoot);

  p.log.success(`Removed skill '${skillName}'`);
}
