---
name: template-development
description: Create and maintain Taito project templates. Use when adding .taito/template.config.toml, EJS customization points, optional components, duplicating or extending templates, or wiring taito update for projects and child templates.
---

# Template Development

This skill helps you author **Taito project templates** — git-backed boilerplate that `taito new project` materializes into real projects, with optional customization and updatable origins.

## When to use

- Turning a repo (e.g. `~/Work/project-template`) into a taito template
- Adding `.taito/template.config.toml` and EJS customization points
- Defining optional components (files / skills to include or skip)
- Choosing duplicate vs extend for template variants
- Understanding `taito update` for projects and child templates
- Generalizing files after `taito template init` / the **create-template** skill

## Quick Reference

```bash
# Register a local template (must be a git repo with template.config.toml)
taito add ~/Work/project-template

# Register from GitHub (cloned into ~/.taito/templates/<name>)
taito add owner/repo

# Duplicate → fresh git history at a new path
taito add ~/Work/my-variant --duplicate project-template

# Extend → git worktree + branch of the base
taito add ~/Work/my-child --extend project-template

# Initialize a project (path defaults to .)
taito new project -t project-template
taito new project ./acme-app -t project-template

# Pull template updates into a project or child template
taito update

# Apply a template onto an *existing* project (file-by-file; see apply-template skill)
taito apply plan -t project-template --json
taito apply finalize -t project-template

# List / remove
taito list
taito remove project-template
```

## Template structure

```
my-template/                    # must be a git repository
├── .taito/
│   ├── template.config.toml    # required
│   ├── AGENT.md.ejs            # optional customization points
│   └── docs/PROJECT.md.ejs
├── AGENT.md                    # defaults / non-templated files
├── docs/
├── .agents/skills/...          # skills may be customizable
└── .git/
```

See [references/TEMPLATE-FORMAT.md](references/TEMPLATE-FORMAT.md) for the full config schema, components, and EJS rules.

## Skills inside templates

- **Customizable skills** (`.taito/skill.config.toml`) are **not** rendered by the template engine. During `taito new project`, taito runs the normal skill customizer for each included customizable skill.
- **Standard skills** are copied with the project tree like any other files.
- Use `[components.*.skills]` to gate optional skill packages.

## Duplicate vs extend

| | Duplicate | Extend |
|---|-----------|--------|
| Git | Fresh `git init` | Worktree + branch `taito/<name>` of the base repo |
| Updates | Independent | `taito update` merges base into the child |
| Use when | Fork you will diverge heavily | Variant that should keep receiving base changes |

Details: [references/EXTEND-AND-DUPLICATE.md](references/EXTEND-AND-DUPLICATE.md).

## Updates

- **Projects** store origin in `.taito/project.meta.toml`. `taito update` re-renders the template at the old and new commits and three-way-merges into the project (git `merge-file`), so local edits are preserved when possible.
- **Child templates** run a git merge from the base tip.

See [references/UPDATE.md](references/UPDATE.md).

## Related

- Skill customization (same EJS + TOML variable system): install `customizable-skills` from this repo
- Scaffold a new skill package: `taito new skill`
