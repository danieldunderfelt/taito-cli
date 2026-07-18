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
  addGithubTemplate,
  duplicateTemplate,
  extendTemplate,
  registerLocalTemplate,
} from './add-template.js'
import {
  getDefaultValues,
  parsePresetConfig,
  parseSkillConfig,
} from '../lib/config.js'
import { classifySource } from '../lib/classify.js'
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
 * Add a template (register) or install a skill from GitHub / local path
 */
export async function addCommand(
  source: string,
  options: AddOptions
): Promise<void> {
  clearVariableCache()

  try {
    // Template lifecycle: duplicate / extend take a destination path
    if (options.duplicate && options.extend) {
      p.log.error('Use only one of --duplicate or --extend')
      process.exit(1)
    }

    if (options.duplicate) {
      const entry = await duplicateTemplate(source, options.duplicate, options)
      p.log.success(`Registered template '${entry.name}' at ${entry.path}`)
      return
    }

    if (options.extend) {
      const entry = await extendTemplate(source, options.extend, options)
      p.log.success(
        `Registered child template '${entry.name}' at ${entry.path} (extends ${entry.extends})`
      )
      return
    }

    const skillSource = parseSkillSource(source, options.ref)

    // Resolve directory for classification
    if (skillSource.type === 'local') {
      const repoDir = resolve(skillSource.path!)
      if (!existsSync(repoDir)) {
        p.log.error(`Local path not found: ${repoDir}`)
        process.exit(1)
      }

      const kind = classifySource(repoDir)

      if (kind === 'template') {
        const entry = await registerLocalTemplate(repoDir, {
          name: options.name,
          source: 'local',
          ref: options.ref,
          force: options.force,
        })
        p.log.success(`Registered template '${entry.name}' at ${entry.path}`)
        p.log.message(`Create a project with: taito new project -t ${entry.name}`)
        return
      }

      if (kind === 'skill') {
        if (options.name) {
          p.log.error('--name is only valid when adding templates')
          process.exit(1)
        }
        await installSkillsFromDir(repoDir, source, skillSource, options)
        return
      }

      p.log.error('Neither a taito template nor skills found.')
      p.log.message(
        'Templates need .taito/template.config.toml; skills need SKILL.md.'
      )
      process.exit(1)
    }

    // GitHub: peek via tarball to classify; templates get a persistent git clone
    const spinner = p.spinner()
    spinner.start(`Fetching ${source}...`)
    let repoDir: string
    try {
      repoDir = await fetchFromGitHub(skillSource)
      spinner.stop(`Fetched ${source}`)
    } catch (error) {
      spinner.stop('Fetch failed')
      throw error
    }

    const kind = classifySource(repoDir)

    if (kind === 'template') {
      cleanupTempDir(repoDir)
      const entry = await addGithubTemplate(skillSource, options)
      p.log.success(`Registered template '${entry.name}' at ${entry.path}`)
      p.log.message(`Create a project with: taito new project -t ${entry.name}`)
      return
    }

    if (kind === 'skill') {
      if (options.name) {
        cleanupTempDir(repoDir)
        p.log.error('--name is only valid when adding templates')
        process.exit(1)
      }
      // installSkillsFromDir cleans up the temp dir for github sources
      await installSkillsFromDir(repoDir, source, skillSource, options)
      return
    }

    cleanupTempDir(repoDir)
    p.log.error('Neither a taito template nor skills found in repository.')
    p.log.message(
      'Templates need .taito/template.config.toml; skills need SKILL.md.'
    )
    process.exit(1)
  } catch (error) {
    const err = error as Error
    if (err.message === 'Registration cancelled.' || err.message === 'Duplicate cancelled.') {
      p.log.info(err.message)
      process.exit(0)
    }
    p.log.error(err.message)
    process.exit(1)
  }
}

async function installSkillsFromDir(
  repoDir: string,
  source: string,
  skillSource: ReturnType<typeof parseSkillSource>,
  options: AddOptions
): Promise<void> {
  const spinner = p.spinner()
  const shouldCleanup = skillSource.type === 'github'

  try {
    let discoveredSkills = discoverSkills(repoDir)

    if (discoveredSkills.length === 0) {
      p.log.error('No skills found in repository')
      p.log.message('A skill is a directory containing a SKILL.md file.')
      process.exit(1)
    }

    if (skillSource.skillPath) {
      const requestedPath = skillSource.skillPath
      const matchedSkill = discoveredSkills.find((skill) => {
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

    const workspaceRoot = findWorkspaceRoot()
    let agent: AgentType | undefined

    if (options.agent) {
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
      const detectedAgents = detectAllAgents(workspaceRoot)

      if (detectedAgents.length === 0) {
        p.log.warn('No agent detected in workspace. Defaulting to Cursor.')
        agent = 'cursor'
      } else if (detectedAgents.length === 1) {
        agent = detectedAgents[0]
        p.log.info(`Detected agent: ${agentConfigs[agent].name}`)
      } else {
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

        agent = selected
      }
    }

    let skillsToInstall: DiscoveredSkill[]

    if (discoveredSkills.length === 1) {
      skillsToInstall = discoveredSkills
    } else {
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

      skillsToInstall = selected
    }

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
    if (shouldCleanup) {
      cleanupTempDir(repoDir)
    }
  }
}

/**
 * Install a single skill (exported for project init)
 */
export async function installSingleSkill(
  skillDir: string,
  source: string,
  options: AddOptions,
  agent: AgentType | undefined,
  workspaceRoot: string,
  spinner?: ReturnType<typeof p.spinner>
): Promise<void> {
  const activeSpinner = spinner ?? p.spinner()
  const customizable = isCustomizableSkill(skillDir)
  let skillName: string
  let customized = false
  let values = {}

  if (customizable) {
    p.log.info('Customizable skill detected.')

    const configPath = getSkillConfigPath(skillDir)
    const config = parseSkillConfig(configPath)
    skillName = config.meta.name?.trim() || basename(skillDir)

    if (options.config) {
      const presetValues = parsePresetConfig(options.config)
      values = getDefaultValues(config, presetValues)
    } else {
      values = await promptForVariables(config)
    }

    customized = true
  } else {
    skillName = extractSkillName(skillDir)
    p.log.info(`Installing standard skill: ${skillName}`)
  }

  const outputDir = options.output
    ? resolve(options.output)
    : getSkillOutputDir(skillName, agent, options.global, workspaceRoot)

  if (existsSync(outputDir) && !options.dryRun) {
    if (options.force) {
      // Agent/non-interactive overwrite
    } else {
      const overwrite = await p.confirm({
        message: `Skill '${skillName}' already exists. Overwrite?`,
        initialValue: false,
      })

      if (p.isCancel(overwrite) || !overwrite) {
        p.log.info(`Skipping installation of '${skillName}'.`)
        return
      }
    }
  }

  activeSpinner.start(`Installing ${skillName}...`)

  let files: string[]
  if (customizable) {
    files = await renderSkill(skillDir, outputDir, values, options.dryRun)
  } else {
    files = copyStandardSkill(skillDir, outputDir, options.dryRun)
  }

  activeSpinner.stop(`${skillName} installed!`)

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

function extractSkillName(skillDir: string): string {
  const skillMdPath = join(skillDir, 'SKILL.md')

  if (!existsSync(skillMdPath)) {
    return basename(skillDir)
  }

  const content = readFileSync(skillMdPath, 'utf-8')
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) {
    return basename(skillDir)
  }

  const nameMatch = frontmatterMatch[1].match(/^name:\s*(.+)$/m)
  if (!nameMatch) {
    return basename(skillDir)
  }

  return nameMatch[1].trim()
}

function copyStandardSkill(
  skillDir: string,
  outputDir: string,
  dryRun: boolean = false
): string[] {
  const files: string[] = []
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
