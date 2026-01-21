#!/usr/bin/env bun
/**
 * Build script for creating cross-platform single-file executables
 *
 * Targets:
 * - darwin-arm64 (macOS Apple Silicon)
 * - linux-x64 (Linux x86_64)
 * - linux-arm64 (Linux ARM64)
 * - windows-x64 (Windows x86_64)
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Read version from package.json
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = pkg.version

const targets = [
  'bun-darwin-arm64',
  'bun-linux-x64',
  'bun-linux-arm64',
  'bun-windows-x64',
] as const

const outDir = './dist'

// Clean and recreate dist directory
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

console.log(
  `Building taito-cli v${version} for ${targets.length} platforms...\n`
)

for (const target of targets) {
  // Extract platform info from target (e.g., "bun-darwin-arm64" -> "darwin-arm64")
  const platform = target.replace('bun-', '')
  const isWindows = platform.startsWith('windows')
  const outfile = join(outDir, `taito-${platform}${isWindows ? '.exe' : ''}`)

  console.log(`Building for ${platform}...`)

  const result = await Bun.build({
    entrypoints: ['./bin/taito.ts'],
    compile: {
      target,
      outfile,
    },
    minify: true,
    bytecode: true,
    sourcemap: true,
    define: {
      BUILD_VERSION: JSON.stringify(version),
    },
  })

  if (result.success) {
    console.log(`  ✓ ${outfile}`)
  } else {
    console.error(`  ✗ Failed to build for ${platform}:`)
    for (const log of result.logs) {
      console.error(`    ${log}`)
    }
    process.exit(1)
  }
}

console.log('\nBuild complete!')
