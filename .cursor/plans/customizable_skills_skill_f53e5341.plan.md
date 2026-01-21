---
name: Customizable Skills Skill
overview: Create an Agent Skill that teaches agents about customizable skills, how to use the taito CLI, and how to author skills. The skill itself will be customizable, demonstrating the concepts it teaches.
todos:
  - id: create-structure
    content: Create skills/customizable-skills/ directory structure
    status: completed
  - id: write-skill-md
    content: Write SKILL.md with frontmatter and light overview
    status: completed
  - id: write-authoring-ref
    content: Write references/AUTHORING-SKILLS.md with spec-based guidance
    status: completed
  - id: write-customizable-ref
    content: Write references/CUSTOMIZABLE-SKILLS.md explaining the format
    status: completed
  - id: write-cli-ref
    content: Write references/taito-CLI.md with command documentation
    status: completed
  - id: write-converting-ref
    content: Write references/CONVERTING-SKILLS.md with step-by-step guide
    status: completed
  - id: create-config
    content: Create .taito/skill.config.toml with variable definitions
    status: completed
  - id: create-templates
    content: Create .taito/SKILL.md.ejs and other templates
    status: completed
  - id: build-defaults
    content: Run taito build to ensure root files are generated correctly
    status: completed
isProject: false
---

# Customizable Skills Skill Implementation

## Overview

Create a new skill at `skills/customizable-skills/` that serves as both documentation and a working example. The skill will have a light `SKILL.md` that links to detailed references, and a `.taito/` folder making it customizable.

## Skill Purpose

This skill helps agents:

- Understand what customizable skills are and how they differ from standard skills
- Install skills using the taito CLI
- Make existing standard skills customizable
- Author new skills following the Agent Skills specification

## Directory Structure

```
skills/
└── customizable-skills/
    ├── SKILL.md                           # Light overview, links to references
    ├── references/
    │   ├── AUTHORING-SKILLS.md            # How to write skills (spec-based)
    │   ├── CUSTOMIZABLE-SKILLS.md         # What makes skills customizable
    │   ├── taito-CLI.md                  # CLI usage and commands
    │   └── CONVERTING-SKILLS.md           # Making standard skills customizable
    └── .taito/
        ├── skill.config.toml              # Variable definitions
        ├── SKILL.md.ejs                   # Template for SKILL.md
        └── references/
            └── taito-CLI.md.ejs          # Template for CLI reference
```

## Customization Variables

Since this is a skill about skills, sensible customization options include:

| Variable           | Type   | Purpose                                                       |
| ------------------ | ------ | ------------------------------------------------------------- |
| `PREFERRED_AGENT`  | choice | Default agent examples (cursor, windsurf, claude-code, etc.)  |
| `SKILLS_DIRECTORY` | string | Custom skills directory path for examples                     |
| `FOCUS_AREAS`      | array  | Which topics to emphasize (authoring, installing, converting) |

## File Contents

### 1. `SKILL.md` (Light, ~100 lines)

Frontmatter:

- name: `customizable-skills`
- description: Keywords covering all use cases (writing skills, taito CLI, customization, SKILL.md, etc.)

Body sections:

- When to use this skill (brief)
- Quick reference to CLI commands
- Links to detailed references for each topic

### 2. `references/AUTHORING-SKILLS.md`

Based on [agentskills.io/specification](https://agentskills.io/specification):

- SKILL.md format (frontmatter fields, body content)
- Name/description requirements and best practices
- Optional directories (scripts/, references/, assets/)
- Progressive disclosure principles
- Examples of good vs poor descriptions

### 3. `references/CUSTOMIZABLE-SKILLS.md`

Based on [README.md](README.md):

- What makes a skill customizable (`.taito/` folder)
- The `skill.config.toml` format
- Variable types (string, choice, boolean, array)
- EJS template syntax
- How customizable skills remain backwards compatible

### 4. `references/taito-CLI.md`

CLI command reference:

- `taito add` - installation from GitHub/local
- `taito list` - viewing installed skills
- `taito remove` - removing skills
- `taito build` - regenerating defaults from templates
- Multi-agent support and detection
- Private repositories and authentication

### 5. `references/CONVERTING-SKILLS.md`

Step-by-step guide:

- Identifying what to make customizable
- Creating the `.taito/` folder structure
- Writing `skill.config.toml`
- Converting static content to EJS templates
- Testing with `taito build`
- Maintaining backwards compatibility

### 6. `.taito/skill.config.toml`

```toml
[meta]
name = "customizable-skills"
version = "1.0.0"

[variables.PREFERRED_AGENT]
type = "choice"
prompt = "Which AI agent do you primarily use?"
default = "cursor"
  [[variables.PREFERRED_AGENT.options]]
  value = "cursor"
  label = "Cursor"
  # ... other agents

[variables.SKILLS_DIRECTORY]
type = "string"
prompt = "Where do you store your skills?"
default = ".cursor/skills"

[variables.FOCUS_AREAS]
type = "array"
prompt = "Which topics should be emphasized? (comma-separated)"
default = ["authoring", "installing", "converting"]
```

### 7. Templates

- `.taito/SKILL.md.ejs` - Adjusts examples and paths based on preferred agent
- `.taito/references/taito-CLI.md.ejs` - Shows commands with correct agent flags and paths

## Key Content Sources

- Agent Skills specification: [agentskills.io/specification](https://agentskills.io/specification)
- taito CLI documentation: [README.md](README.md)
- Variable types and config format: [src/types.ts](src/types.ts)
- Installation workflow: [src/commands/add.ts](src/commands/add.ts)

## Implementation Notes

- Keep `SKILL.md` under 500 lines per the spec's progressive disclosure guidance
- Reference files should be focused and standalone
- Use relative paths for file references
- Include concrete examples in each reference file
- The skill should work both as a standard skill (root files) and customizable skill (via .taito/)
