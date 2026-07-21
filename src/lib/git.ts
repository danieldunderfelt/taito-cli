import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { $ } from 'bun'

export class GitError extends Error {
  constructor(
    message: string,
    readonly stderr?: string
  ) {
    super(message)
    this.name = 'GitError'
  }
}

async function runGit(
  args: string[],
  cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = cwd
    ? $`git ${args}`.cwd(cwd).quiet().nothrow()
    : $`git ${args}`.quiet().nothrow()
  const result = await proc
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  }
}

export async function isGitRepo(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return false
  const { exitCode } = await runGit(
    ['rev-parse', '--is-inside-work-tree'],
    dir
  )
  return exitCode === 0
}

export async function revParse(
  dir: string,
  ref: string = 'HEAD'
): Promise<string> {
  const { stdout, stderr, exitCode } = await runGit(
    ['rev-parse', ref],
    dir
  )
  if (exitCode !== 0) {
    throw new GitError(`Failed to resolve ref ${ref}`, stderr)
  }
  return stdout
}

export async function getCurrentBranch(dir: string): Promise<string> {
  const { stdout, stderr, exitCode } = await runGit(
    ['branch', '--show-current'],
    dir
  )
  if (exitCode !== 0) {
    throw new GitError('Failed to get current branch', stderr)
  }
  return stdout
}

export async function cloneRepo(
  url: string,
  dest: string,
  ref?: string
): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })
  const args = ['clone']
  if (ref) {
    args.push('--branch', ref)
  }
  args.push(url, dest)
  const { stderr, exitCode } = await runGit(args)
  if (exitCode !== 0) {
    throw new GitError(`Failed to clone ${url}`, stderr)
  }
}

export async function initRepo(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true })
  const { stderr, exitCode } = await runGit(['init'], dir)
  if (exitCode !== 0) {
    throw new GitError(`Failed to init git repo in ${dir}`, stderr)
  }
}

export async function addAllAndCommit(
  dir: string,
  message: string
): Promise<void> {
  let result = await runGit(['add', '-A'], dir)
  if (result.exitCode !== 0) {
    throw new GitError('Failed to git add', result.stderr)
  }

  // Prefer the user's git identity; fall back so taito-created commits always work
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? 'taito',
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? 'taito@localhost',
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? 'taito',
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? 'taito@localhost',
  }

  const proc = $`git commit -m ${message} --allow-empty`
    .cwd(dir)
    .env(env)
    .quiet()
    .nothrow()
  const commitResult = await proc
  if (commitResult.exitCode !== 0) {
    throw new GitError(
      'Failed to git commit',
      commitResult.stderr.toString().trim()
    )
  }
}

export async function createBranch(
  dir: string,
  branch: string,
  startPoint?: string
): Promise<void> {
  const args = ['branch', branch]
  if (startPoint) args.push(startPoint)
  const { stderr, exitCode } = await runGit(args, dir)
  if (exitCode !== 0) {
    throw new GitError(`Failed to create branch ${branch}`, stderr)
  }
}

export async function worktreeAdd(
  repoDir: string,
  dest: string,
  branch: string,
  options?: { createBranch?: boolean; startPoint?: string }
): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })
  const args = ['worktree', 'add']
  if (options?.createBranch) {
    args.push('-b', branch)
    args.push(dest)
    if (options.startPoint) {
      args.push(options.startPoint)
    }
  } else {
    args.push(dest, branch)
  }
  const { stderr, exitCode } = await runGit(args, repoDir)
  if (exitCode !== 0) {
    throw new GitError(
      `Failed to add worktree at ${dest} for branch ${branch}`,
      stderr
    )
  }
}

export async function mergeBranch(
  dir: string,
  branch: string
): Promise<{ conflicts: string[] }> {
  const { stdout, stderr, exitCode } = await runGit(['merge', branch], dir)
  if (exitCode === 0) {
    return { conflicts: [] }
  }

  const conflictResult = await runGit(
    ['diff', '--name-only', '--diff-filter=U'],
    dir
  )
  const conflicts = conflictResult.stdout
    ? conflictResult.stdout.split('\n').filter(Boolean)
    : []

  if (conflicts.length === 0) {
    throw new GitError(`Merge failed: ${stderr || stdout}`, stderr)
  }

  return { conflicts }
}

export async function abortMerge(dir: string): Promise<void> {
  await runGit(['merge', '--abort'], dir)
}

/**
 * Preview a merge of `theirs` into HEAD without touching the working tree
 * (git merge-tree). Returns the files that would conflict.
 */
export async function mergeTreeDryRun(
  dir: string,
  theirs: string
): Promise<{ clean: boolean; conflicts: string[] }> {
  const { stdout, stderr, exitCode } = await runGit(
    ['merge-tree', '--write-tree', 'HEAD', theirs],
    dir
  )
  // 0 = clean, 1 = conflicts, anything else = error
  if (exitCode !== 0 && exitCode !== 1) {
    throw new GitError('Failed to preview merge', stderr)
  }
  const conflicts = stdout
    .split('\n')
    .slice(1) // first line is the tree OID
    .map((line) => /^\d+ [0-9a-f]+ [1-3]\t(.+)$/.exec(line)?.[1])
    .filter((p): p is string => Boolean(p))
  return { clean: exitCode === 0, conflicts: [...new Set(conflicts)] }
}

export async function checkoutFile(
  dir: string,
  file: string,
  which: 'ours' | 'theirs'
): Promise<void> {
  const { stderr, exitCode } = await runGit(
    ['checkout', `--${which}`, '--', file],
    dir
  )
  if (exitCode !== 0) {
    throw new GitError(`Failed to checkout ${which} for ${file}`, stderr)
  }
  await stageFile(dir, file)
}

export async function stageFile(dir: string, file: string): Promise<void> {
  const { stderr, exitCode } = await runGit(['add', '--', file], dir)
  if (exitCode !== 0) {
    throw new GitError(`Failed to stage ${file}`, stderr)
  }
}

export async function continueMerge(dir: string): Promise<void> {
  const { stderr, exitCode } = await runGit(
    ['commit', '--no-edit'],
    dir
  )
  if (exitCode !== 0) {
    throw new GitError('Failed to complete merge commit', stderr)
  }
}

/**
 * Three-way merge a single file using git merge-file.
 * Writes result into `oursPath`. Returns true if clean, false if conflicts remain.
 * Labels are embedded in conflict markers (<<<<<<< <ours> … >>>>>>> <theirs>).
 */
export async function mergeFile(
  oursPath: string,
  basePath: string,
  theirsPath: string,
  labels?: { ours?: string; base?: string; theirs?: string }
): Promise<boolean> {
  const { exitCode } = await runGit([
    'merge-file',
    '-L',
    labels?.ours ?? 'ours',
    '-L',
    labels?.base ?? 'base',
    '-L',
    labels?.theirs ?? 'theirs',
    oursPath,
    basePath,
    theirsPath,
  ])
  // 0 = clean, >0 = conflicts, <0 = error
  return exitCode === 0
}

export async function fetchOrigin(dir: string): Promise<void> {
  const { stderr, exitCode } = await runGit(['fetch', 'origin'], dir)
  if (exitCode !== 0) {
    throw new GitError('Failed to fetch origin', stderr)
  }
}

export async function checkoutTree(
  repoDir: string,
  ref: string,
  destDir: string
): Promise<void> {
  mkdirSync(destDir, { recursive: true })
  // Use git archive | tar for a clean tree at ref without switching branches
  const proc = Bun.spawn(['git', 'archive', ref], {
    cwd: repoDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const tar = Bun.spawn(['tar', '-xf', '-', '-C', destDir], {
    cwd: destDir,
    stdin: proc.stdout,
    stderr: 'pipe',
  })

  const [gitCode, tarCode] = await Promise.all([proc.exited, tar.exited])
  if (gitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new GitError(`Failed to archive ${ref}`, stderr)
  }
  if (tarCode !== 0) {
    const stderr = await new Response(tar.stderr).text()
    throw new GitError(`Failed to extract archive of ${ref}`, stderr)
  }
}

export function githubCloneUrl(owner: string, repo: string): string {
  if (process.env.GITHUB_TOKEN) {
    return `https://${process.env.GITHUB_TOKEN}@github.com/${owner}/${repo}.git`
  }
  return `https://github.com/${owner}/${repo}.git`
}
