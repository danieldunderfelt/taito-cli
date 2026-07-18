#!/usr/bin/env bun
import { Command } from 'commander'

import { addCommand } from '../src/commands/add.js'
import {
  applyCatCommand,
  applyFinalizeCommand,
  applyPlanCommand,
  applySkillCommand,
  applyWriteCommand,
} from '../src/commands/apply.js'
import { buildCommand } from '../src/commands/build.js'
import { listCommand } from '../src/commands/list.js'
import { newProjectCommand } from '../src/commands/new-project.js'
import { newSkillCommand } from '../src/commands/new-skill.js'
import { removeCommand } from '../src/commands/remove.js'
import {
  templateInitCommand,
  templateScanCommand,
} from '../src/commands/template.js'
import { updateCommand } from '../src/commands/update.js'

// Version is injected at build time via --define
declare const BUILD_VERSION: string
const version = typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : '1.0.0'

const program = new Command()

program
  .name('taito')
  .description(
    'CLI for initializing projects from customizable templates and managing customizable Agent Skills'
  )
  .version(version)

program
  .command('add <source>')
  .description(
    'Register a project template or install a skill (auto-detected from source)'
  )
  .option('-c, --config <path>', 'Path to preset config file (TOML)')
  .option('-d, --dry-run', 'Preview changes without writing files')
  .option('-o, --output <path>', 'Custom output directory (skills)')
  .option('-r, --ref <ref>', 'Git ref (branch, tag, or commit)')
  .option(
    '-a, --agent <agent>',
    'Target agent (cursor, claudeCode, windsurf, etc.)'
  )
  .option('-g, --global', 'Install skill globally instead of locally')
  .option(
    '--duplicate <template>',
    'Duplicate a registered template to <source> path'
  )
  .option(
    '--extend <template>',
    'Extend a registered template as a worktree at <source> path'
  )
  .option('-n, --name <name>', 'Override registered template name')
  .option('-f, --force', 'Overwrite existing registration / non-empty dest')
  .action(async (source: string, options) => {
    await addCommand(source, {
      config: options.config,
      dryRun: options.dryRun,
      output: options.output,
      ref: options.ref,
      agent: options.agent,
      global: options.global,
      duplicate: options.duplicate,
      extend: options.extend,
      name: options.name,
      force: options.force,
    })
  })

const newCmd = program
  .command('new')
  .description('Create a new project or skill')

newCmd
  .command('project [path]')
  .description('Initialize a project from a registered template')
  .requiredOption(
    '-t, --template <name>',
    'Registered template name to use'
  )
  .option('-c, --config <path>', 'Path to preset config file (TOML)')
  .option('-f, --force', 'Continue even if destination is not empty')
  .option('-d, --dry-run', 'Preview without writing files')
  .option('-a, --agent <agent>', 'Agent for installing template skills')
  .action(async (path: string | undefined, options) => {
    await newProjectCommand(path ?? '.', {
      template: options.template,
      config: options.config,
      force: options.force,
      dryRun: options.dryRun,
      agent: options.agent,
    })
  })

newCmd
  .command('skill [path]')
  .description('Scaffold a new customizable skill package')
  .option('-n, --name <name>', 'Skill name')
  .option('--description <text>', 'Skill description')
  .option('-f, --force', 'Overwrite existing files')
  .action(async (path: string | undefined, options) => {
    await newSkillCommand(path ?? '.', {
      name: options.name,
      description: options.description,
      force: options.force,
    })
  })

program
  .command('update [path]')
  .description(
    'Pull updates from the base template into a project or child template'
  )
  .action(async (path: string | undefined) => {
    await updateCommand(path ?? '.')
  })

const applyCmd = program
  .command('apply')
  .description(
    'Apply a registered template onto an existing project (file-by-file, agent-friendly)'
  )

applyCmd
  .command('plan [path]')
  .description(
    'List template files/skills vs the project (statuses: missing|identical|differs)'
  )
  .requiredOption('-t, --template <name>', 'Registered template name')
  .option('-c, --config <path>', 'Preset answers TOML')
  .option('--json', 'Machine-readable JSON output')
  .action(async (path: string | undefined, options) => {
    await applyPlanCommand(path ?? '.', {
      template: options.template,
      config: options.config,
      json: options.json,
    })
  })

applyCmd
  .command('cat')
  .description('Print the rendered template content for one file')
  .requiredOption('-t, --template <name>', 'Registered template name')
  .requiredOption('-f, --file <path>', 'Relative file path in the template')
  .option('-c, --config <path>', 'Preset answers TOML')
  .option('--json', 'Wrap content in JSON')
  .action(async (options) => {
    await applyCatCommand({
      template: options.template,
      file: options.file,
      config: options.config,
      json: options.json,
    })
  })

applyCmd
  .command('write [path]')
  .description(
    'Write one rendered template file into the project (refuses overwrite unless --force)'
  )
  .requiredOption('-t, --template <name>', 'Registered template name')
  .requiredOption('-f, --file <path>', 'Relative file path to write')
  .option('-c, --config <path>', 'Preset answers TOML')
  .option('--force', 'Overwrite differing project file')
  .option('--json', 'Machine-readable JSON output')
  .action(async (path: string | undefined, options) => {
    await applyWriteCommand(path ?? '.', {
      template: options.template,
      file: options.file,
      config: options.config,
      force: options.force,
      json: options.json,
    })
  })

applyCmd
  .command('skill [path]')
  .description('Install one skill from the template into the project')
  .requiredOption('-t, --template <name>', 'Registered template name')
  .requiredOption(
    '-s, --skill <name>',
    'Skill directory name or relative path'
  )
  .option('-c, --config <path>', 'Preset answers TOML for skill customization')
  .option('-a, --agent <agent>', 'Target agent for skill install')
  .option('--force', 'Overwrite existing skill without prompting')
  .action(async (path: string | undefined, options) => {
    await applySkillCommand(path ?? '.', {
      template: options.template,
      skill: options.skill,
      config: options.config,
      agent: options.agent,
      force: options.force,
    })
  })

applyCmd
  .command('finalize [path]')
  .description(
    'Write .taito/project.meta.toml so `taito update` works after a manual apply'
  )
  .requiredOption('-t, --template <name>', 'Registered template name')
  .option('-c, --config <path>', 'Preset answers TOML')
  .option('--force', 'Overwrite existing project.meta.toml')
  .option('--json', 'Machine-readable JSON output')
  .action(async (path: string | undefined, options) => {
    await applyFinalizeCommand(path ?? '.', {
      template: options.template,
      config: options.config,
      force: options.force,
      json: options.json,
    })
  })

const templateCmd = program
  .command('template')
  .description(
    'Scan a project for template candidates and scaffold a new template'
  )

templateCmd
  .command('scan [path]')
  .description(
    'List common agent/config files and exclusion patterns (baseline only; agent discovers the rest)'
  )
  .option('--json', 'Machine-readable JSON output')
  .option(
    '--out-manifest <path>',
    'Write a JSON manifest of baseline common files'
  )
  .action(async (path: string | undefined, options) => {
    await templateScanCommand(path ?? '.', {
      json: options.json,
      outManifest: options.outManifest,
    })
  })

templateCmd
  .command('init <dest>')
  .description(
    'Copy selected files into a new template folder with template.config.toml + git'
  )
  .option('--from <path>', 'Source project path', '.')
  .option('-n, --name <name>', 'Template name (default: dest folder name)')
  .option('--description <text>', 'Template description')
  .option(
    '-m, --manifest <path>',
    'JSON manifest with { "files": ["..."] }'
  )
  .option(
    '-i, --include <paths>',
    'Comma-separated relative paths to include (repeatable)',
    (value: string, prev: string[]) => {
      prev.push(value)
      return prev
    },
    [] as string[]
  )
  .option(
    '--baseline',
    'Include only the scan baseline common files (prefer an agent-built --manifest)'
  )
  .option('-f, --force', 'Allow non-empty destination')
  .option('--json', 'Machine-readable JSON output')
  .action(async (dest: string, options) => {
    await templateInitCommand(dest, {
      from: options.from,
      name: options.name,
      description: options.description,
      manifest: options.manifest,
      include: options.include,
      baseline: options.baseline,
      force: options.force,
      json: options.json,
    })
  })

program
  .command('list')
  .description('List registered templates and installed skills')
  .action(async () => {
    await listCommand()
  })

program
  .command('remove <name>')
  .alias('rm')
  .description('Unregister a template or remove an installed skill')
  .action(async (name: string) => {
    await removeCommand(name)
  })

program
  .command('build [path]')
  .description(
    'Build default files from .taito/ templates (skills or project templates)'
  )
  .option('-o, --output <path>', 'Custom output directory')
  .action(async (path: string | undefined, options) => {
    await buildCommand(path, {
      output: options.output,
    })
  })

program.parse()
