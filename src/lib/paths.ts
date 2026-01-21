import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export type AgentType =
  | "claudeCode"
  | "codex"
  | "cursor"
  | "opencode"
  | "github"
  | "vsCode"
  | "amp"
  | "goose"
  | "gemini"
  | "trae"
  | "windsurf"
  | "antigravity";

interface AgentConfig {
  name: string;
  localPath: string;
  globalPath?: string;
  marker?: string; // directory marker to detect this agent
}

/**
 * Configuration for different AI agents and their skill directories
 */
export const agentConfigs: Record<AgentType, AgentConfig> = {
  claudeCode: {
    name: "Claude Code",
    localPath: ".claude/skills",
    globalPath: join(homedir(), ".claude", "skills"),
    marker: ".claude",
  },
  codex: {
    name: "Codex",
    localPath: ".codex/skills",
    globalPath: join(homedir(), ".codex", "skills"),
    marker: ".codex",
  },
  cursor: {
    name: "Cursor",
    localPath: ".cursor/skills",
    marker: ".cursor",
  },
  opencode: {
    name: "OpenCode",
    localPath: ".opencode/skill",
    globalPath: join(homedir(), ".config/opencode/skill"),
    marker: ".opencode",
  },
  github: {
    name: "GitHub",
    localPath: ".github/skills",
    marker: ".github",
  },
  vsCode: {
    name: "VS Code",
    localPath: ".github/skills",
    marker: ".vscode",
  },
  amp: {
    name: "AMP",
    localPath: ".agents/skills",
    globalPath: join(homedir(), ".config/agents/skills"),
    marker: ".agents",
  },
  goose: {
    name: "Goose",
    localPath: ".agents/skills",
    globalPath: join(homedir(), ".config/goose/skills"),
  },
  gemini: {
    name: "Gemini CLI",
    localPath: ".gemini/skills",
    globalPath: join(homedir(), ".gemini/skills"),
    marker: ".gemini",
  },
  trae: {
    name: "Trae",
    localPath: ".trae/skills",
    marker: ".trae",
  },
  windsurf: {
    name: "Windsurf",
    localPath: ".windsurf/skills",
    globalPath: join(homedir(), ".codeium/windsurf/skills"),
    marker: ".windsurf",
  },
  antigravity: {
    name: "Antigravity",
    localPath: ".agent/skills",
    globalPath: join(homedir(), ".gemini/antigravity/skills"),
    marker: ".agent",
  },
};

/**
 * Find the workspace root by looking for common markers
 */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let current = resolve(startDir);
  const root = resolve("/");

  while (current !== root) {
    // Check for workspace markers in order of preference
    // First check for agent-specific directories
    for (const config of Object.values(agentConfigs)) {
      if (config.marker && existsSync(join(current, config.marker))) {
        return current;
      }
    }

    // Then check for version control
    if (existsSync(join(current, ".git"))) {
      return current;
    }

    // Finally check for package.json
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
 * Detect which agent is being used in the workspace
 * Returns the first agent found, or null if none detected
 */
export function detectAgent(workspaceRoot?: string): AgentType | null {
  const root = workspaceRoot ?? findWorkspaceRoot();

  // Check for agent markers in order of preference
  const checkOrder: AgentType[] = [
    "cursor",
    "claudeCode",
    "windsurf",
    "opencode",
    "codex",
    "gemini",
    "trae",
    "antigravity",
    "amp",
    "goose",
    "github",
    "vsCode",
  ];

  for (const agentType of checkOrder) {
    const config = agentConfigs[agentType];
    if (config.marker && existsSync(join(root, config.marker))) {
      return agentType;
    }
  }

  return null;
}

/**
 * Get all agents detected in the workspace
 */
export function detectAllAgents(workspaceRoot?: string): AgentType[] {
  const root = workspaceRoot ?? findWorkspaceRoot();
  const detected: AgentType[] = [];

  for (const [agentType, config] of Object.entries(agentConfigs)) {
    if (config.marker && existsSync(join(root, config.marker))) {
      detected.push(agentType as AgentType);
    }
  }

  return detected;
}

/**
 * Get the skills directory for a specific agent
 */
export function getSkillsDir(
  agent?: AgentType,
  global: boolean = false,
  workspaceRoot?: string
): string {
  // If no agent specified, try to detect or default to cursor
  const agentType = agent ?? detectAgent(workspaceRoot) ?? "cursor";
  const config = agentConfigs[agentType];

  if (global) {
    if (!config.globalPath) {
      throw new Error(`Agent '${config.name}' does not support global installation`);
    }
    return config.globalPath;
  }

  const root = workspaceRoot ?? findWorkspaceRoot();
  return join(root, config.localPath);
}

/**
 * Get the output path for a specific skill
 */
export function getSkillOutputDir(
  skillName: string,
  agent?: AgentType,
  global?: boolean,
  workspaceRoot?: string
): string {
  return join(getSkillsDir(agent, global, workspaceRoot), skillName);
}

/**
 * Get the metadata file path for tracking installed skills
 */
export function getMetadataPath(
  agent?: AgentType,
  global?: boolean,
  workspaceRoot?: string
): string {
  return join(getSkillsDir(agent, global, workspaceRoot), ".skillz-meta.json");
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
