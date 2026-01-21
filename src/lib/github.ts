import { createWriteStream, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { extract } from 'tar'
import type { SkillSource } from '../types.js'

/**
 * Parse a skill source string (owner/repo or local path)
 */
export function parseSkillSource(source: string, ref?: string): SkillSource {
  // Check if it's a local path
  if (
    source.startsWith('/') ||
    source.startsWith('./') ||
    source.startsWith('..')
  ) {
    return {
      type: 'local',
      path: source,
    }
  }

  // Parse as GitHub owner/repo
  const match = source.match(/^([^/]+)\/([^/@]+)(?:@(.+))?$/)
  if (!match) {
    throw new Error(
      `Invalid skill source: "${source}". Expected format: owner/repo or owner/repo@ref`
    )
  }

  return {
    type: 'github',
    owner: match[1],
    repo: match[2],
    ref: ref ?? match[3] ?? 'main',
  }
}

/**
 * Fetch a skill from GitHub and extract to a temp directory
 * Returns the path to the extracted skill directory
 */
export async function fetchFromGitHub(source: SkillSource): Promise<string> {
  if (source.type !== 'github') {
    throw new Error('Source is not a GitHub repository')
  }

  const { owner, repo, ref = 'main' } = source
  const tarballUrl = `https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`

  // Create temp directory
  const tempDir = mkdtempSync(join(tmpdir(), 'taito-'))

  try {
    // Fetch the tarball
    const response = await fetch(tarballUrl, {
      headers: {
        // Support private repos with GITHUB_TOKEN
        ...(process.env.GITHUB_TOKEN && {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        }),
      },
    })

    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${owner}/${repo}@${ref}: ${response.status} ${response.statusText}`
      )
    }

    if (!response.body) {
      throw new Error('No response body received from GitHub')
    }

    // Write tarball to temp file
    const tarballPath = join(tempDir, 'skill.tar.gz')
    const writeStream = createWriteStream(tarballPath)
    await pipeline(Readable.fromWeb(response.body as never), writeStream)

    // Extract tarball
    const extractDir = join(tempDir, 'extracted')
    await extract({
      file: tarballPath,
      cwd: tempDir,
    })

    // GitHub tarballs extract to a directory named {repo}-{ref}
    // We need to find it
    const { readdirSync } = await import('node:fs')
    const entries = readdirSync(tempDir)
    const extractedDir = entries.find(
      (e) => e !== 'skill.tar.gz' && !e.startsWith('.')
    )

    if (!extractedDir) {
      throw new Error('Failed to find extracted skill directory')
    }

    return join(tempDir, extractedDir)
  } catch (error) {
    // Clean up on error
    rmSync(tempDir, { recursive: true, force: true })
    throw error
  }
}

/**
 * Clean up a temp directory created by fetchFromGitHub
 */
export function cleanupTempDir(skillDir: string): void {
  // The skill dir is inside a temp dir, so we need to go up one level
  const tempDir = join(skillDir, '..')
  rmSync(tempDir, { recursive: true, force: true })
}
