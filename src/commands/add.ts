import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
import * as p from '@clack/prompts'
import {
  getDefaultValues,
  parsePresetConfig,
  parseSkillConfig,
} from '../lib/config.js'
import { discoverSkills } from '../lib/discovery.js'
import {
  cleanupTempDir,
  fetchFromGitHub,
  parseSkillSource,
} from '../lib/github.js'
import { recordInstalledSkill } from '../lib/metadata.js'
import {
  agentConfigs,
  detectAllAgents,
  findWorkspaceRoot,
  getSkillConfigPath,
  getSkillOutputDir,
  isCustomizableSkill,
  type AgentType,
} from '../lib/paths.js'
import { clearVariableCache, promptForVariables } from '../lib/prompts.js'
import { renderSkill } from '../lib/render.js'
import type { AddOptions, DiscoveredSkill } from '../types.js'

/**
 * Add/install a skill from GitHub or local path
 */
export async function addCommand(
  source: string,
  options: AddOptions
): Promise<void> {
  const spinner = p.spinner()

  // Clear variable cache at start of command
  clearVariableCache()

  try {
    // Parse source
    const skillSource = parseSkillSource(source, options.ref)

    let repoDir: string
    let shouldCleanup = false

    if (skillSource.type === 'github') {
      spinner.start(`Fetching ${source}...`)
      repoDir = await fetchFromGitHub(skillSource)
      shouldCleanup = true
      spinner.stop(`Fetched ${source}`)
    } else {
      repoDir = resolve(skillSource.path!)
      if (!existsSync(repoDir)) {
        p.log.error(`Local path not found: ${repoDir}`)
        process.exit(1)
      }
    }

    try {
      // Discover all skills in the repository
      let discoveredSkills = discoverSkills(repoDir)

      if (discoveredSkills.length === 0) {
        p.log.error('No skills found in repository')
        p.log.message('A skill is a directory containing a SKILL.md file.')
        process.exit(1)
      }

      // If a specific skill path was requested, filter to that skill
      if (skillSource.skillPath) {
        const requestedPath = skillSource.skillPath
        const matchedSkill = discoveredSkills.find((skill) => {
          // Get the relative path from repo root
          const relativePath = skill.path.replace(repoDir + '/', '')
          return (
            relativePath === requestedPath ||
            relativePath.endsWith('/' + requestedPath) ||
            skill.dirName === requestedPath.split('/').pop()
          )
        })

        if (!matchedSkill) {
          p.log.error(`Skill not found at path: ${requestedPath}`)
          p.log.message('Available skills in this repository:')
          for (const skill of discoveredSkills) {
            const relativePath = skill.path.replace(repoDir + '/', '')
            p.log.message(`  - ${relativePath}`)
          }
          process.exit(1)
        }

        discoveredSkills = [matchedSkill]
      }

      // Detect or select agent
      const workspaceRoot = findWorkspaceRoot()
      let agent: AgentType | undefined

      if (options.agent) {
        // Find agent case-insensitively
        const normalizedInput = options.agent.toLowerCase()

        const matchedAgent = Object.keys(agentConfigs).find(
          (key) => key.toLowerCase() === normalizedInput
        ) as AgentType | undefined

        if (!matchedAgent) {
          p.log.error(`Unknown agent: ${options.agent}`)
          p.log.message(
            `Available agents: ${Object.keys(agentConfigs).join(', ')}`
          )
          process.exit(1)
        }
        agent = matchedAgent
      } else if (!options.output) {
        // Auto-detect agent if no custom output specified
        const detectedAgents = detectAllAgents(workspaceRoot)

        if (detectedAgents.length === 0) {
          p.log.warn('No agent detected in workspace. Defaulting to Cursor.')
          agent = 'cursor'
        } else if (detectedAgents.length === 1) {
          agent = detectedAgents[0]
          p.log.info(`Detected agent: ${agentConfigs[agent].name}`)
        } else {
          // Multiple agents detected - ask user
          p.log.info(
            `Multiple agents detected: ${detectedAgents
              .map((a) => agentConfigs[a].name)
              .join(', ')}`
          )

          const selected = await p.select({
            message: 'Which agent do you want to install the skill for?',
            options: detectedAgents.map((a) => ({
              value: a,
              label: agentConfigs[a].name,
            })),
          })

          if (p.isCancel(selected)) {
            p.cancel('Installation cancelled.')
            process.exit(0)
          }

          agent = selected as AgentType
        }
      }

      // Select which skills to install
      let skillsToInstall: DiscoveredSkill[]

      if (discoveredSkills.length === 1) {
        // Single skill - install directly
        skillsToInstall = discoveredSkills
      } else {
        // Multiple skills - prompt user to select
        const selected = await p.multiselect({
          message: 'Select skills to install:',
          options: discoveredSkills.map((s) => ({
            value: s,
            label: s.dirName,
            hint: s.isCustomizable ? 'customizable' : undefined,
          })),
          required: true,
        })

        if (p.isCancel(selected)) {
          p.cancel('Installation cancelled.')
          process.exit(0)
        }

        skillsToInstall = selected as DiscoveredSkill[]
      }

      // Install each selected skill
      for (const discoveredSkill of skillsToInstall) {
        await installSingleSkill(
          discoveredSkill.path,
          source,
          options,
          agent,
          workspaceRoot,
          spinner
        )
      }
    } finally {
      // Clean up temp directory if we fetched from GitHub
      if (shouldCleanup) {
        cleanupTempDir(repoDir)
      }
    }
  } catch (error) {
    spinner.stop('Failed')
    const err = error as Error
    p.log.error(err.message)
    process.exit(1)
  }
}

/**
 * Install a single skill
 */
async function installSingleSkill(
  skillDir: string,
  source: string,
  options: AddOptions,
  agent: AgentType | undefined,
  workspaceRoot: string,
  spinner: ReturnType<typeof p.spinner>
): Promise<void> {
  // Check if customizable
  const customizable = isCustomizableSkill(skillDir)
  let skillName: string
  let customized = false
  let values = {}

  if (customizable) {
    p.log.info('Customizable skill detected.')

    // Parse config
    const configPath = getSkillConfigPath(skillDir)
    const config = parseSkillConfig(configPath)
    // Use config.meta.name, fallback to directory name
    skillName = config.meta.name?.trim() || basename(skillDir)

    // Get values from preset config or prompt user
    if (options.config) {
      const presetValues = parsePresetConfig(options.config)
      // Get defaults with interpolation, using preset values for reference
      values = getDefaultValues(config, presetValues)
    } else {
      values = await promptForVariables(config)
    }

    customized = true
  } else {
    // Non-customizable skill - get name from SKILL.md frontmatter with fallback
    skillName = extractSkillName(skillDir)
    p.log.info(`Installing standard skill: ${skillName}`)
  }

  // Determine output directory
  const outputDir = options.output
    ? resolve(options.output)
    : getSkillOutputDir(skillName, agent, options.global, workspaceRoot)

  // Check if already installed
  if (existsSync(outputDir) && !options.dryRun) {
    const overwrite = await p.confirm({
      message: `Skill '${skillName}' already exists. Overwrite?`,
      initialValue: false,
    })

    if (p.isCancel(overwrite) || !overwrite) {
      p.log.info(`Skipping installation of '${skillName}'.`)
      return
    }
  }

  // Render or copy skill
  spinner.start(`Installing ${skillName}...`)

  let files: string[]
  if (customizable) {
    files = await renderSkill(skillDir, outputDir, values, options.dryRun)
  } else {
    files = copyStandardSkill(skillDir, outputDir, options.dryRun)
  }

  spinner.stop(`${skillName} installed!`)

  // Record in metadata
  if (!options.dryRun) {
    recordInstalledSkill(
      skillName,
      source,
      customized,
      customized ? values : undefined,
      agent,
      options.global,
      workspaceRoot
    )
  }

  // Show results
  const agentName = agent ? agentConfigs[agent].name : 'default location'
  const globalLabel = options.global ? ' (global)' : ''
  p.log.success(`Installed ${skillName} to ${outputDir}`)
  p.log.message(`Agent: ${agentName}${globalLabel}`)
  for (const file of files.slice(0, 10)) {
    p.log.message(`  ${file}`)
  }
  if (files.length > 10) {
    p.log.message(`  ... and ${files.length - 10} more files`)
  }
}

/**
 * Extract skill name from SKILL.md frontmatter with directory name fallback
 * Priority: frontmatter name → directory name
 */
function extractSkillName(skillDir: string): string {
  const skillMdPath = join(skillDir, 'SKILL.md')

  if (!existsSync(skillMdPath)) {
    // Fallback to directory name if no SKILL.md
    return basename(skillDir)
  }

  const content = readFileSync(skillMdPath, 'utf-8')

  // Parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) {
    return basename(skillDir) // Fallback
  }

  const nameMatch = frontmatterMatch[1].match(/^name:\s*(.+)$/m)
  if (!nameMatch) {
    return basename(skillDir) // Fallback
  }

  return nameMatch[1].trim()
}

/**
 * Copy a standard (non-customizable) skill to output directory
 */
function copyStandardSkill(
  skillDir: string,
  outputDir: string,
  dryRun: boolean = false
): string[] {
  const files: string[] = []

  // Files/directories to copy
  const toCopy = ['SKILL.md', 'scripts', 'references', 'assets', 'rules']

  for (const item of toCopy) {
    const srcPath = join(skillDir, item)

    if (!existsSync(srcPath)) {
      continue
    }

    const destPath = join(outputDir, item)

    if (dryRun) {
      console.log(`Would copy: ${item}`)
      files.push(item)
    } else {
      mkdirSync(outputDir, { recursive: true })

      const stat = statSync(srcPath)
      if (stat.isDirectory()) {
        cpSync(srcPath, destPath, { recursive: true })
        // List files in directory
        const dirFiles = listFilesRecursive(destPath, outputDir)
        files.push(...dirFiles)
      } else {
        cpSync(srcPath, destPath)
        files.push(item)
      }
    }
  }

  return files
}

/**
 * List files recursively relative to a base path
 */
function listFilesRecursive(dir: string, basePath: string): string[] {
  const files: string[] = []
  const entries = readdirSync(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      files.push(...listFilesRecursive(fullPath, basePath))
    } else {
      files.push(fullPath.replace(basePath + '/', ''))
    }
  }

  return files
}
