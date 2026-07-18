/**
 * Variable types supported in skill/template configuration
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
 * Shared package metadata ([meta] section)
 */
export interface PackageMeta {
  name: string
  version?: string
  description?: string
}

/**
 * Skill configuration metadata
 */
export type SkillMeta = PackageMeta

/**
 * Full skill configuration from .taito/skill.config.toml
 */
export interface SkillConfig {
  meta: SkillMeta
  variables: Record<string, Variable>
}

/**
 * Optional include/exclude unit in a template
 */
export interface TemplateComponent {
  prompt: string
  default?: boolean
  paths?: string[]
  skills?: string[]
}

/**
 * Full template configuration from .taito/template.config.toml
 */
export interface TemplateConfig {
  meta: PackageMeta & { extends?: string }
  variables: Record<string, Variable>
  components: Record<string, TemplateComponent>
}

/**
 * User-provided values for variables
 */
export type VariableValues = Record<string, string | boolean | string[]>

/**
 * Component selection results (name → included)
 */
export type ComponentValues = Record<string, boolean>

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
  /** Register a duplicate of an existing template at the given path */
  duplicate?: string
  /** Register an extension (worktree) of an existing template at the given path */
  extend?: string
  /** Override registered template name */
  name?: string
  force?: boolean
}

/**
 * Options for the build command
 */
export interface BuildOptions {
  output?: string // custom output directory (default: parent of .taito/)
}

/**
 * Options for new project
 */
export interface NewProjectOptions {
  template: string
  config?: string
  force?: boolean
  dryRun?: boolean
  agent?: string
}

/**
 * Options for new skill
 */
export interface NewSkillOptions {
  name?: string
  description?: string
  force?: boolean
}

/**
 * Parsed skill/template source (GitHub or local path)
 */
export interface SkillSource {
  type: 'github' | 'local'
  owner?: string // GitHub owner
  repo?: string // GitHub repo
  ref?: string // git ref
  path?: string // local path
  skillPath?: string // path to specific skill within repo (e.g., "agent-skills/react-localization")
}

/**
 * Installed skill metadata (stored in .cursor/skills/.taito-meta.json)
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
export interface TaitoMetadata {
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

/**
 * Registered template entry in ~/.taito/registry.toml
 */
export interface RegisteredTemplate {
  name: string
  path: string
  source: string // "local" or "github:owner/repo"
  ref?: string
  extends?: string
  branch?: string
  addedAt: string
}

/**
 * Global registry file shape
 */
export interface TaitoRegistry {
  templates: Record<string, RegisteredTemplate>
}

/**
 * Project metadata written to .taito/project.meta.toml
 */
export interface ProjectMeta {
  project: {
    template: string
    templatePath: string
    templateCommit: string
    createdAt: string
  }
  variables: VariableValues
  components: ComponentValues
}

/**
 * Classification of an add source
 */
export type SourceKind = 'template' | 'skill' | 'unknown'

/**
 * Render mode for shared taito tree renderer
 */
export type RenderMode = 'skill' | 'template'
