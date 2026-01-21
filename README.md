# skillz

A CLI for installing customizable [Agent Skills](https://agentskills.io) from GitHub.

Agent Skills are instructions that AI coding assistants can follow to perform specific tasks. The `skillz` CLI extends the standard Agent Skills format with support for **customizable skills** that adapt to your project's specific configuration during installation.

## Installation

```bash
# Using npm
npm install -g skillz

# Or run directly with npx/bunx/pnpx
npx skillz add owner/repo
bunx skillz add owner/repo
```

## Quick Start

```bash
# Install a skill from GitHub
skillz add aikoa/react-localization

# Install with preset configuration (non-interactive)
skillz add aikoa/react-localization --config ./my-config.toml

# List installed skills
skillz list

# Remove a skill
skillz remove react-localization
```

## How It Works

### Standard Skills

For standard (non-customizable) skills, `skillz` works just like other skill installers: it downloads the skill from GitHub and copies it to `.cursor/skills/`.

### Customizable Skills

When a skill contains a `.skillz/` folder, it becomes customizable. During installation, `skillz` will:

1. Detect the `.skillz/skill.config.toml` configuration file
2. Prompt you for values (or use a preset config file)
3. Render templates with your values
4. Output the customized skill to `.cursor/skills/`

For example, a localization skill might ask:

- What is your source language?
- Which t() function format do you use?
- Where are your translation files located?

The resulting `SKILL.md` will contain instructions tailored to your project.

## CLI Commands

### `skillz add <source>`

Install a skill from GitHub or a local path.

```bash
# From GitHub
skillz add owner/repo
skillz add owner/repo@v1.0.0  # specific tag/branch

# From local path
skillz add ./path/to/skill

# Options
skillz add owner/repo --config ./answers.toml  # preset config
skillz add owner/repo --dry-run                # preview without writing
skillz add owner/repo --output ./custom/path   # custom output directory
skillz add owner/repo --ref main               # specific git ref
```

### `skillz list`

List all installed skills.

```bash
skillz list
```

Output:

```
Installed skills (2):
  react-localization (customized)
    Source: aikoa/react-localization
    Installed: 1/21/2026

  code-review
    Source: vercel-labs/agent-skills
    Installed: 1/20/2026
```

### `skillz remove <name>`

Remove an installed skill.

```bash
skillz remove react-localization
```

### `skillz build [path]`

For skill authors: regenerate default files from `.skillz/` templates. This will allow the skill to be used with other CLIs that don't support customization.

```bash
# Build in current directory
skillz build

# Build specific skill
skillz build ./my-skill/
```

## Creating Customizable Skills

To make your skill customizable, add a `.skillz/` folder that mirrors your skill structure with EJS templates.

### Directory Structure

```
my-skill/
├── SKILL.md                  # Default output (for standard CLIs)
├── scripts/
│   └── helper.sh             # Default script
└── .skillz/                  # Customization folder
    ├── skill.config.toml     # Variable definitions
    ├── SKILL.md.ejs          # Template for SKILL.md
    └── scripts/
        └── helper.sh.ejs     # Template for script (optional)
```

### Configuration File

Create `.skillz/skill.config.toml` to define customizable variables:

```toml
[meta]
name = "my-skill"
version = "1.0.0"

# String variable
[variables.PROJECT_NAME]
type = "string"
prompt = "What is your project name?"
default = "my-app"

# Choice variable
[variables.FRAMEWORK]
type = "choice"
prompt = "Which framework are you using?"
default = "react"

  [[variables.FRAMEWORK.options]]
  value = "react"
  label = "React"

  [[variables.FRAMEWORK.options]]
  value = "vue"
  label = "Vue"

  [[variables.FRAMEWORK.options]]
  value = "svelte"
  label = "Svelte"

# Boolean variable
[variables.USE_TYPESCRIPT]
type = "boolean"
prompt = "Are you using TypeScript?"
default = true

# Array variable
[variables.SUPPORTED_LANGUAGES]
type = "array"
prompt = "Which languages do you support? (comma-separated)"
default = ["en", "es"]
```

### Variable Types

| Type      | Prompt Style         | Value      |
| --------- | -------------------- | ---------- |
| `string`  | Text input           | `string`   |
| `choice`  | Select menu          | `string`   |
| `boolean` | Yes/No confirm       | `boolean`  |
| `array`   | Comma-separated text | `string[]` |

### Template Format

Templates use [EJS](https://ejs.co/) syntax. Create `.skillz/SKILL.md.ejs`:

```markdown
---
name: my-skill
description: A skill for <%= PROJECT_NAME %>
---

# My Skill

This skill is configured for **<%= FRAMEWORK %>**.

<% if (USE_TYPESCRIPT) { %>

## TypeScript Configuration

Make sure your `tsconfig.json` includes...
<% } %>

## Supported Languages

<% SUPPORTED_LANGUAGES.forEach(lang => { %>

- <%= lang %>
  <% }) %>
```

### Keeping Defaults in Sync

After editing templates, run `skillz build` to regenerate the default `SKILL.md`:

```bash
skillz build ./my-skill/
```

This ensures your skill remains compatible with other CLIs that don't support customization.

## Compatibility

### With Standard Skills

`skillz` fully supports standard Agent Skills that don't have a `.skillz/` folder. It simply copies `SKILL.md`, `scripts/`, `references/`, and `assets/` to the output directory.

### With Other CLIs

Customizable skills are designed to be backwards compatible:

- **Other CLIs** (like [Vercel's skills CLI](https://skills.sh)) will see only the root-level files (`SKILL.md`, `scripts/`, etc.) and install them normally. The `.skillz/` folder is (hopefully) ignored as a hidden directory.

- **skillz** checks for `.skillz/skill.config.toml`. If present, it uses the templates for customization. If not, it behaves like a standard skill installer.

This means you can publish a single skill that works with any CLI—users with `skillz` get customization, while users with other CLIs get sensible defaults.

## Preset Configuration

For CI/CD or team-wide configurations, create a TOML file with preset values:

```toml
# team-config.toml
PROJECT_NAME = "acme-app"
FRAMEWORK = "react"
USE_TYPESCRIPT = true
SUPPORTED_LANGUAGES = ["en", "es", "fr", "de"]
```

Then install non-interactively:

```bash
skillz add owner/repo --config ./team-config.toml
```

## Private Repositories

For private GitHub repositories, set the `GITHUB_TOKEN` environment variable:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
skillz add private-org/private-skill
```

## Output Location

By default, skills are installed to `.cursor/skills/<skill-name>/`. The workspace root is detected by looking for:

1. `.cursor/` directory
2. `.git/` directory
3. `package.json`
4. Current working directory (fallback)

Use `--output` to specify a custom location:

```bash
skillz add owner/repo --output ~/.cursor/skills/
```

## License

MIT
