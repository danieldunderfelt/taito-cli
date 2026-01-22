# Taito CLI

A CLI for installing customizable [Agent Skills](https://agentskills.io) from GitHub.

Agent Skills are instructions that AI coding assistants can follow to perform specific tasks. The `taito` CLI extends the standard Agent Skills format with support for **customizable skills** that adapt to your project's specific configuration during installation.

## Why Taito?

There are a few CLI tools for managing agent skills, such as [Vercel's skills CLI](https://skills.sh) and [Agent Skills Manager](https://www.agentskills.in/). However, none of them support customizable skills. If you make a cool skill for your project, it probably has a few project-specific details that won't work for other projects which makes sharing it with other developers difficult. Each developer who adds your skill would need to manually edit the skill to make it work for their project.

Taito makes it easy to customize skills to your project's specific details, while maintaining installability with other CLIs that don't support customization. Simply write your skill, add the Taito skill from this repository (`taito add danieldunderfelt/taito-cli`), and ask your AI agent to make it customizable in the Taito format. Then anyone who adds your skill will be able to customize it to their project's specific details.

As for features, I can add pretty much anything the other CLI's support. If you have a feature request, please open an issue. Yes, that means they can also add customizable skills as well.

I really hope that they do.

Oh btw, "taito" is the Finnish word for "skill". In case you were wondering.

## Installation

```bash
# Using npm
npm install -g taito-cli

# Or run directly with npx
npx taito-cli add owner/repo
```

The package includes standalone executables for macOS (Apple Silicon), Linux (x64/arm64), and Windows (x64). No runtime dependencies required.

### Windows Users

The npm package uses a shell script launcher that works natively on macOS and Linux. On Windows, you have a few options:

1. **Git Bash / WSL** (Recommended): If you have Git for Windows installed, the shell launcher works automatically in Git Bash or through WSL.

2. **Use the .cmd launcher**: After installing, run the CLI using the included batch script:

   ```cmd
   node_modules\.bin\taito.cmd add owner/repo
   ```

3. **Run the binary directly**: The standalone Windows executable can be run without any launcher:

   ```cmd
   %APPDATA%\npm\node_modules\taito-cli\dist\taito-windows-x64.exe add owner/repo
   ```

4. **Download the binary**: Download `taito-windows-x64.exe` from the [releases page](https://github.com/danieldunderfelt/taito-cli/releases) and add it to your PATH.

## Quick Start

```bash
# Install a skill from GitHub (auto-detects your agent)
taito add aikoa-platform/agent-skills

# Install for a specific agent
taito add aikoa-platform/agent-skills --agent cursor
taito add aikoa-platform/agent-skills --agent windsurf

# Install with preset configuration (non-interactive)
taito add aikoa-platform/agent-skills --config ./my-config.toml

# List installed skills (shows all detected agents)
taito list

# Remove a skill
taito remove react-localization
```

## How It Works

### Multi-Agent Support

`taito` automatically detects which AI coding assistant you're using and installs skills to the correct location. Supported agents:

- **Cursor** (`.cursor/skills/`)
- **Windsurf** (`.windsurf/skills/`)
- **Claude Code** (`.claude/skills/`)
- **Codex** (`.codex/skills/`)
- **OpenCode** (`.opencode/skill/`)
- **GitHub Copilot** (`.github/skills/`)
- **VS Code** (`.github/skills/`)
- **Gemini CLI** (`.gemini/skills/`)
- **Goose** (`.agents/skills/`)
- **AMP** (`.agents/skills/`)
- **Trae** (`.trae/skills/`)
- **Antigravity** (`.agent/skills/`)

If multiple agents are detected, you'll be prompted to choose which one to install for. You can also explicitly specify an agent with the `--agent` flag.

### Standard Skills

For standard (non-customizable) skills, `taito` works just like other skill installers: it downloads the skill from GitHub and copies it to the skills directory for your agent.

### Customizable Skills

When a skill contains a `.taito/` folder, it becomes customizable. During installation, `taito` will:

1. Detect the `.taito/skill.config.toml` configuration file
2. Prompt you for values (or use a preset config file)
3. Render templates with your values
4. Output the customized skill to the skills directory for your agent

For example, a localization skill might ask:

- What is your source language?
- What languages do you support?
- What format do you use for your translation files?
- Where are your translation files located?

The resulting `SKILL.md` will contain instructions tailored to your project.

## CLI Commands

### `taito add <source>`

Install a skill from GitHub or a local path.

```bash
# From GitHub (auto-detects agent)
taito add owner/repo
taito add owner/repo@v1.0.0  # specific tag/branch

# Install for specific agent
taito add owner/repo --agent cursor
taito add owner/repo --agent opencode

# From local path
taito add ./path/to/skill

# Options
taito add owner/repo --config ./answers.toml  # preset config
taito add owner/repo --dry-run                # preview without writing
taito add owner/repo --output ./custom/path   # custom output directory
taito add owner/repo --ref main               # specific git ref
taito add owner/repo --global                 # install globally (agent-dependent)
```

### `taito list`

List all installed skills across all detected agents.

```bash
taito list
```

Output:

```
Cursor (1 skill):
  react-localization (customized)
    Source: aikoa-platform/agent-skills
    Installed: 1/21/2026

  Directory: /path/to/.cursor/skills

Windsurf (1 skill):
  code-review
    Source: vercel-labs/agent-skills
    Installed: 1/20/2026

  Directory: /path/to/.windsurf/skills
```

### `taito remove <name>`

Remove an installed skill. If the skill is installed for multiple agents, you'll be prompted to choose which one to remove from.

```bash
taito remove react-localization
```

### `taito build [path]`

For skill authors: generate skill files from `.taito/` templates using default values. This will allow the skill to be used with other CLIs that don't support customization.

```bash
# Build in current directory
taito build

# Build specific skill
taito build ./my-skill/
```

## Creating Customizable Skills

To make your skill customizable, add a `.taito/` folder that mirrors your skill structure with EJS templates.

### Directory Structure

```
my-skill/
├── SKILL.md                  # Default output (for standard CLIs)
├── scripts/
│   └── helper.sh             # Default script
└── .taito/                  # Customization folder
    ├── skill.config.toml     # Variable definitions
    ├── SKILL.md.ejs          # Template for SKILL.md
    └── scripts/
        └── helper.sh.ejs     # Template for script (optional)
```

### Configuration File

Create `.taito/skill.config.toml` to define customizable variables:

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

Templates use [EJS](https://ejs.co/) syntax. Create `.taito/SKILL.md.ejs`:

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

After editing templates, run `taito build` to regenerate the default `SKILL.md`:

```bash
taito build ./my-skill/
```

This ensures your skill remains compatible with other CLIs that don't support customization.

## Compatibility

### With Standard Skills

`taito` fully supports standard Agent Skills that don't have a `.taito/` folder. It simply copies `SKILL.md`, `scripts/`, `references/`, and `assets/` to the output directory.

### With Other CLIs

Customizable skills are designed to be backwards compatible:

- **Other CLIs** (like [Vercel's skills CLI](https://skills.sh)) will see only the root-level files (`SKILL.md`, `scripts/`, etc.) and install them normally. The `.taito/` folder is (hopefully) ignored as a hidden directory.

- **taito** checks for `.taito/skill.config.toml`. If present, it uses the templates for customization. If not, it behaves like a standard skill installer.

This means you can publish a single skill that works with any CLI—users with `taito` get customization, while users with other CLIs get sensible defaults.

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
taito add owner/repo --config ./team-config.toml
```

## Multi-Agent Detection

`taito` automatically detects which AI coding assistant is being used by checking for marker directories:

```bash
# Single agent detected - installs automatically
$ taito add owner/repo
✓ Detected agent: Cursor
✓ Installing to .cursor/skills/...

# Multiple agents detected - prompts for choice
$ taito add owner/repo
✓ Multiple agents detected: Cursor, Windsurf
? Which agent do you want to install the skill for?
  > Cursor
    Windsurf

# Force specific agent
$ taito add owner/repo --agent windsurf
✓ Installing to .windsurf/skills/...
```

The detection order prioritizes the most commonly used agents first. If you're using multiple agents in the same project and want skills installed for all of them, run the command multiple times with different `--agent` flags.

## Private Repositories

For private GitHub repositories, set the `GITHUB_TOKEN` environment variable:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
taito add private-org/private-skill
```

## Output Location

By default, skills are installed to the appropriate directory for your detected agent:

- Cursor: `.cursor/skills/<skill-name>/`
- Windsurf: `.windsurf/skills/<skill-name>/`
- Claude Code: `.claude/skills/<skill-name>/`
- etc.

The workspace root is detected by looking for:

1. Agent-specific directories (`.cursor`, `.windsurf`, etc.)
2. `.git/` directory
3. `package.json`
4. Current working directory (fallback)

### Global Installation

Some agents support global installation with the `--global` flag:

```bash
taito add owner/repo --global
```

This installs to the agent's global directory (typically in your home directory) instead of the project-local directory. Not all agents support global installation.

### Custom Output

Use `--output` to specify a custom location (bypasses agent detection):

```bash
taito add owner/repo --output ~/.my-skills/
```

## License

MIT
