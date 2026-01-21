---
name: customizable-skills
description: Create and manage Agent Skills with the Taito CLI. Use when writing SKILL.md files, making skills customizable, installing skills from GitHub, or converting standard skills to customizable ones. Covers the Agent Skills specification, EJS templates, and skill.config.toml format.
---

# Customizable Skills

This skill helps you work with Agent Skills and the Taito CLI. Use it when you need to:

- Write a new Agent Skill (SKILL.md)

- Install skills from GitHub using the Taito CLI

- Make an existing skill customizable

- Understand the Agent Skills specification

## Quick Reference

### Installing Skills

```bash
# Install from GitHub
taito add owner/repo

# Install for cursor
taito add owner/repo --agent cursor

# List installed skills
taito list

# Remove a skill
taito remove skill-name
```

### Skill Structure

A minimal skill is a folder with a `SKILL.md` file:

```
my-skill/
├── SKILL.md          # Required: instructions + metadata
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
└── assets/           # Optional: templates, resources
```

A customizable skill adds a `.taito/` folder:

```
my-skill/
├── SKILL.md          # Default output (for standard CLIs)
├── .taito/
│   ├── skill.config.toml   # Variable definitions
│   └── SKILL.md.ejs        # Template
```

## Detailed References

For comprehensive guidance, read the appropriate reference:

- [AUTHORING-SKILLS.md](references/AUTHORING-SKILLS.md) - How to write effective Agent Skills following the specification

- [CUSTOMIZABLE-SKILLS.md](references/CUSTOMIZABLE-SKILLS.md) - The `.taito/` format for project-specific customization

- [TAITO-CLI.md](references/TAITO-CLI.md) - Complete CLI command reference

- [CONVERTING-SKILLS.md](references/CONVERTING-SKILLS.md) - Step-by-step guide to make standard skills customizable

## SKILL.md Format

Every skill requires YAML frontmatter with `name` and `description`:

```markdown
---
name: my-skill
description: What this skill does and when to use it. Include keywords that help agents identify relevant tasks.
---

# My Skill

Instructions for the agent...
```

### Name Requirements

- 1-64 characters
- Lowercase letters, numbers, and hyphens only
- Must not start/end with hyphen
- Must match the parent directory name

### Description Best Practices

- Describe what the skill does AND when to use it
- Include specific keywords for task matching
- Keep under 1024 characters

Good: `Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction.`

Poor: `Helps with PDFs.`

## Your Skills Location

Skills for cursor are installed to: `.cursor/skills/`
