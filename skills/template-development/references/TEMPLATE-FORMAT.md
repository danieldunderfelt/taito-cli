# Template Format

## Requirements

1. The template directory **must be a git repository**.
2. It must contain `.taito/template.config.toml`.
3. Optional: `.taito/**/*.ejs` files that mirror the output tree (same pattern as customizable skills).

## `template.config.toml`

```toml
[meta]
name = "project-template"
version = "0.1.0"
description = "Agent-docs project scaffold"
# Optional — also recorded in the registry when using --extend
extends = "base-template"

[variables.PROJECT_NAME]
type = "string"
prompt = "Project name?"
default = "my-project"
validate = "^[a-z0-9-]+$"

[variables.USE_TYPESCRIPT]
type = "boolean"
prompt = "Using TypeScript?"
default = true

# Optional components — boolean include gates for paths and/or skills
[components.architecture_docs]
prompt = "Include architecture docs scaffold?"
default = true
paths = ["docs/architecture/**"]

[components.design_skills]
prompt = "Include design skills?"
default = true
skills = [
  ".agents/skills/design",
  ".agents/skills/design-taste-frontend",
]
```

### Variables

Same types as skills: `string`, `choice`, `boolean`, `array`.

- Prompts support `${OTHER_VAR}` interpolation.
- Preset answers: `taito new project -t name --config answers.toml`
- Component presets use a `[components]` table in the same file:

```toml
PROJECT_NAME = "acme"
USE_TYPESCRIPT = true

[components]
architecture_docs = true
design_skills = false
```

### Components

When a component is **false**, its `paths` (globs) and `skills` (relative skill dirs) are omitted from materialization.

Glob notes:

- `docs/**` matches `docs` and everything under it
- `docs/*.md` matches one segment only

### EJS customization points

Place templates under `.taito/` mirroring the project layout:

| Template | Output |
|----------|--------|
| `.taito/AGENT.md.ejs` | `AGENT.md` |
| `.taito/docs/PROJECT.md.ejs` | `docs/PROJECT.md` |

Use `<%= VAR %>`, `<% if (...) { %>`, etc. Locals are the variable values from config.

**Template mode vs skill mode:**

- Templates copy hidden files (`.gitignore`, `.agents`, …) except `.git` and `.taito`
- Skills skip most hidden files (existing skill installer behavior)
- Customizable skill packages inside a template are deferred to the skill customizer

### Defaults for browsing

Keep non-EJS root files as sensible defaults. After editing EJS files, run:

```bash
taito build
```

in the template directory to regenerate default files from templates (variable defaults only; components are not applied during `build`).

## Converting an existing repo

Example: `~/Work/project-template`

1. Ensure it is a git repo with a clean commit history you care about.
2. Add `.taito/template.config.toml` with at least `[meta].name`.
3. Optionally move customization points into `.taito/*.ejs`.
4. Register: `taito add ~/Work/project-template`
5. Try: `taito new project /tmp/demo -t project-template`
