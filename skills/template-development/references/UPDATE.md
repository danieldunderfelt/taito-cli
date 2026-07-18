# Template Updates

## Project metadata

Every project created with `taito new project` gets `.taito/project.meta.toml`:

```toml
[project]
template = "project-template"
templatePath = "/Users/you/Work/project-template"
templateCommit = "abc123..."
createdAt = "2026-07-18T..."

[variables]
PROJECT_NAME = "acme"

[components]
architecture_docs = true
```

## Updating a project

```bash
cd my-project
taito update
```

Algorithm (git-backed, preserves local edits):

1. Resolve the registered template; optionally `git fetch` for GitHub-cached templates
2. If `HEAD` equals `templateCommit`, report up to date
3. **Collect new customizations** — compare current `template.config.toml` to answers in `project.meta.toml`. Prompt for any new `[variables.*]` / `[components.*]` (existing answers are kept and not re-asked). Then persist the merged answers back into meta.
4. Materialize the template at the **old** commit and the **new** commit using those merged variables/components
5. For each file:
   - Template unchanged → skip
   - User never edited (ours == base) → take new template version
   - Both changed → `git merge-file` three-way merge; on conflict, prompt
6. Write the new `templateCommit` (and updated variables/components)

This step is required so new EJS locals (e.g. a variable added after the project was created) are collected **before** render — otherwise update fails with a missing-variable render error.

Customizable skills are not silently re-customized on update. If the template gained new skills, add them with `taito add` as needed.

## Updating a child template

```bash
cd my-child-template
taito update
```

Runs `git merge` of the base tip into the child worktree, with interactive conflict resolution.

## Conflict choices

| Choice | Meaning |
|--------|---------|
| Ours | Keep the project / child version |
| Theirs | Take the new template / base version |
| Merged / markers | Keep the merge-file result (may include conflict markers) |
