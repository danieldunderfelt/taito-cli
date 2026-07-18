# `taito apply` CLI Reference

Apply a registered template onto an existing project, file-by-file.

## `taito apply plan [path] -t <template>`

Compare the rendered template to the project.

```bash
taito apply plan -t project-template --json
taito apply plan . -t project-template -c answers.toml --json
```

JSON fields of interest:

```json
{
  "template": "project-template",
  "templateCommit": "...",
  "projectPath": "...",
  "variables": {},
  "components": {},
  "files": [
    {
      "path": "docs/PROJECT.md",
      "status": "differs",
      "hint": "merge",
      "templateBytes": 120,
      "projectBytes": 8000,
      "projectRicher": true
    }
  ],
  "skills": [
    {
      "name": "design",
      "relativePath": ".agents/skills/design",
      "customizable": false,
      "status": "missing",
      "templatePath": "/abs/path/..."
    }
  ],
  "summary": {
    "missing": 3,
    "identical": 10,
    "differs": 2,
    "skillsMissing": 1,
    "skillsPresent": 4
  }
}
```

With `--json`, customization uses defaults (or `-c` answers) — no interactive prompts.

## `taito apply cat -t <template> --file <path>`

Print the **rendered** template content for one relative path (after variables/components).

```bash
taito apply cat -t project-template --file CLAUDE.md
taito apply cat -t project-template --file docs/PROJECT.md --json
```

## `taito apply write [path] -t <template> --file <path>`

Write one rendered file into the project.

- Refuses to overwrite differing content unless `--force`
- Safe for `status: missing`

```bash
taito apply write -t project-template --file docs/architecture/.gitkeep --json
taito apply write -t project-template --file README.md --force   # dangerous
```

## `taito apply skill [path] -t <template> --skill <name>`

Install one skill from the template (runs the normal skill customizer when applicable).

```bash
taito apply skill -t project-template --skill design
taito apply skill -t project-template --skill design --force --agent cursor
```

## `taito apply finalize [path] -t <template>`

Write `.taito/project.meta.toml` so `taito update` works afterward. Also writes `.taito/apply-answers.toml` with the variables/components used.

```bash
taito apply finalize -t project-template --json
taito apply finalize -t project-template -c answers.toml --force
```

## Relationship to other commands

| Command | Use when |
|---------|----------|
| `taito new project` | Greenfield / empty destination |
| `taito apply *` | Existing project with content to preserve |
| `taito update` | Already has `project.meta.toml`; pull template changes |
