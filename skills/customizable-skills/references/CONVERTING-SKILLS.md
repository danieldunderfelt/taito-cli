# Converting Standard Skills to Customizable

This guide walks through the process of making an existing standard skill customizable.

## Overview

Converting a skill involves:

1. Identifying what to make customizable
2. Creating the `.skillz/` folder structure
3. Writing `skill.config.toml` with variable definitions
4. Converting static content to EJS templates
5. Testing with `skillz build`
6. Maintaining backwards compatibility

## Step 1: Identify Customizable Content

Review your skill and identify content that:

- Varies by project (paths, names, configurations)
- Has multiple valid options (frameworks, languages, tools)
- Could be toggled on/off (optional sections)
- Contains lists that might differ per user

### Common Customization Candidates

| Content Type | Example Variables |
|-------------|-------------------|
| Project names/paths | `PROJECT_NAME`, `SRC_DIR`, `CONFIG_PATH` |
| Framework/library | `FRAMEWORK`, `UI_LIBRARY`, `STATE_MANAGER` |
| Language settings | `LANGUAGES`, `DEFAULT_LOCALE` |
| Feature toggles | `USE_TYPESCRIPT`, `ENABLE_TESTING` |
| Tool preferences | `PACKAGE_MANAGER`, `LINTER` |

## Step 2: Create the .skillz/ Folder

Create a `.skillz/` folder in your skill root that mirrors the structure of files you want to customize:

```
my-skill/
├── SKILL.md                  # Keep this (default output)
├── scripts/
│   └── setup.sh              # Keep this (default output)
└── .skillz/                  # Create this
    ├── skill.config.toml     # Variable definitions
    ├── SKILL.md.ejs          # Template for SKILL.md
    └── scripts/
        └── setup.sh.ejs      # Template for setup.sh
```

## Step 3: Write skill.config.toml

Define your variables in `.skillz/skill.config.toml`:

```toml
[meta]
name = "my-skill"
version = "1.0.0"

[variables.PROJECT_NAME]
type = "string"
prompt = "What is your project name?"
default = "my-app"

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

[variables.USE_TYPESCRIPT]
type = "boolean"
prompt = "Are you using TypeScript?"
default = true

[variables.ADDITIONAL_TOOLS]
type = "array"
prompt = "Which additional tools do you use? (comma-separated)"
default = ["eslint", "prettier"]
```

### Variable Definition Reference

**String variable:**
```toml
[variables.NAME]
type = "string"
prompt = "User-facing question?"
default = "default-value"
required = false           # Optional
validate = "^[a-z-]+$"     # Optional regex
```

**Choice variable:**
```toml
[variables.OPTION]
type = "choice"
prompt = "Which option?"
default = "option1"

  [[variables.OPTION.options]]
  value = "option1"
  label = "Option 1"

  [[variables.OPTION.options]]
  value = "option2"
  label = "Option 2"
```

**Boolean variable:**
```toml
[variables.FLAG]
type = "boolean"
prompt = "Enable this feature?"
default = true
```

**Array variable:**
```toml
[variables.ITEMS]
type = "array"
prompt = "Which items? (comma-separated)"
default = ["item1", "item2"]
```

## Step 4: Create EJS Templates

Convert your static files to EJS templates.

### Before (static SKILL.md)

```markdown
---
name: my-skill
description: A skill for React projects
---

# My Skill

This skill is for React projects using TypeScript.

## Setup

Run the following in your project:

\`\`\`bash
npm install react-query
\`\`\`

## Configuration

Add to your `tsconfig.json`:
...
```

### After (SKILL.md.ejs template)

```ejs
---
name: my-skill
description: A skill for <%= PROJECT_NAME %>
---

# My Skill

This skill is for **<%= FRAMEWORK %>** projects<% if (USE_TYPESCRIPT) { %> using TypeScript<% } %>.

## Setup

Run the following in your project:

\`\`\`bash
<% if (FRAMEWORK === 'react') { %>
npm install react-query
<% } else if (FRAMEWORK === 'vue') { %>
npm install @tanstack/vue-query
<% } else { %>
npm install @tanstack/svelte-query
<% } %>
\`\`\`

<% if (USE_TYPESCRIPT) { %>
## TypeScript Configuration

Add to your `tsconfig.json`:
...
<% } %>

## Tools

This project uses:
<% ADDITIONAL_TOOLS.forEach(tool => { %>
- <%= tool %>
<% }) %>
```

### EJS Syntax Reference

| Syntax | Purpose | Example |
|--------|---------|---------|
| `<%= var %>` | Output escaped value | `<%= PROJECT_NAME %>` |
| `<%- var %>` | Output unescaped value | `<%- HTML_CONTENT %>` |
| `<% code %>` | Execute JavaScript | `<% if (condition) { %>` |

### Common Patterns

**Conditional sections:**
```ejs
<% if (USE_TYPESCRIPT) { %>
## TypeScript Setup
...
<% } %>
```

**Choice-based content:**
```ejs
<% if (FRAMEWORK === 'react') { %>
Use `useState` for local state.
<% } else if (FRAMEWORK === 'vue') { %>
Use `ref()` for reactive state.
<% } %>
```

**Iterating arrays:**
```ejs
<% LANGUAGES.forEach(lang => { %>
- <%= lang %>
<% }) %>
```

**Inline conditionals:**
```ejs
Use `<%= USE_TYPESCRIPT ? 'tsx' : 'jsx' %>` files.
```

## Step 5: Test with skillz build

Run `skillz build` to regenerate the default files using your default values:

```bash
skillz build ./my-skill/
```

This:
1. Reads variables from `skill.config.toml`
2. Uses the default values for each variable
3. Renders templates to root-level files
4. Overwrites existing `SKILL.md`, `scripts/`, etc.

Verify the output matches your expectations before committing.

## Step 6: Maintain Backwards Compatibility

After any template change:

1. Update the templates in `.skillz/`
2. Run `skillz build` to regenerate defaults
3. Commit both the templates AND the regenerated root files

This ensures:
- Users of Skillz CLI get customization
- Users of other CLIs get working defaults
- The skill works with any installation method

## Complete Example

### Original Skill

```
localization-skill/
├── SKILL.md
└── scripts/
    └── extract.sh
```

**SKILL.md:**
```markdown
---
name: localization-skill
description: Help with i18n in React projects
---

# Localization

## Translation Function

Use `t('key')` for translations.

## File Location

Translations are in `src/locales/`.
```

### Converted Skill

```
localization-skill/
├── SKILL.md                    # Regenerated default
├── scripts/
│   └── extract.sh              # Regenerated default
└── .skillz/
    ├── skill.config.toml
    ├── SKILL.md.ejs
    └── scripts/
        └── extract.sh.ejs
```

**.skillz/skill.config.toml:**
```toml
[meta]
name = "localization-skill"
version = "1.0.0"

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

[variables.T_FUNCTION]
type = "string"
prompt = "What is your translation function name?"
default = "t"

[variables.LOCALES_PATH]
type = "string"
prompt = "Where are your translation files?"
default = "src/locales"
```

**.skillz/SKILL.md.ejs:**
```ejs
---
name: localization-skill
description: Help with i18n in <%= FRAMEWORK %> projects
---

# Localization

## Translation Function

Use `<%= T_FUNCTION %>('key')` for translations.

<% if (FRAMEWORK === 'react') { %>
Import from your i18n setup:
\`\`\`tsx
import { useTranslation } from 'react-i18next';
const { <%= T_FUNCTION %> } = useTranslation();
\`\`\`
<% } else if (FRAMEWORK === 'vue') { %>
Use the composition API:
\`\`\`vue
import { useI18n } from 'vue-i18n';
const { <%= T_FUNCTION %> } = useI18n();
\`\`\`
<% } %>

## File Location

Translations are in `<%= LOCALES_PATH %>/`.
```

## Checklist

Before publishing your converted skill:

- [ ] All customizable content uses variables
- [ ] Default values produce a working skill
- [ ] `skillz build` generates correct output
- [ ] Root-level files are committed (for backwards compatibility)
- [ ] Variable prompts are clear and helpful
- [ ] Choice options cover common use cases
