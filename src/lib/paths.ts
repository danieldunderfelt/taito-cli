import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import JSON5 from 'json5'

export type AgentType =
  | 'claudeCode'
  | 'clawdbot'
  | 'codex'
  | 'cursor'
  | 'opencode'
  | 'github'
  | 'vsCode'
  | 'amp'
  | 'goose'
  | 'gemini'
  | 'trae'
  | 'windsurf'
  | 'antigravity'

interface AgentConfig {
  name: string
  localPath: string
  globalPath?: string
  marker?: string // directory marker to detect this agent
}

/**
 * Configuration for different AI agents and their skill directories
 */
export const agentConfigs: Record<AgentType, AgentConfig> = {
  claudeCode: {
    name: 'Claude Code',
    localPath: '.claude/skills',
    globalPath: join(homedir(), '.claude', 'skills'),
    marker: '.claude',
  },
  clawdbot: {
    name: 'Clawdbot',
    localPath: 'skills', // Clawdbot uses <workspace>/skills, not a hidden directory
    marker: '.clawdhub',
  },
  codex: {
    name: 'Codex',
    localPath: '.codex/skills',
    globalPath: join(homedir(), '.codex', 'skills'),
    marker: '.codex',
  },
  cursor: {
    name: 'Cursor',
    localPath: '.cursor/skills',
    marker: '.cursor',
  },
  opencode: {
    name: 'OpenCode',
    localPath: '.opencode/skill',
    globalPath: join(homedir(), '.config/opencode/skill'),
    marker: '.opencode',
  },
  github: {
    name: 'GitHub',
    localPath: '.github/skills',
    marker: '.github',
  },
  vsCode: {
    name: 'VS Code',
    localPath: '.github/skills',
    marker: '.vscode',
  },
  amp: {
    name: 'AMP',
    localPath: '.agents/skills',
    globalPath: join(homedir(), '.config/agents/skills'),
    marker: '.agents',
  },
  goose: {
    name: 'Goose',
    localPath: '.agents/skills',
    globalPath: join(homedir(), '.config/goose/skills'),
  },
  gemini: {
    name: 'Gemini CLI',
    localPath: '.gemini/skills',
    globalPath: join(homedir(), '.gemini/skills'),
    marker: '.gemini',
  },
  trae: {
    name: 'Trae',
    localPath: '.trae/skills',
    marker: '.trae',
  },
  windsurf: {
    name: 'Windsurf',
    localPath: '.windsurf/skills',
    globalPath: join(homedir(), '.codeium/windsurf/skills'),
    marker: '.windsurf',
  },
  antigravity: {
    name: 'Antigravity',
    localPath: '.agent/skills',
    globalPath: join(homedir(), '.gemini/antigravity/skills'),
    marker: '.agent',
  },
}

/**
 * Find the workspace root by looking for common markers
 */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let current = resolve(startDir)
  const root = resolve('/')

  while (current !== root) {
    // Check for workspace markers in order of preference
    // First check for agent-specific directories
    for (const config of Object.values(agentConfigs)) {
      if (config.marker && existsSync(join(current, config.marker))) {
        return current
      }
    }

    // Then check for version control
    if (existsSync(join(current, '.git'))) {
      return current
    }

    // Finally check for package.json
    if (existsSync(join(current, 'package.json'))) {
      return current
    }

    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }

  // Fallback to start directory
  return startDir
}

/**
 * Detect which agent is being used in the workspace
 * Returns the first agent found, or null if none detected
 */
export function detectAgent(workspaceRoot?: string): AgentType | null {
  const root = workspaceRoot ?? findWorkspaceRoot()

  // Check for agent markers in order of preference
  const checkOrder: AgentType[] = [
    'cursor',
    'claudeCode',
    'clawdbot',
    'windsurf',
    'opencode',
    'codex',
    'gemini',
    'trae',
    'antigravity',
    'amp',
    'goose',
    'github',
    'vsCode',
  ]

  for (const agentType of checkOrder) {
    // Special handling for Clawdbot
    if (agentType === 'clawdbot') {
      if (isClawdbotAvailable(root)) {
        return 'clawdbot'
      }
      continue
    }

    const config = agentConfigs[agentType]
    if (config.marker && existsSync(join(root, config.marker))) {
      return agentType
    }
  }

  return null
}

/**
 * Get all agents detected in the workspace
 */
export function detectAllAgents(workspaceRoot?: string): AgentType[] {
  const root = workspaceRoot ?? findWorkspaceRoot()
  const detected: AgentType[] = []

  for (const [agentType, config] of Object.entries(agentConfigs)) {
    // Special handling for Clawdbot - check multiple indicators
    if (agentType === 'clawdbot') {
      if (isClawdbotAvailable(root)) {
        detected.push('clawdbot')
      }
      continue
    }

    if (config.marker && existsSync(join(root, config.marker))) {
      detected.push(agentType as AgentType)
    }
  }

  return detected
}

/**
 * Check if Clawdbot is available/installed
 * Clawdbot is considered available if:
 * 1. CLAWDHUB_WORKDIR environment variable is set
 * 2. Current directory has .clawdhub or .clawdbot marker
 * 3. Clawdbot config file exists (~/.clawdbot/clawdbot.json)
 */
function isClawdbotAvailable(workspaceRoot: string): boolean {
  // 1. CLAWDHUB_WORKDIR is set
  if (process.env.CLAWDHUB_WORKDIR) {
    return true
  }

  // 2. Check for markers in current workspace
  // .clawdhub is the ClawdHub workspace marker
  // .clawdbot is the Clawdbot agent config directory
  if (
    existsSync(join(workspaceRoot, '.clawdhub')) ||
    existsSync(join(workspaceRoot, '.clawdbot'))
  ) {
    return true
  }

  // 3. Clawdbot config file exists (user has Clawdbot installed)
  const configPath = getClawdbotConfigPath()
  if (configPath && existsSync(configPath)) {
    return true
  }

  return false
}

/**
 * Clawdbot agent configuration interface
 */
interface ClawdbotAgentConfig {
  id?: string
  workspace?: string
  default?: boolean
}

interface ClawdbotConfig {
  agent?: {
    workspace?: string
  }
  agents?: {
    defaults?: {
      workspace?: string
    }
    [key: string]: ClawdbotAgentConfig | { workspace?: string } | undefined
  }
}

/**
 * Discover Clawdbot workspace using the official fallback chain:
 * 1. CLAWDHUB_WORKDIR environment variable
 * 2. Current directory if it has .clawdhub marker
 * 3. Clawdbot config file default workspace
 * 4. Fallback to current directory
 */
export function discoverClawdbotWorkspace(): string {
  const cwd = process.cwd()

  // 1. Environment override
  const envWorkdir = process.env.CLAWDHUB_WORKDIR
  if (envWorkdir) {
    return resolve(envWorkdir.trim())
  }

  // 2. Current directory if it has .clawdhub or .clawdbot marker
  if (
    existsSync(join(cwd, '.clawdhub', 'lock.json')) ||
    existsSync(join(cwd, '.clawdhub')) ||
    existsSync(join(cwd, '.clawdbot'))
  ) {
    return cwd
  }

  // 3. Try to read Clawdbot config for default workspace
  const configPath = getClawdbotConfigPath()
  if (configPath && existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, 'utf-8')
      const config = JSON5.parse(configContent) as ClawdbotConfig

      // Check agents.defaults.workspace (or legacy agent.workspace)
      const defaultWorkspace =
        config.agents?.defaults?.workspace ?? config.agent?.workspace

      if (defaultWorkspace) {
        return resolve(defaultWorkspace)
      }

      // Check for agent marked default: true
      if (config.agents) {
        for (const [key, agentConfig] of Object.entries(config.agents)) {
          if (key === 'defaults') continue
          const agent = agentConfig as ClawdbotAgentConfig
          if (agent.default === true && agent.workspace) {
            return resolve(agent.workspace)
          }
        }

        // Check for agent with id === "main"
        for (const [key, agentConfig] of Object.entries(config.agents)) {
          if (key === 'defaults') continue
          const agent = agentConfig as ClawdbotAgentConfig
          if ((agent.id === 'main' || key === 'main') && agent.workspace) {
            return resolve(agent.workspace)
          }
        }
      }
    } catch {
      // Config parsing failed, continue to fallback
    }
  }

  // 4. Last fallback: current directory
  return cwd
}

/**
 * Get the path to Clawdbot's config file
 */
function getClawdbotConfigPath(): string | null {
  // $CLAWDBOT_CONFIG_PATH if set
  const configEnv = process.env.CLAWDBOT_CONFIG_PATH
  if (configEnv) {
    return configEnv
  }

  // $CLAWDBOT_STATE_DIR/clawdbot.json if state dir override is set
  const stateDir = process.env.CLAWDBOT_STATE_DIR
  if (stateDir) {
    return join(stateDir, 'clawdbot.json')
  }

  // Default: ~/.clawdbot/clawdbot.json
  return join(homedir(), '.clawdbot', 'clawdbot.json')
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
  const agentType = agent ?? detectAgent(workspaceRoot) ?? 'cursor'
  const config = agentConfigs[agentType]

  if (global) {
    if (!config.globalPath) {
      throw new Error(
        `Agent '${config.name}' does not support global installation`
      )
    }
    return config.globalPath
  }

  // Special handling for Clawdbot - use workspace discovery
  if (agentType === 'clawdbot') {
    const clawdbotWorkspace = discoverClawdbotWorkspace()
    return join(clawdbotWorkspace, config.localPath)
  }

  const root = workspaceRoot ?? findWorkspaceRoot()
  return join(root, config.localPath)
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
  return join(getSkillsDir(agent, global, workspaceRoot), skillName)
}

/**
 * Get the metadata file path for tracking installed skills
 */
export function getMetadataPath(
  agent?: AgentType,
  global?: boolean,
  workspaceRoot?: string
): string {
  return join(getSkillsDir(agent, global, workspaceRoot), '.taito-meta.json')
}

/**
 * Check if a directory contains a customizable skill
 */
export function isCustomizableSkill(skillDir: string): boolean {
  return existsSync(join(skillDir, '.taito', 'skill.config.toml'))
}

/**
 * Get the .taito config directory path
 */
export function getTaitoConfigDir(skillDir: string): string {
  return join(skillDir, '.taito')
}

/**
 * Get the skill config file path
 */
export function getSkillConfigPath(skillDir: string): string {
  return join(skillDir, '.taito', 'skill.config.toml')
}
