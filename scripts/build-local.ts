#!/usr/bin/env bun
/**
 * Build script for creating a single-file executable for the current platform
 */
import { readFileSync } from 'node:fs'

// Read version from package.json
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = pkg.version

const outfile = './dist/taito'

console.log(`Building taito-cli v${version} for the current platform...`)

const result = await Bun.build({
  entrypoints: ['./bin/taito.ts'],
  compile: {
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
  console.error('  ✗ Build failed:')
  for (const log of result.logs) {
    console.error(`    ${log.message}`)
  }
  process.exit(1)
}
