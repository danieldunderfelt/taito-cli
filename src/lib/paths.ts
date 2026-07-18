import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

import JSON5 from 'json5'

/**
 * Canonical project-local skills directory (skills.sh / Agent Skills convention)
 */
export const CANONICAL_SKILLS_DIR = '.agents/skills'

export type AgentType =
  | 'agents' // Universal / .agents (canonical)
  | 'claudeCode'
  | 'clawdbot'
  | 'codex'
  | 'cursor'
  | 'opencode'
  | 'github'
  | 'vsCode'
  | 'gemini'
  | 'trae'
  | 'windsurf'
  | 'antigravity'

interface AgentConfig {
  /** Display label in the selector */
  name: string
  /** Project-local skills path relative to workspace root */
  localPath: string
  globalPath?: string
  /** Directory marker to detect this agent in a workspace */
  marker?: string
  /**
   * If true, this agent reads skills from the canonical .agents/skills path
   * and does not need a separate symlink target in the selector.
   */
  universal?: boolean
}

/**
 * Configuration for different AI agents and their skill directories.
 * Universal agents share `.agents/skills` (shown as a single ".agents" option).
 * Non-universal agents get a symlink from their path → canonical on install.
 */
export const agentConfigs: Record<AgentType, AgentConfig> = {
  agents: {
    name: '.agents',
    localPath: CANONICAL_SKILLS_DIR,
    globalPath: join(homedir(), '.agents', 'skills'),
    marker: '.agents',
    universal: true,
  },
  claudeCode: {
    name: 'Claude Code',
    localPath: '.claude/skills',
    globalPath: join(homedir(), '.claude', 'skills'),
    marker: '.claude',
  },
  clawdbot: {
    name: 'Clawdbot',
    localPath: 'skills',
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
  gemini: {
    name: 'Gemini CLI',
    localPath: '.gemini/skills',
    globalPath: join(homedir(), '.gemini', 'skills'),
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

/** Aliases accepted by --agent */
const AGENT_ALIASES: Record<string, AgentType> = {
  agents: 'agents',
  '.agents': 'agents',
  universal: 'agents',
  amp: 'agents', // legacy
  goose: 'agents', // shares .agents; not a separate install target
  claudecode: 'claudeCode',
  'claude-code': 'claudeCode',
  claude: 'claudeCode',
  cursor: 'cursor',
  windsurf: 'windsurf',
  codex: 'codex',
  opencode: 'opencode',
  gemini: 'gemini',
  github: 'github',
  vscode: 'vsCode',
  vsCode: 'vsCode',
  clawdbot: 'clawdbot',
  trae: 'trae',
  antigravity: 'antigravity',
}

/**
 * Find the workspace root by looking for common markers
 */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let current = resolve(startDir)
  const root = resolve('/')

  while (current !== root) {
    for (const config of Object.values(agentConfigs)) {
      if (config.marker && existsSync(join(current, config.marker))) {
        return current
      }
    }

    if (existsSync(join(current, '.git'))) {
      return current
    }

    if (existsSync(join(current, 'package.json'))) {
      return current
    }

    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }

  return startDir
}

export function isUniversalAgent(agent: AgentType): boolean {
  return agentConfigs[agent].universal === true
}

/**
 * Resolve --agent string to AgentType (supports aliases like amp → agents)
 */
export function resolveAgentType(input: string): AgentType | undefined {
  const key = input.trim()
  const alias = AGENT_ALIASES[key] ?? AGENT_ALIASES[key.toLowerCase()]
  if (alias) return alias

  const matched = Object.keys(agentConfigs).find(
    (k) => k.toLowerCase() === key.toLowerCase()
  ) as AgentType | undefined
  return matched
}

/**
 * Detect which agent is being used (first match). Prefers .agents when present.
 */
export function detectAgent(workspaceRoot?: string): AgentType | null {
  const detected = getDetectedAgents(workspaceRoot)
  if (detected.length === 0) return 'agents'
  if (detected.includes('agents')) return 'agents'
  return detected[0]
}

/**
 * @deprecated Use getDetectedAgents / getSelectableAgents
 */
export function detectAllAgents(workspaceRoot?: string): AgentType[] {
  return getDetectedAgents(workspaceRoot)
}

/**
 * All agents shown in the install selector (always the full list).
 * Universal-only tools share the `.agents` option.
 */
export function getSelectableAgents(_workspaceRoot?: string): AgentType[] {
  void _workspaceRoot
  const order: AgentType[] = [
    'agents',
    'claudeCode',
    'cursor',
    'codex',
    'windsurf',
    'opencode',
    'gemini',
    'github',
    'vsCode',
    'trae',
    'antigravity',
    'clawdbot',
  ]
  return order.filter((a) => a in agentConfigs)
}

/**
 * Agents with project markers present — used to pre-select in the installer UI.
 * Always includes `.agents` when the folder exists; otherwise still defaults to
 * pre-selecting `.agents` as the canonical target via getDefaultAgentSelection.
 */
export function getDetectedAgents(workspaceRoot?: string): AgentType[] {
  const root = workspaceRoot ?? findWorkspaceRoot()
  const detected: AgentType[] = []

  for (const agentType of getSelectableAgents()) {
    const config = agentConfigs[agentType]

    if (agentType === 'clawdbot') {
      if (isClawdbotAvailable(root)) detected.push('clawdbot')
      continue
    }

    if (config.marker && existsSync(join(root, config.marker))) {
      detected.push(agentType)
    }
  }

  return detected
}

/**
 * Pre-selection for the agent multiselect: detected markers, always including `.agents`.
 */
export function getDefaultAgentSelection(workspaceRoot?: string): AgentType[] {
  const detected = getDetectedAgents(workspaceRoot)
  if (detected.length === 0) return ['agents']
  if (!detected.includes('agents')) return ['agents', ...detected]
  return detected
}

/**
 * Agents that need a symlink when selected (path differs from canonical)
 */
export function getSymlinkAgents(selected: AgentType[]): AgentType[] {
  return selected.filter((a) => !isUniversalAgent(a))
}

function isClawdbotAvailable(workspaceRoot: string): boolean {
  if (process.env.CLAWDHUB_WORKDIR) {
    return true
  }

  if (
    existsSync(join(workspaceRoot, '.clawdhub')) ||
    existsSync(join(workspaceRoot, '.clawdbot'))
  ) {
    return true
  }

  const configPath = getClawdbotConfigPath()
  if (configPath && existsSync(configPath)) {
    return true
  }

  return false
}

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

export function discoverClawdbotWorkspace(): string {
  const cwd = process.cwd()

  const envWorkdir = process.env.CLAWDHUB_WORKDIR
  if (envWorkdir) {
    return resolve(envWorkdir.trim())
  }

  if (
    existsSync(join(cwd, '.clawdhub', 'lock.json')) ||
    existsSync(join(cwd, '.clawdhub')) ||
    existsSync(join(cwd, '.clawdbot'))
  ) {
    return cwd
  }

  const configPath = getClawdbotConfigPath()
  if (configPath && existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, 'utf-8')
      const config: ClawdbotConfig = JSON5.parse(configContent)

      const defaultWorkspace =
        config.agents?.defaults?.workspace ?? config.agent?.workspace

      if (defaultWorkspace) {
        return resolve(defaultWorkspace)
      }

      if (config.agents) {
        for (const [key, agentConfig] of Object.entries(config.agents)) {
          if (key === 'defaults') continue
          const agent = agentConfig as ClawdbotAgentConfig
          if (agent.default === true && agent.workspace) {
            return resolve(agent.workspace)
          }
        }

        for (const [key, agentConfig] of Object.entries(config.agents)) {
          if (key === 'defaults') continue
          const agent = agentConfig as ClawdbotAgentConfig
          if ((agent.id === 'main' || key === 'main') && agent.workspace) {
            return resolve(agent.workspace)
          }
        }
      }
    } catch {
      // continue
    }
  }

  return cwd
}

function getClawdbotConfigPath(): string | null {
  const configEnv = process.env.CLAWDBOT_CONFIG_PATH
  if (configEnv) {
    return configEnv
  }

  const stateDir = process.env.CLAWDBOT_STATE_DIR
  if (stateDir) {
    return join(stateDir, 'clawdbot.json')
  }

  return join(homedir(), '.clawdbot', 'clawdbot.json')
}

/**
 * Canonical skills directory (.agents/skills or ~/.agents/skills)
 */
export function getCanonicalSkillsDir(
  global: boolean = false,
  workspaceRoot?: string
): string {
  if (global) {
    return agentConfigs.agents.globalPath!
  }
  const root = workspaceRoot ?? findWorkspaceRoot()
  return join(root, CANONICAL_SKILLS_DIR)
}

/**
 * Get the skills directory for a specific agent
 */
export function getSkillsDir(
  agent?: AgentType,
  global: boolean = false,
  workspaceRoot?: string
): string {
  const agentType = agent ?? detectAgent(workspaceRoot) ?? 'agents'
  const config = agentConfigs[agentType]

  if (global) {
    if (!config.globalPath) {
      throw new Error(
        `Agent '${config.name}' does not support global installation`
      )
    }
    return config.globalPath
  }

  if (agentType === 'clawdbot') {
    const clawdbotWorkspace = discoverClawdbotWorkspace()
    return join(clawdbotWorkspace, config.localPath)
  }

  const root = workspaceRoot ?? findWorkspaceRoot()
  return join(root, config.localPath)
}

/**
 * Canonical skill output directory
 */
export function getCanonicalSkillOutputDir(
  skillName: string,
  global?: boolean,
  workspaceRoot?: string
): string {
  return join(getCanonicalSkillsDir(global, workspaceRoot), skillName)
}

/**
 * Get the output path for a specific skill under an agent
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
 * Metadata lives next to the canonical install
 */
export function getMetadataPath(
  agent?: AgentType,
  global?: boolean,
  workspaceRoot?: string
): string {
  // Always use canonical for metadata so there's one registry
  void agent
  return join(getCanonicalSkillsDir(global, workspaceRoot), '.taito-meta.json')
}

/**
 * Create or replace a symlink from linkPath → targetDir (relative when possible)
 */
export function ensureSkillSymlink(
  canonicalSkillDir: string,
  linkPath: string
): void {
  mkdirSync(dirname(linkPath), { recursive: true })

  if (existsSync(linkPath) || isSymlink(linkPath)) {
    try {
      const stat = lstatSync(linkPath)
      if (stat.isSymbolicLink()) {
        unlinkSync(linkPath)
      } else {
        rmSync(linkPath, { recursive: true, force: true })
      }
    } catch {
      rmSync(linkPath, { recursive: true, force: true })
    }
  }

  const rel = relative(dirname(linkPath), canonicalSkillDir)
  symlinkSync(rel || '.', linkPath)
}

/**
 * Remove a skill symlink or directory at linkPath
 */
export function removeSkillLink(linkPath: string): void {
  if (!existsSync(linkPath) && !isSymlink(linkPath)) return
  try {
    const stat = lstatSync(linkPath)
    if (stat.isSymbolicLink()) {
      unlinkSync(linkPath)
    } else {
      rmSync(linkPath, { recursive: true, force: true })
    }
  } catch {
    rmSync(linkPath, { recursive: true, force: true })
  }
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * List which selectable agents currently have a link/copy of a skill
 */
export function findSkillLinks(
  skillName: string,
  workspaceRoot?: string,
  global: boolean = false
): AgentType[] {
  const linked: AgentType[] = []
  const root = workspaceRoot ?? findWorkspaceRoot()

  for (const agent of Object.keys(agentConfigs) as AgentType[]) {
    if (isUniversalAgent(agent)) continue
    try {
      const dir = getSkillOutputDir(skillName, agent, global, root)
      if (existsSync(dir) || isSymlink(dir)) {
        linked.push(agent)
      }
    } catch {
      // skip agents without global path when global=true
    }
  }

  return linked
}

/**
 * Recreate symlinks from agent skill dirs → `.agents/skills/<name>` for every
 * canonical skill that already has a presence (dir or link) under an agent path.
 * Fixes duplicate/extend copies that dereferenced symlinks into real folders.
 */
export function restoreSkillSymlinks(workspaceRoot: string): string[] {
  const canonicalRoot = join(workspaceRoot, CANONICAL_SKILLS_DIR)
  if (!existsSync(canonicalRoot)) return []

  const skillNames = readdirSync(canonicalRoot).filter((name) => {
    if (name.startsWith('.')) return false
    try {
      return statSync(join(canonicalRoot, name)).isDirectory()
    } catch {
      return false
    }
  })

  const restored: string[] = []

  for (const agent of getSelectableAgents()) {
    if (isUniversalAgent(agent)) continue
    const agentSkillsDir = join(
      workspaceRoot,
      agentConfigs[agent].localPath
    )

    // Whole-dir symlink (.claude/skills → ../.agents/skills) — leave intact
    if (isSymlink(agentSkillsDir)) {
      restored.push(agentConfigs[agent].localPath)
      continue
    }

    if (!existsSync(agentSkillsDir)) continue

    for (const skillName of skillNames) {
      const linkPath = join(agentSkillsDir, skillName)
      const canonicalSkill = join(canonicalRoot, skillName)

      // Only touch paths that already exist (as symlink or dereferenced copy)
      if (!existsSync(linkPath) && !isSymlink(linkPath)) continue

      ensureSkillSymlink(canonicalSkill, linkPath)
      restored.push(`${agentConfigs[agent].localPath}/${skillName}`)
    }
  }

  return restored
}

/**
 * Copy a directory tree while preserving symlinks (does not follow them).
 * Skips `.git` by default.
 */
export function copyTreePreservingSymlinks(
  srcRoot: string,
  destRoot: string,
  options: { skipGit?: boolean } = {}
): void {
  const skipGit = options.skipGit ?? true
  mkdirSync(destRoot, { recursive: true })

  function walk(srcDir: string, destDir: string): void {
    mkdirSync(destDir, { recursive: true })
    for (const entry of readdirSync(srcDir)) {
      if (skipGit && entry === '.git') continue

      const srcPath = join(srcDir, entry)
      const destPath = join(destDir, entry)
      const stat = lstatSync(srcPath)

      if (stat.isSymbolicLink()) {
        const target = readlinkSync(srcPath)
        mkdirSync(dirname(destPath), { recursive: true })
        if (existsSync(destPath) || isSymlink(destPath)) {
          try {
            const existing = lstatSync(destPath)
            if (existing.isSymbolicLink()) unlinkSync(destPath)
            else rmSync(destPath, { recursive: true, force: true })
          } catch {
            rmSync(destPath, { recursive: true, force: true })
          }
        }
        symlinkSync(target, destPath)
      } else if (stat.isDirectory()) {
        walk(srcPath, destPath)
      } else if (stat.isFile()) {
        copyFileSync(srcPath, destPath)
      }
    }
  }

  walk(srcRoot, destRoot)
}

export function isCustomizableSkill(skillDir: string): boolean {
  return existsSync(join(skillDir, '.taito', 'skill.config.toml'))
}

export function isCustomizableTemplate(dir: string): boolean {
  return existsSync(join(dir, '.taito', 'template.config.toml'))
}

export function getTaitoConfigDir(skillDir: string): string {
  return join(skillDir, '.taito')
}

export function getSkillConfigPath(skillDir: string): string {
  return join(skillDir, '.taito', 'skill.config.toml')
}
