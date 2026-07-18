# Template Runtime Behavior

Invariants for how Taito materializes templates. Do **not** open the `taito-cli` source to rediscover these — this file is the contract.

## What gets rendered

| Input | Effect at materialize time |
|-------|----------------------------|
| `[variables.*]` + matching `.taito/**/*.ejs` | EJS renders with those variables as locals; output replaces the mirrored file |
| `[variables.*]` **without** a matching `.ejs` | Values are stored in `.taito/project.meta.toml` (and used as defaults later). **No project file content changes** |
| `[components.*]` | Include/exclude only: globs in `paths` and skill dirs in `skills` are omitted when the component is `false` |
| Root files without `.taito/<same>.ejs` | Copied as-is (sensible defaults for browsing / `taito build` output) |

`taito build` regenerates non-EJS defaults from `.ejs` using **variable defaults only**. Components are **not** applied during `build`.

## Prompt vs defaults

| Command | Prompts for variables/components? | Values used |
|---------|-----------------------------------|-------------|
| `taito new project -t …` (no `-c`) | **Yes** | Interactive answers |
| `taito new project -t … -c answers.toml` | **No** | File + config defaults |
| `taito apply plan -t …` (no `--json`, no `-c`) | **Yes** | Interactive answers |
| `taito apply plan -t … --json` | **No** | Config defaults only |
| `taito apply plan -t … -c answers.toml` | **No** | File + config defaults |
| `taito apply cat` / `write` / `finalize` | **No** | Defaults, or `-c` if provided |
| `taito apply skill` (customizable) | May prompt for **skill** vars | Separate from template vars; use skill `-c` if needed |

**Agent rule:** `--json` means non-interactive. Before any `apply … --json` / `cat` / `write` / `finalize`, collect real answers from the user and pass `-c answers.toml`. Bare `--json` will look like “customization did nothing” when defaults (e.g. `PROJECT_NAME = "my-project"`) are what you see.

For the full apply workflow (plan → merge → finalize), follow the **apply-template** skill — not this file alone.

## EJS locals (hard rule)

```ejs
<%# OK — PROJECT_NAME is a [variables.*] key %>
<%= PROJECT_NAME %>
<% if (USE_TYPESCRIPT) { %>…

<%# WRONG — components are NOT locals %>
<% if (architecture_docs) { %>…
```

- Locals = keys from `[variables.*]` only (after `${…}` interpolation in defaults/prompts).
- Component names never appear in EJS. Gate optional **file content** with a boolean **variable**; gate optional **trees/skills** with a **component**.

## Apply vs `new project`

| | `taito new project` | `taito apply …` |
|---|---------------------|-----------------|
| Target | Empty (or force) destination | Existing project tree |
| Flow | One-shot materialize + skill install + `project.meta.toml` | File-by-file plan/write/merge; finalize writes meta |
| Prompts | Yes unless `-c` | Only interactive `apply plan` without `--json`/`-c` |
| Skills | Installed after materialize | `taito apply skill` per skill |

## Updates (summary)

- **Projects** (`.taito/project.meta.toml`): re-render old commit vs new commit with stored variables/components; three-way `git merge-file` into the project.
- **Child templates** (`extends` / `--extend`): `git merge` of the base tip into the child worktree.

Details: [UPDATE.md](UPDATE.md).

## Debugging checklist

1. Symptom: output still shows defaults → were you on `--json` / `cat` / `write` without `-c`?
2. Symptom: variable in TOML but file unchanged → is there a `.taito/<path>.ejs`? If not, only meta/defaults change.
3. Symptom: `<% if (componentName) %>` never toggles → use a boolean variable, or exclude via `[components.*.paths]`.
4. After any EJS/config edit: `taito build`, then smoke with answers + `taito apply cat -t <name> -c answers.toml --file <path>`.
