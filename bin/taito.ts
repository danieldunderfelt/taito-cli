#!/usr/bin/env bun
import { Command } from 'commander'
import { addCommand } from '../src/commands/add.js'
import { buildCommand } from '../src/commands/build.js'
import { listCommand } from '../src/commands/list.js'
import { removeCommand } from '../src/commands/remove.js'

// Version is injected at build time via --define
declare const BUILD_VERSION: string
const version = typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : '1.0.0'

const program = new Command()

program
  .name('taito')
  .description('CLI for installing customizable Agent Skills')
  .version(version)

program
  .command('add <source>')
  .description('Install a skill from GitHub (owner/repo) or local path')
  .option('-c, --config <path>', 'Path to preset config file (TOML)')
  .option('-d, --dry-run', 'Preview changes without writing files')
  .option('-o, --output <path>', 'Custom output directory')
  .option('-r, --ref <ref>', 'Git ref (branch, tag, or commit)')
  .option(
    '-a, --agent <agent>',
    'Target agent (cursor, claudeCode, windsurf, etc.)'
  )
  .option('-g, --global', 'Install globally instead of locally')
  .action(async (source: string, options) => {
    await addCommand(source, {
      config: options.config,
      dryRun: options.dryRun,
      output: options.output,
      ref: options.ref,
      agent: options.agent,
      global: options.global,
    })
  })

program
  .command('list')
  .description('List installed skills')
  .action(async () => {
    await listCommand()
  })

program
  .command('remove <name>')
  .alias('rm')
  .description('Remove an installed skill')
  .action(async (name: string) => {
    await removeCommand(name)
  })

program
  .command('build [path]')
  .description('Build default files from .taito/ templates (for skill authors)')
  .option('-o, --output <path>', 'Custom output directory')
  .action(async (path: string | undefined, options) => {
    await buildCommand(path, {
      output: options.output,
    })
  })

program.parse()
