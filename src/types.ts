/**
 * Variable types supported in skill configuration
 */
export type VariableType = 'string' | 'choice' | 'boolean' | 'array'

/**
 * Option for choice-type variables
 */
export interface ChoiceOption {
  value: string
  label: string
}

/**
 * Base variable definition
 */
interface BaseVariable {
  type: VariableType
  prompt: string
  required?: boolean
}

/**
 * String variable
 */
export interface StringVariable extends BaseVariable {
  type: 'string'
  default?: string
  validate?: string // regex pattern
}

/**
 * Choice variable with options
 */
export interface ChoiceVariable extends BaseVariable {
  type: 'choice'
  default?: string
  options: ChoiceOption[]
}

/**
 * Boolean variable
 */
export interface BooleanVariable extends BaseVariable {
  type: 'boolean'
  default?: boolean
}

/**
 * Array variable (comma-separated input)
 */
export interface ArrayVariable extends BaseVariable {
  type: 'array'
  default?: string[]
  itemType?: 'string' // future: could support other types
}

/**
 * Union of all variable types
 */
export type Variable =
  | StringVariable
  | ChoiceVariable
  | BooleanVariable
  | ArrayVariable

/**
 * Skill configuration metadata
 */
export interface SkillMeta {
  name: string
  version?: string
  description?: string
}

/**
 * Full skill configuration from .skillz/skill.config.toml
 */
export interface SkillConfig {
  meta: SkillMeta
  variables: Record<string, Variable>
}

/**
 * User-provided values for variables
 */
export type VariableValues = Record<string, string | boolean | string[]>

/**
 * Options for the add command
 */
export interface AddOptions {
  config?: string // path to preset config TOML
  dryRun?: boolean
  output?: string // custom output directory
  ref?: string // git ref (branch, tag, commit)
  agent?: string // specific agent to install for
  global?: boolean // install globally instead of locally
}

/**
 * Options for the build command
 */
export interface BuildOptions {
  output?: string // custom output directory (default: parent of .skillz/)
}

/**
 * Parsed skill source (GitHub or local path)
 */
export interface SkillSource {
  type: 'github' | 'local'
  owner?: string // GitHub owner
  repo?: string // GitHub repo
  ref?: string // git ref
  path?: string // local path
}

/**
 * Installed skill metadata (stored in .cursor/skills/.skillz-meta.json)
 */
export interface InstalledSkill {
  name: string
  source: string // original source (e.g., "owner/repo" or local path)
  installedAt: string // ISO date
  customized: boolean // whether it was customized on install
  variables?: VariableValues // values used during customization
}

/**
 * Metadata file for tracking installed skills
 */
export interface SkillzMetadata {
  version: string
  skills: InstalledSkill[]
}

/**
 * A discovered skill in a repository
 */
export interface DiscoveredSkill {
  path: string // absolute path to skill directory
  dirName: string // directory name (for display during selection)
  isCustomizable: boolean
}
