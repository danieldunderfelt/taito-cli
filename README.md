# Taito CLI

A CLI for **initializing projects from customizable templates**, and for installing customizable [Agent Skills](https://agentskills.io).

Templates are ordinary git repos with a `.taito/template.config.toml`. Skills use the same customization engine (`.taito/` + EJS + TOML). "Taito" is Finnish for "skill."

## Why Taito?

Most boilerplate tools copy files once and leave you on your own. Taito templates are:

- **Customizable** — prompts, EJS templates, and optional components (include/exclude files & skills)
- **Composable** — duplicate a template into a new repo, or extend one as a git worktree/branch
- **Updatable** — `taito update` pulls template changes into projects (three-way merge) or child templates (git merge)
- **Skill-aware** — customizable skills inside a template run through the full skill customizer on project init

Skill install still works the same way as before: `taito add owner/repo` auto-detects templates vs skills.

## Installation

```bash
npm install -g taito-cli

# Or run directly
npx taito-cli --help
```

Standalone binaries for macOS (Apple Silicon), Linux (x64/arm64), and Windows (x64) ship in the npm package. No runtime required.

## Quick Start — Projects

```bash
# 1. Make your boilerplate a template (git repo + config)
#    See skills/template-development or:
mkdir -p my-template/.taito
# add .taito/template.config.toml, commit, then:

taito add ~/Work/project-template

# 2. Create a project (path defaults to current directory)
taito new project -t project-template
taito new project ./acme-app -t project-template

# 3. Later, pull template updates
cd acme-app
taito update
```

### Example: `~/Work/project-template`

If you keep a scaffold at `~/Work/project-template`:

1. Ensure it is a **git repository**
2. Add `.taito/template.config.toml` (minimum: `[meta]` with `name`)
3. Optionally add `.taito/*.ejs` customization points for files like `AGENT.md`
4. Register: `taito add ~/Work/project-template`
5. Init: `taito new project ./my-app -t project-template`

## Quick Start — Skills

```bash
# Install a skill (same command — auto-detected via SKILL.md)
taito add owner/repo
taito add owner/repo/path/to/skill --agent cursor

# Scaffold a new customizable skill package
taito new skill ./my-skill

# List templates + skills
taito list
```

## How `taito add` decides

1. If the source has `.taito/template.config.toml` → **register a template**
2. Else if it contains `SKILL.md` trees → **install skill(s)** (existing behavior)
3. Else → error

GitHub sources work for both. Templates are **git cloned** into `~/.taito/templates/<name>/`. Skills still use the lightweight tarball fetch.

## CLI Commands

### `taito add <source>`

Register a template **or** install a skill.

```bash
# Templates
taito add ~/Work/project-template
taito add owner/template-repo
taito add ~/Work/my-variant --duplicate project-template
taito add ~/Work/my-child --extend project-template
taito add ~/Work/renamed --duplicate project-template --name my-name

# Skills
taito add owner/repo
taito add owner/repo/path/to/skill --agent cursor
taito add owner/repo --config ./answers.toml
taito add ./path/to/skill --dry-run
```

Template options: `--duplicate`, `--extend`, `--name`, `--force`, `--ref`  
Skill options: `--config`, `--agent`, `--global`, `--output`, `--dry-run`, `--ref`

### `taito new project [path] -t/--template <name>`

Initialize a project from a registered template.

- `path` defaults to `.`
- Creates the directory (`mkdir -p`) if missing
- Prompts for template variables and components
- Runs the skill customizer for each included customizable skill
- Writes `.taito/project.meta.toml` and initializes git if needed

```bash
taito new project -t project-template
taito new project ./acme -t project-template --config ./answers.toml
taito new project ./acme -t project-template --force --agent cursor
```

### `taito new skill [path]`

Scaffold a customizable skill (`SKILL.md` + `.taito/skill.config.toml` + `.taito/SKILL.md.ejs`).

### `taito update [path]`

Pull updates from the base template into a **project** or **child template** (defaults to `.`).

### `taito template` — extract a template from a project

`taito template scan` lists a **small baseline** of common agent/config files plus exclusion patterns. The agent (via the create-template skill) discovers the full file list from the user’s description of the template.

```bash
# Baseline common files + exclusions (not a full inventory)
taito template scan . --json

# After the agent proposes files and the user approves, init from a manifest:
taito template init ~/Work/my-template --manifest ./manifest.json

# Generalize stubs/EJS (create-template + template-development), then:
taito add ~/Work/my-template
# Apply back with `taito apply` / apply-template skill
```

Agent skill:

```bash
taito add danieldunderfelt/taito-cli/skills/create-template
```

### `taito apply` — adopt a template on an existing project

For repos that already have content, use file-by-file apply instead of `taito new project`:

```bash
# Inventory (machine-readable for agents)
taito apply plan -t project-template --json

# Safe: write files the project is missing
taito apply write -t project-template --file docs/architecture/.gitkeep

# Inspect template content to merge by hand (do not blind-overwrite richer project files)
taito apply cat -t project-template --file CLAUDE.md
taito apply cat -t project-template --file docs/PROJECT.md

# Install one template skill
taito apply skill -t project-template --skill design

# Record origin so future `taito update` works
taito apply finalize -t project-template
```

Statuses from `plan`: `missing` → write; `identical` → skip; `differs` → merge carefully (`projectRicher` means keep project content).

Agent skill for this workflow:

```bash
taito add danieldunderfelt/taito-cli/skills/apply-template
```

### `taito list` / `taito remove` / `taito build`

- `list` — registered templates and installed skills
- `remove` / `rm` — unregister a template or remove a skill
- `build` — render `.taito/*.ejs` with defaults (works for skills and templates)

## Template format

```
my-template/                 # git repo
├── .taito/
│   ├── template.config.toml # required
│   └── AGENT.md.ejs         # optional
├── AGENT.md
├── docs/
└── .agents/skills/...
```

Minimal config:

```toml
[meta]
name = "project-template"
version = "0.1.0"
description = "My project scaffold"

[variables.PROJECT_NAME]
type = "string"
prompt = "Project name?"
default = "my-project"

[components.extra_docs]
prompt = "Include extra docs?"
default = true
paths = ["docs/extra/**"]
```

Variable types match skills (`string`, `choice`, `boolean`, `array`) with `${VAR}` interpolation.

For a full authoring guide, install the bundled skill:

```bash
taito add danieldunderfelt/taito-cli/skills/template-development
```

## Customizable Skills

When a skill contains `.taito/skill.config.toml`, install prompts for variables and renders EJS templates into your agent skills directory. See the [Creating Customizable Skills](#creating-customizable-skills) section below, or:

```bash
taito add danieldunderfelt/taito-cli/skills/customizable-skills
```

### Multi-Agent Support

Skills always install to the canonical **`.agents/skills/`** directory (same convention as [skills.sh](https://skills.sh)). The installer prompts for agents with a multiselect:

- **`.agents`** — canonical install (covers tools that read `.agents/skills`, not listed separately as “Amp” / “Goose”)
- **Claude Code**, **Cursor**, **Windsurf**, etc. — get a **symlink** from their agent path → `.agents/skills/<skill>`

```bash
# Interactive: pick .agents and/or Claude Code, Cursor, …
taito add owner/repo

# Non-interactive: canonical + Claude symlink
taito add owner/repo --agent .agents,claudeCode
```

Use `--global` where supported (canonical `~/.agents/skills`).

## Creating Customizable Skills

Add a `.taito/` folder that mirrors your skill structure with EJS templates.

```
my-skill/
├── SKILL.md
└── .taito/
    ├── skill.config.toml
    └── SKILL.md.ejs
```

```toml
[meta]
name = "my-skill"
version = "1.0.0"

[variables.PROJECT_NAME]
type = "string"
prompt = "What is your project name?"
default = "my-app"
```

After editing templates, run `taito build` to regenerate root defaults for other CLIs.

### Variable Types

| Type      | Prompt Style         | Value      |
| --------- | -------------------- | ---------- |
| `string`  | Text input           | `string`   |
| `choice`  | Select menu          | `string`   |
| `boolean` | Yes/No confirm       | `boolean`  |
| `array`   | Comma-separated text | `string[]` |

### Preset Configuration

```toml
# answers.toml
PROJECT_NAME = "acme-app"
FRAMEWORK = "react"
```

```bash
taito add owner/repo --config ./answers.toml
taito new project -t my-template --config ./answers.toml
```

## Global state

| Path | Purpose |
|------|---------|
| `~/.taito/registry.toml` | Registered templates |
| `~/.taito/templates/<name>/` | Clones of GitHub-sourced templates |

Override home with `TAITO_HOME`.

## Private Repositories

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
taito add private-org/private-template
taito add private-org/private-skill
```

## License

MIT
