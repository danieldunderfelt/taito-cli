# Customizable Skills

Customizable skills adapt to a project's specific configuration during installation. This reference explains the `.skillz/` format that enables customization.

## What Makes a Skill Customizable

A standard skill becomes customizable when it contains a `.skillz/` folder with:
- `skill.config.toml` - Variable definitions
- EJS templates (`.ejs` files) that use those variables

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

## How It Works

During installation with the Skillz CLI:

1. The CLI detects `.skillz/skill.config.toml`
2. User is prompted for variable values (or uses a preset config)
3. Templates are rendered with those values
4. Customized files are output to the skills directory

## Configuration File Format

Create `.skillz/skill.config.toml` to define customizable variables:

```toml
[meta]
name = "my-skill"
version = "1.0.0"
description = "Optional description"

# String variable
[variables.PROJECT_NAME]
type = "string"
prompt = "What is your project name?"
default = "my-app"
required = false
validate = "^[a-z-]+$"

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

## Variable Types

| Type | Prompt Style | Value Type | Notes |
|------|--------------|------------|-------|
| `string` | Text input | `string` | Optional regex validation with `validate` |
| `choice` | Select menu | `string` | Must define `options` array |
| `boolean` | Yes/No confirm | `boolean` | |
| `array` | Comma-separated text | `string[]` | Parsed from comma-separated input |

### String Variables

```toml
[variables.PROJECT_NAME]
type = "string"
prompt = "What is your project name?"
default = "my-app"
required = false           # Optional, defaults to false
validate = "^[a-z-]+$"     # Optional regex pattern
```

### Choice Variables

```toml
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
```

### Boolean Variables

```toml
[variables.USE_TYPESCRIPT]
type = "boolean"
prompt = "Are you using TypeScript?"
default = true
```

### Array Variables

```toml
[variables.LANGUAGES]
type = "array"
prompt = "Which languages do you support? (comma-separated)"
default = ["en", "es"]
```

## Template Format

Templates use [EJS](https://ejs.co/) (Embedded JavaScript) syntax. Variables from the config are available directly.

### Basic Interpolation

```ejs
# <%= PROJECT_NAME %>

This skill is configured for **<%= FRAMEWORK %>**.
```

### Conditionals

```ejs
<% if (USE_TYPESCRIPT) { %>
## TypeScript Configuration

Make sure your `tsconfig.json` includes...
<% } %>
```

### Loops

```ejs
## Supported Languages

<% SUPPORTED_LANGUAGES.forEach(lang => { %>
- <%= lang %>
<% }) %>
```

### Complete Example

Create `.skillz/SKILL.md.ejs`:

```ejs
---
name: my-skill
description: A skill for <%= PROJECT_NAME %>
---

# My Skill

This skill is configured for **<%= FRAMEWORK %>**.

<% if (USE_TYPESCRIPT) { %>
## TypeScript Configuration

Make sure your `tsconfig.json` includes the necessary settings.
<% } %>

## Supported Languages

<% SUPPORTED_LANGUAGES.forEach(lang => { %>
- <%= lang %>
<% }) %>
```

## Backwards Compatibility

Customizable skills are designed to be backwards compatible:

- **Other CLIs** (like skills.sh) see only the root-level files (`SKILL.md`, `scripts/`, etc.) and install them normally. The `.skillz/` folder is ignored as a hidden directory.

- **Skillz CLI** checks for `.skillz/skill.config.toml`. If present, it uses the templates for customization. If not, it behaves like a standard skill installer.

This means you can publish a single skill that works with any CLI—users with Skillz get customization, while users with other CLIs get sensible defaults.

## Keeping Defaults in Sync

After editing templates, run `skillz build` to regenerate the default files:

```bash
skillz build ./my-skill/
```

This uses the default values from `skill.config.toml` to render the root-level files, ensuring compatibility with standard skill installers.

## Preset Configuration

For CI/CD or team-wide configurations, users can create a TOML file with preset values:

```toml
# team-config.toml
PROJECT_NAME = "acme-app"
FRAMEWORK = "react"
USE_TYPESCRIPT = true
SUPPORTED_LANGUAGES = ["en", "es", "fr", "de"]
```

Install non-interactively:

```bash
skillz add owner/repo --config ./team-config.toml
```

## Best Practices

1. **Provide sensible defaults** - Users should be able to accept all defaults and get a working skill
2. **Keep prompts clear** - Each prompt should make it obvious what value is expected
3. **Use choice for constrained values** - If there are only a few valid options, use `choice` instead of `string`
4. **Validate string inputs** - Use the `validate` regex pattern for strings that have format requirements
5. **Document customization** - In your skill's README, explain what each variable does
