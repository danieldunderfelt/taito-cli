# Auto-Customization Playbook

Use this when a skill is customizable and you need to install it non-interactively.

## 1) Locate the skill config

You need the `.taito/skill.config.toml` file for the skill.

### Local repo

```
/path/to/skill/.taito/skill.config.toml
```

### GitHub (raw file)

```
https://raw.githubusercontent.com/OWNER/REPO/REF/PATH/.taito/skill.config.toml
```

Notes:
- Use the exact `PATH` when installing from a multi-skill repo.
- If no ref is provided, default to the repo's default branch.

## 2) Generate answers.toml

Fill every variable in `skill.config.toml`. If you cannot infer a value, use the default or the first choice option.

### Optional helper script

```bash
node scripts/infer-config.js --skill-config /path/to/skill.config.toml --repo-root /path/to/project --out ./answers.toml
```

### Manual template

```toml
PACKAGE_MANAGER = "pnpm"
FRAMEWORK = "react"
USE_TYPESCRIPT = true
SRC_DIR = "src"
LINT_COMMAND = "pnpm run lint"
```

## 3) Install non-interactively

```bash
taito add owner/repo/path --config ./answers.toml
```

## Heuristic hints

- Prefer lockfiles over guesswork for package manager.
- Use `package.json` dependencies to infer frameworks and tools.
- Use `tsconfig.json` to detect TypeScript.
- If unsure, keep defaults to avoid breaking the template.
