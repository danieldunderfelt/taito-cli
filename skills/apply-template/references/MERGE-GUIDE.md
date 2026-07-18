# Merge Guide for Template Apply

When `taito apply plan` reports `status: "differs"`, treat the project file as the source of truth for project-specific knowledge, and the template file as a **proposal** of structure and defaults.

## Decision tree

1. **`projectRicher: true`** (or project file is clearly filled-in vs a stub)  
   → **Merge into the project file.** Never replace wholesale.

2. **Project file is empty / TODO-only / clearly abandoned stub**  
   → You may replace with the template version (or `taito apply write --force` after confirming).

3. **Both are substantial and divergent**  
   → Merge: keep project facts, adopt useful new sections/commands/conventions from the template.

4. **Binary or generated files**  
   → Prefer project version unless the user wants the template artifact.

## File-type guidance

### `docs/PROJECT.md` (and similar project docs)

- Keep all real project description, goals, links, and status.
- If the template adds sections the project lacks (e.g. “Architecture index”, “Running”), add those headings and minimal scaffolding **without** deleting existing prose.
- If the template is a short stub and the project has pages of content → **keep the project file unchanged** (or only add a missing section pointer).

### `CLAUDE.md` / `AGENT.md` / agent routing docs

These often encode project-specific workflow. Merge like this:

1. Read both versions fully.
2. Keep project-specific paths, commands, product names, and local conventions.
3. Update sections that describe the same concern when the template has clearer or newer guidance (note what you changed).
4. Append genuinely new template sections that are relevant (e.g. new docs layout rules, diary conventions) if the project doesn’t already cover them.
5. Deduplicate overlapping instructions; prefer one clear rule.

Do **not** reset the file to the template’s generic “Concept = TBD” style content when the project already defines the concept.

### Config / tooling files (`.gitignore`, formatter configs, etc.)

- Union useful entries (e.g. add missing ignore patterns).
- Don’t remove project-only ignores or settings.
- Prefer additive edits; call out risky changes to the user.

### Skills (under `.agents/skills`, `.claude/skills`, etc.)

- Prefer `taito apply skill` for install/customize rather than hand-copying.
- If a skill already exists and was customized, leave it unless the user asks to refresh.

## After merging

No extra CLI step is required for merged files. Just ensure you still run:

```bash
taito apply finalize -t <template>
```

so `.taito/project.meta.toml` records the template commit. Future `taito update` will three-way-merge using that commit as the base — project-edited files are preserved when the template side didn’t change, and only conflict when both sides changed.

## Examples

### Stub vs rich PROJECT.md

| Template | Project | Action |
|----------|---------|--------|
| 10-line stub with TBD | Long project overview | **Keep project**; optionally add any missing heading the template introduces |
| New “Running” section | No running docs | **Add** a Running section inspired by the template |
| Identical structure, same text | Same | Skip (`identical`) |

### CLAUDE.md

| Template adds | Project has | Action |
|---------------|-------------|--------|
| Docs routing to `docs/architecture/` | Different but coherent routing | Keep project routing; adopt template only if migrating to that layout |
| Diary convention `docs/development/YYYY-MM-DD.md` | No diary | Add diary convention |
| Generic “Concept = TBD” | Real product concept | Keep project concept |
