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
3. Materialize the template at the **old** commit and the **new** commit using the same variables/components
4. For each file:
   - Template unchanged → skip
   - User never edited (ours == base) → take new template version
   - Both changed → `git merge-file` three-way merge; on conflict, prompt
5. Write the new `templateCommit`

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
