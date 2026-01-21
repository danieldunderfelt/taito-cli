import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import ejs from "ejs";
import type { VariableValues } from "../types.js";

/**
 * Render all .ejs templates in .skillz/ directory
 * and copy non-templated files from root
 */
export async function renderSkill(
  skillDir: string,
  outputDir: string,
  values: VariableValues,
  dryRun: boolean = false
): Promise<string[]> {
  const skillzDir = join(skillDir, ".skillz");
  const renderedFiles: string[] = [];

  // Collect all template files from .skillz/
  const templateFiles = collectFiles(skillzDir, ".ejs");
  const templateTargets = new Set<string>();

  // Process each template
  for (const templatePath of templateFiles) {
    const relativePath = relative(skillzDir, templatePath);
    // Remove .ejs extension for output path
    const outputPath = join(outputDir, relativePath.replace(/\.ejs$/, ""));
    templateTargets.add(relativePath.replace(/\.ejs$/, ""));

    const rendered = await renderTemplate(templatePath, values);

    if (dryRun) {
      console.log(`Would write: ${outputPath}`);
      console.log("---");
      console.log(rendered.slice(0, 500) + (rendered.length > 500 ? "\n..." : ""));
      console.log("---\n");
    } else {
      // Ensure directory exists
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, rendered);
    }

    renderedFiles.push(relative(outputDir, outputPath));
  }

  // Copy non-templated files from root skill directory
  const rootFiles = collectAllFiles(skillDir);
  for (const filePath of rootFiles) {
    const relativePath = relative(skillDir, filePath);

    // Skip .skillz/ directory
    if (relativePath.startsWith(".skillz")) {
      continue;
    }

    // Skip if there's a template for this file
    if (templateTargets.has(relativePath)) {
      continue;
    }

    // Skip hidden files and common non-skill files
    if (
      relativePath.startsWith(".") ||
      relativePath === "package.json" ||
      relativePath === "package-lock.json" ||
      relativePath === "node_modules"
    ) {
      continue;
    }

    const outputPath = join(outputDir, relativePath);

    if (dryRun) {
      console.log(`Would copy: ${outputPath}`);
    } else {
      mkdirSync(dirname(outputPath), { recursive: true });
      copyFileSync(filePath, outputPath);
    }

    renderedFiles.push(relativePath);
  }

  return renderedFiles;
}

/**
 * Render a single EJS template file
 */
async function renderTemplate(
  templatePath: string,
  values: VariableValues
): Promise<string> {
  const template = readFileSync(templatePath, "utf-8");

  try {
    return ejs.render(template, values, {
      filename: templatePath, // helps with error messages
    });
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to render template ${templatePath}: ${err.message}`);
  }
}

/**
 * Collect all files with a specific extension recursively
 */
function collectFiles(dir: string, extension: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...collectFiles(fullPath, extension));
      } else if (entry.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist, return empty
  }

  return files;
}

/**
 * Collect all files recursively (no extension filter)
 */
function collectAllFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry !== "node_modules" && !entry.startsWith(".")) {
          files.push(...collectAllFiles(fullPath));
        }
      } else {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist, return empty
  }

  return files;
}

/**
 * Render templates with default values (for build command)
 */
export async function renderWithDefaults(
  skillDir: string,
  values: VariableValues
): Promise<string[]> {
  const skillzDir = join(skillDir, ".skillz");
  const renderedFiles: string[] = [];

  // Collect all template files from .skillz/
  const templateFiles = collectFiles(skillzDir, ".ejs");

  // Process each template, writing to parent directory
  for (const templatePath of templateFiles) {
    const relativePath = relative(skillzDir, templatePath);
    // Remove .ejs extension and write to skill root
    const outputPath = join(skillDir, relativePath.replace(/\.ejs$/, ""));

    const rendered = await renderTemplate(templatePath, values);

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, rendered);

    renderedFiles.push(relative(skillDir, outputPath));
  }

  return renderedFiles;
}
