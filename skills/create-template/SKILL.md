---
name: create-template
description: Create a Taito project template from the current codebase. Use when the user wants to extract reusable scaffolding into a new template, steered by their description of what the template should contain. Discover files in the project yourself, confirm the list with the user, generalize, register with taito, and apply the template back to the source project.
---

# Create Template

Extract a **Taito project template** from the current project based on what the user asked for. You (the agent) own file discovery. `taito template scan` only helps with a **small baseline** of common agent/config files and a list of **exclusions** — it is not the inventory of the template.

Use **template-development** for `.taito/template.config.toml` + EJS, and **apply-template** for the final apply-back step.

## When to use

- “Make a template from this repo”
- “Turn our agent setup into reusable boilerplate”
- User describes what the template should include (e.g. “docs + design skills”, “lint + tsconfig only”)

## Inputs to gather

1. **What the template should be** — the user’s description steers *your* exploration (not a CLI flag)
2. **Destination path** (e.g. `~/Work/my-app-template`)
3. **Template name** (defaults to destination folder name)

## Workflow (do in order)

### 1. Understand the request, then explore the project

Read the user’s template description. Explore the repo yourself (tree, globs, reading key files) and draft a candidate include list that matches that request.

Examples of how intent steers *you*:

- “agent docs and design skills” → `CLAUDE.md` / `AGENTS.md` / `AGENT.md`, selected skill dirs, maybe cursor rules
- “lint + typescript baseline” → eslint/prettier/biome, `tsconfig*.json`, `.editorconfig`, `.gitignore`
- “docs scaffold” → `docs/**` structure you choose to stub — **scan will not list these**; you must find them

### 2. Optional: baseline scan + exclusions

```bash
taito template scan . --json
```

Use this for:

- A short list of **common** agent/config files already present
- `exclusionPatterns` / `excluded` — never copy secrets, lockfiles, `node_modules`, build output, `.taito` project meta

Do **not** treat the scan result as the full template. Merge baseline hits with files you discovered from the user’s request.

### 3. Ask the user what to include

Present a clear proposed list (grouped however helps). Mark what came from baseline vs your discovery. Get explicit include/exclude approval (or “use your proposal as-is”).

### 4. Write manifest → init

```json
{
  "name": "my-template",
  "description": "Short description matching the user request",
  "files": ["CLAUDE.md", "tsconfig.json", "docs/PROJECT.md", "..."]
}
```

Include **entire skill packages** when a skill is selected (all files under that skill dir).

```bash
taito template init ~/Work/my-template --from . --manifest ./manifest.json --json
```

### 5. Generalize (required)

In the template dir: stub project-specific docs, parameterize agent docs, keep generic configs, customize skills if needed. See [references/GENERALIZE.md](references/GENERALIZE.md) and **template-development**.

```bash
taito build   # after adding EJS
git add -A && git commit -m "Generalize template"
```

### 6. Register

```bash
taito add ~/Work/my-template
```

### 7. Apply back

In the **source project**, follow **apply-template**:

```bash
taito apply plan -t <template-name> --json
# write missing; merge differs carefully
taito apply finalize -t <template-name>
```

## Success criteria

- [ ] File list driven by the user’s template description + your exploration
- [ ] User approved includes/excludes
- [ ] Exclusions respected (no secrets/lockfiles/build artifacts)
- [ ] Template generalized and registered
- [ ] Source project finalized for `taito update`

## CLI cheat sheet

| Command | Purpose |
|---------|---------|
| `taito template scan --json` | Baseline common files + exclusions only |
| `taito template init <dest> --manifest file.json` | Copy approved files into a new template |
| `taito add <dest>` | Register |
| `taito apply …` | Apply back |

## Anti-patterns

- Using only `template scan` output as the whole template
- Copying `src/` app code unless the user explicitly asked
- Shipping rich production docs instead of stubs
- Skipping user confirmation of the file list
- Forgetting apply-back / finalize
