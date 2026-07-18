# Generalizing Extracted Template Files

After `taito template init`, the template still contains **source-project DNA**. Clean it before registering.

## Goals

1. Another team can run `taito new project -t <name>` and get useful scaffolding.
2. Applying back to the source project does not destroy rich project docs (stubs in the template + apply-template merge rules).
3. Customization points exist where names/paths/options legitimately vary.

## By file kind

### Agent docs (`CLAUDE.md`, `AGENTS.md`, `AGENT.md`)

- Keep: routing rules, docs layout conventions, skill usage patterns.
- Remove/replace: product codenames, internal URLs, “we use X at Acme” facts.
- Parameterize: project display name → `PROJECT_NAME` via `.taito/CLAUDE.md.ejs` (etc.).
- Leave a short “Concept” / overview section as a placeholder for new projects.

### Docs (`docs/**`)

- `PROJECT.md`: almost always **stub** — title, purpose TBD, links to architecture/running placeholders.
- `architecture/`, `development/`: keep directory structure (`.gitkeep` or short README); wipe diary entries and design decisions that are source-specific.
- Prefer headings + one-line guidance over paragraphs of status updates.

### Skills

- Include complete skill directories when selected.
- If a skill hardcodes the source project’s paths/stack, add `.taito/skill.config.toml` + EJS (customizable skill).
- Deduplicate copies across `.agents/skills` and `.claude/skills` if they are identical — pick the layout your template wants as default (or keep both if that is the convention).

### Lint / format / tsconfig / `.gitignore`

- Usually **keep** with light edits (remove path entries that only exist in the source app).
- Don’t embed absolute paths.

### License

- Keep if the template should ship that license; otherwise omit or replace with a placeholder note in template README.

### Scripts / CI

- Only keep scripts that are truly reusable.
- CI workflows: parameterize package names and secrets; or leave out unless the user asked for CI in the intent.

## `template.config.toml` checklist

- `[meta].name` / `description` accurate
- `[variables.PROJECT_NAME]` (and any others you introduced)
- `[components.*]` for optional docs and skill groups
- Matching `.taito/**/*.ejs` for every parameterized output file
- Run `taito build` so root defaults stay coherent for non-EJS browsing

## Apply-back note

The source project will often have **richer** versions of stubbed docs. That is correct. `taito apply` should merge/preserve them; `finalize` still records the template origin for future updates.
