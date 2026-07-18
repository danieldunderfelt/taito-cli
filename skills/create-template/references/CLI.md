# `taito template` CLI

## `taito template scan [path]`

Returns a **baseline** of common agent/config files found in the project, plus exclusion info. It does **not** invent a full template inventory — the agent discovers the rest from the user’s request.

```bash
taito template scan
taito template scan . --json
taito template scan . --out-manifest ./baseline-manifest.json
```

JSON shape (abridged):

```json
{
  "sourcePath": "/path/to/project",
  "candidates": [
    {
      "path": "CLAUDE.md",
      "category": "agent_docs",
      "reason": "Claude agent doc",
      "bytes": 1200
    }
  ],
  "excluded": [{ "path": ".env", "reason": "env/secrets" }],
  "exclusionPatterns": {
    "directories": ["node_modules", ".git", "dist", "..."],
    "files": [".env", ".env.*", "bun.lock", "..."]
  },
  "summary": { "total": 12, "excludedSample": 3 }
}
```

Baseline categories: `agent_docs`, `skills`, `lint_format`, `typescript`, `git`, `license`, `editor`.

Not scanned (agent must discover if needed): docs, scripts, CI, README, app source, etc.

## `taito template init <dest>`

Copy selected files into a new template git repo with `.taito/template.config.toml`.

```bash
taito template init ~/Work/my-template --manifest ./manifest.json --json
taito template init ~/Work/my-template --from . --include CLAUDE.md,tsconfig.json,.gitignore
taito template init ~/Work/my-template --baseline   # baseline only; prefer a full agent-built manifest
```

| Flag | Meaning |
|------|---------|
| `--from <path>` | Source project (default `.`) |
| `--manifest <path>` | JSON `{ "files": [...], "name"?, "description"? }` |
| `--include <paths>` | Comma-separated paths (repeatable) |
| `--baseline` | Only files from `template scan` |
| `--name` / `--description` | Meta |
| `--force` | Allow non-empty dest |
| `--json` | Machine-readable result |

After init: generalize → `taito add <dest>` → apply back with `taito apply`.
