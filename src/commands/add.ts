import { existsSync, mkdirSync, cpSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import * as p from "@clack/prompts";
import {
  parseSkillSource,
  fetchFromGitHub,
  cleanupTempDir,
} from "../lib/github.js";
import { parseSkillConfig, getDefaultValues, parsePresetConfig } from "../lib/config.js";
import { promptForVariables } from "../lib/prompts.js";
import { renderSkill } from "../lib/render.js";
import {
  isCustomizableSkill,
  getSkillConfigPath,
  getSkillOutputDir,
  findWorkspaceRoot,
} from "../lib/paths.js";
import { recordInstalledSkill, isSkillInstalled } from "../lib/metadata.js";
import type { AddOptions } from "../types.js";

/**
 * Add/install a skill from GitHub or local path
 */
export async function addCommand(
  source: string,
  options: AddOptions
): Promise<void> {
  const spinner = p.spinner();

  try {
    // Parse source
    const skillSource = parseSkillSource(source, options.ref);

    let skillDir: string;
    let shouldCleanup = false;

    if (skillSource.type === "github") {
      spinner.start(`Fetching ${source}...`);
      skillDir = await fetchFromGitHub(skillSource);
      shouldCleanup = true;
      spinner.stop(`Fetched ${source}`);
    } else {
      skillDir = resolve(skillSource.path!);
      if (!existsSync(skillDir)) {
        p.log.error(`Local path not found: ${skillDir}`);
        process.exit(1);
      }
    }

    try {
      // Check if customizable
      const customizable = isCustomizableSkill(skillDir);
      let skillName: string;
      let customized = false;
      let values = {};

      if (customizable) {
        p.log.info("Customizable skill detected.");

        // Parse config
        const configPath = getSkillConfigPath(skillDir);
        const config = parseSkillConfig(configPath);
        skillName = config.meta.name;

        // Get values from preset config or prompt user
        if (options.config) {
          values = parsePresetConfig(options.config);
          // Merge with defaults for any missing values
          const defaults = getDefaultValues(config);
          values = { ...defaults, ...values };
        } else {
          values = await promptForVariables(config);
        }

        customized = true;
      } else {
        // Non-customizable skill - get name from SKILL.md frontmatter
        skillName = extractSkillName(skillDir);
        p.log.info(`Installing standard skill: ${skillName}`);
      }

      // Determine output directory
      const workspaceRoot = findWorkspaceRoot();
      const outputDir = options.output
        ? resolve(options.output)
        : getSkillOutputDir(skillName, workspaceRoot);

      // Check if already installed
      if (existsSync(outputDir) && !options.dryRun) {
        const overwrite = await p.confirm({
          message: `Skill '${skillName}' already exists. Overwrite?`,
          initialValue: false,
        });

        if (p.isCancel(overwrite) || !overwrite) {
          p.log.info("Installation cancelled.");
          return;
        }
      }

      // Render or copy skill
      spinner.start("Installing skill...");

      let files: string[];
      if (customizable) {
        files = await renderSkill(skillDir, outputDir, values, options.dryRun);
      } else {
        files = copyStandardSkill(skillDir, outputDir, options.dryRun);
      }

      spinner.stop("Skill installed!");

      // Record in metadata
      if (!options.dryRun) {
        recordInstalledSkill(
          skillName,
          source,
          customized,
          customized ? values : undefined,
          workspaceRoot
        );
      }

      // Show results
      p.log.success(`Installed to ${outputDir}`);
      for (const file of files.slice(0, 10)) {
        p.log.message(`  ${file}`);
      }
      if (files.length > 10) {
        p.log.message(`  ... and ${files.length - 10} more files`);
      }
    } finally {
      // Clean up temp directory if we fetched from GitHub
      if (shouldCleanup) {
        cleanupTempDir(skillDir);
      }
    }
  } catch (error) {
    spinner.stop("Failed");
    const err = error as Error;
    p.log.error(err.message);
    process.exit(1);
  }
}

/**
 * Extract skill name from SKILL.md frontmatter
 */
function extractSkillName(skillDir: string): string {
  const skillMdPath = join(skillDir, "SKILL.md");

  if (!existsSync(skillMdPath)) {
    throw new Error("No SKILL.md found in skill directory");
  }

  const { readFileSync } = require("node:fs");
  const content = readFileSync(skillMdPath, "utf-8");

  // Parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error("No frontmatter found in SKILL.md");
  }

  const nameMatch = frontmatterMatch[1].match(/^name:\s*(.+)$/m);
  if (!nameMatch) {
    throw new Error("No 'name' field found in SKILL.md frontmatter");
  }

  return nameMatch[1].trim();
}

/**
 * Copy a standard (non-customizable) skill to output directory
 */
function copyStandardSkill(
  skillDir: string,
  outputDir: string,
  dryRun: boolean = false
): string[] {
  const files: string[] = [];

  // Files/directories to copy
  const toCopy = ["SKILL.md", "scripts", "references", "assets"];

  for (const item of toCopy) {
    const srcPath = join(skillDir, item);

    if (!existsSync(srcPath)) {
      continue;
    }

    const destPath = join(outputDir, item);

    if (dryRun) {
      console.log(`Would copy: ${item}`);
      files.push(item);
    } else {
      mkdirSync(outputDir, { recursive: true });

      const stat = statSync(srcPath);
      if (stat.isDirectory()) {
        cpSync(srcPath, destPath, { recursive: true });
        // List files in directory
        const dirFiles = listFilesRecursive(destPath, outputDir);
        files.push(...dirFiles);
      } else {
        cpSync(srcPath, destPath);
        files.push(item);
      }
    }
  }

  return files;
}

/**
 * List files recursively relative to a base path
 */
function listFilesRecursive(dir: string, basePath: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...listFilesRecursive(fullPath, basePath));
    } else {
      files.push(fullPath.replace(basePath + "/", ""));
    }
  }

  return files;
}
