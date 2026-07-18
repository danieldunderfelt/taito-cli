---
name: apply-template
description: Apply a Taito project template onto an existing codebase. Use when the user wants to bring an existing project in line with a registered taito template while preserving project-specific content, merge CLAUDE.md/AGENT.md/docs carefully, install template skills, and leave the project ready for `taito update`.
---

# Apply Template

Bring an **existing project** up to a registered Taito template without wiping project-specific work. Prefer careful merges over overwrites. When finished, the project must have `.taito/project.meta.toml` so later `taito update` behaves like a project created with `taito new project`.

## When to use

- User asks to apply / adopt / align with a taito template on a repo that already has code
- Template has stubs (e.g. `docs/PROJECT.md`) but the project already has rich versions
- Need to merge agent docs (`CLAUDE.md`, `AGENT.md`) rather than replace them
- Want one-by-one control instead of `taito new project` into a non-empty folder

## Prerequisites

```bash
# Template must be registered
taito list
# If needed:
taito add [path to template]
# or
taito add owner/template-repo
```

Optional answers file for non-interactive customization:

```toml
# .taito-answers.toml (example)
PROJECT_NAME = "my-app"

[components]
architecture_docs = true
```

## Agent workflow (required order)

Work from the **project root**. Use `--json` so you can parse results. Do **not** bulk-overwrite differing files.

### 1. Plan

```bash
taito apply plan -t <template> --json
# with answers:
taito apply plan -t <template> -c .taito-answers.toml --json
```

Inspect:

- `files[].status`: `missing` | `identical` | `differs`
- `files[].hint`: `write` | `skip` | `merge`
- `files[].projectRicher`: project content is substantially larger than the template (almost always **merge**, never overwrite)
- `skills[]`: template skills and whether they already exist in the project

### 2. Missing files → write

For each file with `status: "missing"` and `hint: "write"`:

```bash
taito apply write -t <template> --file <path> --json
```

These are safe additions (template brings something the project lacks).

### 3. Identical files → skip

No action. Already aligned.

### 4. Differing files → merge carefully (never blind overwrite)

For each file with `status: "differs"`:

```bash
taito apply cat -t <template> --file <path>
```

Then **edit the project file yourself** (read current project file + template content). Follow [references/MERGE-GUIDE.md](references/MERGE-GUIDE.md).

**Hard rules:**

- If `projectRicher` is true → preserve project content; only fold in genuinely new structure/sections from the template
- Stub templates (short `docs/PROJECT.md`, placeholder READMEs) must **not** replace filled-in project docs
- For `CLAUDE.md` / `AGENT.md` / routing docs: merge — keep project-specific rules, update overlapping guidance, add new relevant sections from the template
- Do **not** run `taito apply write --force` on richer project files unless the user explicitly demands a full replace

### 5. Skills

For each skill with `status: "missing"`:

```bash
# Customizable skills will prompt (or use -c answers)
taito apply skill -t <template> --skill <name>
# Already present and you need to refresh:
taito apply skill -t <template> --skill <name> --force
```

If a skill is `present`, skip unless the user wants a refresh. Prefer not to clobber customized skills.

### 6. Finalize (mandatory)

```bash
taito apply finalize -t <template> --json
# or with the same answers used during plan/write:
taito apply finalize -t <template> -c .taito-answers.toml --json
```

This writes `.taito/project.meta.toml` (and `.taito/apply-answers.toml`). After this, `taito update` works the same as for a `taito new project` project.

## Success criteria

- [ ] Plan reviewed; missing files written
- [ ] Differing files merged with project-specific content preserved
- [ ] Needed skills installed
- [ ] `taito apply finalize` completed
- [ ] `.taito/project.meta.toml` exists
- [ ] User can run `taito update` later for template drift

## CLI cheat sheet

| Command | Purpose |
|---------|---------|
| `taito apply plan -t NAME --json` | Full inventory + statuses |
| `taito apply cat -t NAME --file PATH` | Rendered template file content |
| `taito apply write -t NAME --file PATH` | Add missing file (no overwrite) |
| `taito apply write -t NAME --file PATH --force` | Overwrite (avoid unless asked) |
| `taito apply skill -t NAME --skill SKILL` | Install one template skill |
| `taito apply finalize -t NAME` | Record origin for `taito update` |

## Anti-patterns

- Running `taito new project` into a filled repo and accepting mass overwrites
- `apply write --force` on every `differs` file
- Replacing a long `docs/PROJECT.md` with a template stub
- Forgetting `finalize` (breaks future `taito update`)
- Silently re-customizing skills the project already tuned
