#!/usr/bin/env node
/**
 * Launcher script that runs the correct platform-specific binary
 */

const { execFileSync } = require('child_process')
const { existsSync } = require('fs')
const { join } = require('path')

const platform = process.platform
const arch = process.arch

// Map Node.js platform/arch to our binary names
const platformMap = {
  'darwin-arm64': 'taito-darwin-arm64',
  'darwin-x64': 'taito-darwin-arm64',
  'linux-x64': 'taito-linux-x64',
  'linux-arm64': 'taito-linux-arm64',
  'win32-x64': 'taito-windows-x64.exe',
}

const key = `${platform}-${arch}`
const binaryName = platformMap[key]

if (!binaryName) {
  console.error(`taito-cli: Unsupported platform: ${platform}-${arch}`)
  console.error(
    'Supported platforms: macOS (arm64), Linux (x64, arm64), Windows (x64)'
  )
  console.error(
    'You can build from source: https://github.com/AikoaLabs/taito-cli'
  )
  process.exit(1)
}

const distDir = join(__dirname, '..', 'dist')
const binaryPath = join(distDir, binaryName)

if (!existsSync(binaryPath)) {
  console.error(`taito-cli: Binary not found: ${binaryPath}`)
  console.error('Try reinstalling: npm install -g taito-cli')
  process.exit(1)
}

// Execute the binary with all arguments passed through
try {
  execFileSync(binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
    env: process.env,
  })
} catch (error) {
  // execFileSync throws if the child exits with non-zero, but we want to preserve that exit code
  if (error.status !== undefined) {
    process.exit(error.status)
  }
  throw error
}
