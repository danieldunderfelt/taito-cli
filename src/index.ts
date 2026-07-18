// Re-export types
export * from './types.js'

// Re-export lib functions
export * from './lib/config.js'
export * from './lib/classify.js'
export * from './lib/github.js'
export * from './lib/metadata.js'
export * from './lib/paths.js'
export * from './lib/prompts.js'
export * from './lib/render.js'
export * from './lib/registry.js'
export * from './lib/git.js'
export * from './lib/glob.js'
export * from './lib/template-materialize.js'
export * from './lib/apply-plan.js'

// Re-export commands
export { addCommand, installSingleSkill } from './commands/add.js'
export {
  applyPlanCommand,
  applyCatCommand,
  applyWriteCommand,
  applySkillCommand,
  applyFinalizeCommand,
} from './commands/apply.js'
export { listCommand } from './commands/list.js'
export { removeCommand } from './commands/remove.js'
export { buildCommand } from './commands/build.js'
export { newProjectCommand } from './commands/new-project.js'
export { newSkillCommand } from './commands/new-skill.js'
export { updateCommand } from './commands/update.js'
