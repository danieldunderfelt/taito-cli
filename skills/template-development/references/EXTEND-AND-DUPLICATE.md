# Extend and Duplicate

## Duplicate

```bash
taito add ~/Work/my-variant --duplicate project-template
taito add ~/Work/my-variant --duplicate project-template --name my-variant
```

What happens:

1. Copies the source template tree to the destination (**excluding** `.git`)
2. Runs `git init` and creates an initial commit
3. Registers the destination as a new template

Use duplicate when the new template should diverge freely and not stay tied to the base git history.

## Extend

```bash
taito add ~/Work/my-child --extend project-template
taito add ~/Work/my-child --extend project-template --name my-child
```

What happens:

1. Creates branch `taito/<name>` on the **base** template repository
2. Adds a **git worktree** at the destination checked out to that branch
3. Registers the child with `extends = <base>` and `branch = taito/<name>`

The child shares object storage with the base. Commits on the child branch are your modifications (extra files, `.taito` overrides, etc.).

### Updating a child

From the child template directory:

```bash
taito update
```

Taito merges the current tip of the base into the child worktree. Conflicts are resolved interactively (ours / theirs / leave markers).

## Naming

- Default name = destination folder name
- Override with `--name`
- `--force` replaces an existing registration of the same name
