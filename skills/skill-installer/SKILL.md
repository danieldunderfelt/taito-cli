---
name: skill-installer
description: Install Agent Skills with the Taito CLI. Use when the user asks to add, remove, or list skills, or when you need to install customizable skills with automatic, codebase-specific configuration.
---

# Skill Installer (Taito CLI)

Use this skill to install Agent Skills via the Taito CLI, even when Taito is not installed globally.

## Quick Start

```bash
taito add owner/repo
taito add owner/repo/path/to/skill
taito list
taito remove skill-name
```

If `taito` is not available, replace it with `npx taito`, `bunx taito`, `pnpx taito`, or `yarn dlx taito`.

## Standard Install Workflow

1. Identify the source (`owner/repo[/path]` and optional ref).
2. Decide the target agent or output directory.
3. Install with `taito add ...`, using `--agent` only when you want to override detection.

## Auto-Customize Workflow (Customizable Skills)

Use this when the repo contains `.taito/skill.config.toml` or the user expects project-specific defaults.

1. Fetch the skill config so you can inspect variable names and defaults.
2. Generate `answers.toml` by inferring values from the current codebase.
3. Install non-interactively:

```bash
taito add owner/repo/path --config ./answers.toml
```

4. Record the chosen values for future installs.

### Inference Heuristics (best evidence, then defaults)

- `PACKAGE_MANAGER`/`PKG_MANAGER`: lockfiles (`pnpm-lock.yaml`, `bun.lock`, `yarn.lock`, `package-lock.json`).
- `FRAMEWORK`/`UI_LIBRARY`: dependencies in `package.json` (react, next, vue, svelte, angular, etc).
- `USE_TYPESCRIPT`: `tsconfig.json` or `typescript` dependency.
- `SRC_DIR`/`SOURCE_DIR`: prefer `src/`, then `app/`, then `lib/`.
- `*_COMMAND` (lint/test/build): use `package.json` scripts; otherwise `<pm> run <script>`.
- Unknown variables: use defaults from `skill.config.toml`, otherwise the first choice option.

### Optional Helper Script

```bash
node scripts/infer-config.js --skill-config /path/to/skill.config.toml --repo-root /path/to/project --out ./answers.toml
```

## Guardrails

- For private repos, set `GITHUB_TOKEN`.
- Use `--dry-run` to preview changes when needed.
- If the skill is not customizable, skip the config step and install normally.

## References

- [TAITO-CLI.md](references/TAITO-CLI.md)
- [AUTO-CUSTOMIZATION.md](references/AUTO-CUSTOMIZATION.md)
