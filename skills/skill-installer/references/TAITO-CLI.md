# Taito CLI Reference (Skill Installer)

This reference focuses on installing skills with the Taito CLI.

## Prefer local `taito`, fall back to one-off runner

```bash
taito add owner/repo
npx taito add owner/repo
bunx taito add owner/repo
pnpx taito add owner/repo
yarn dlx taito add owner/repo
```

## Install

```bash
# Install from GitHub
taito add owner/repo

# Install a specific skill from a multi-skill repo
taito add owner/repo/path/to/skill

# Force a specific agent (case-insensitive key)
taito add owner/repo --agent cursor

# Install with preset answers (non-interactive)
taito add owner/repo --config ./answers.toml

# Install to a custom output directory
taito add owner/repo --output ./custom/path

# Preview without writing
taito add owner/repo --dry-run

# Install from a specific git ref
taito add owner/repo --ref main
```

## List

```bash
taito list
```

## Remove

```bash
taito remove skill-name
```

## Notes

- Customizable skills include `.taito/skill.config.toml` and use templates for output.
- Standard skills just copy `SKILL.md`, `scripts/`, `references/`, `assets/`, and `rules/`.
- For private repos, set `GITHUB_TOKEN`.
