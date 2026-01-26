#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      args.help = true
      continue
    }
    if (arg.startsWith('--')) {
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        args[arg] = next
        i += 1
      } else {
        args[arg] = true
      }
    }
  }
  return args
}

function printUsage() {
  console.log(`Usage:
  node scripts/infer-config.js --skill-config /path/to/skill.config.toml \\
    --repo-root /path/to/project \\
    --out ./answers.toml
`)
}

function stripComment(line) {
  let inQuote = false
  let quoteChar = null
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if ((ch === '"' || ch === "'") && line[i - 1] !== '\\') {
      if (!inQuote) {
        inQuote = true
        quoteChar = ch
      } else if (quoteChar === ch) {
        inQuote = false
        quoteChar = null
      }
    }
    if (ch === '#' && !inQuote) {
      return line.slice(0, i)
    }
  }
  return line
}

function parseTomlValue(raw) {
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"')
  }
  if (trimmed === 'true' || trimmed === 'false') {
    return trimmed === 'true'
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return []
    return inner
      .split(',')
      .map((item) => parseTomlValue(item.trim()))
      .filter((item) => item !== '')
      .map((item) => String(item))
  }
  return trimmed
}

function parseSkillConfig(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split(/\r?\n/)
  const variables = {}
  const order = []
  let currentVar = null
  let currentOption = null

  for (const line of lines) {
    const trimmed = stripComment(line).trim()
    if (!trimmed) continue

    const varMatch = trimmed.match(/^\[variables\.([A-Za-z0-9_]+)\]$/)
    if (varMatch) {
      currentVar = varMatch[1]
      if (!variables[currentVar]) {
        variables[currentVar] = { options: [] }
        order.push(currentVar)
      }
      currentOption = null
      continue
    }

    const optMatch = trimmed.match(
      /^\[\[variables\.([A-Za-z0-9_]+)\.options\]\]$/
    )
    if (optMatch) {
      currentVar = optMatch[1]
      if (!variables[currentVar]) {
        variables[currentVar] = { options: [] }
        order.push(currentVar)
      }
      currentOption = {}
      variables[currentVar].options.push(currentOption)
      continue
    }

    if (!currentVar) continue

    const kvMatch = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/)
    if (!kvMatch) continue

    const key = kvMatch[1]
    const value = parseTomlValue(kvMatch[2])

    if (currentOption && (key === 'value' || key === 'label')) {
      currentOption[key] = value
      continue
    }

    variables[currentVar][key] = value
  }

  return { variables, order }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function fileExists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function detectPackageManager(repoRoot, pkgJson) {
  if (pkgJson && typeof pkgJson.packageManager === 'string') {
    const name = pkgJson.packageManager.split('@')[0]
    if (name) return name
  }

  if (fileExists(repoRoot, 'pnpm-lock.yaml')) return 'pnpm'
  if (fileExists(repoRoot, 'bun.lockb') || fileExists(repoRoot, 'bun.lock'))
    return 'bun'
  if (fileExists(repoRoot, 'yarn.lock')) return 'yarn'
  if (fileExists(repoRoot, 'package-lock.json')) return 'npm'
  if (fileExists(repoRoot, 'npm-shrinkwrap.json')) return 'npm'
  return undefined
}

function flattenDeps(pkgJson) {
  const deps = {
    ...(pkgJson?.dependencies || {}),
    ...(pkgJson?.devDependencies || {}),
    ...(pkgJson?.peerDependencies || {}),
  }
  return Object.keys(deps)
}

function detectFramework(deps) {
  const has = (name) => deps.includes(name)
  if (has('next')) return 'next'
  if (has('react')) return 'react'
  if (has('vue') || has('@vue/runtime-core')) return 'vue'
  if (has('nuxt')) return 'nuxt'
  if (has('svelte')) return 'svelte'
  if (has('solid-js')) return 'solid'
  if (has('@angular/core')) return 'angular'
  if (has('astro')) return 'astro'
  if (has('@remix-run/react') || has('remix')) return 'remix'
  if (has('express')) return 'express'
  if (has('fastify')) return 'fastify'
  if (has('koa')) return 'koa'
  if (has('@nestjs/core')) return 'nestjs'
  return undefined
}

function detectLinter(deps) {
  if (deps.includes('eslint')) return 'eslint'
  if (deps.includes('@biomejs/biome')) return 'biome'
  if (deps.includes('rome')) return 'rome'
  if (deps.includes('tslint')) return 'tslint'
  return undefined
}

function detectFormatter(deps) {
  if (deps.includes('prettier')) return 'prettier'
  if (deps.includes('@biomejs/biome')) return 'biome'
  return undefined
}

function detectTestRunner(deps) {
  if (deps.includes('vitest')) return 'vitest'
  if (deps.includes('jest')) return 'jest'
  if (deps.includes('mocha')) return 'mocha'
  if (deps.includes('ava')) return 'ava'
  if (deps.includes('jasmine')) return 'jasmine'
  if (deps.includes('playwright')) return 'playwright'
  if (deps.includes('cypress')) return 'cypress'
  return undefined
}

function detectSrcDir(repoRoot) {
  const candidates = ['src', 'app', 'lib']
  for (const dir of candidates) {
    if (fileExists(repoRoot, dir)) return dir
  }
  return undefined
}

function detectLocales(repoRoot) {
  const candidates = [
    path.join(repoRoot, 'src', 'locales'),
    path.join(repoRoot, 'src', 'i18n'),
    path.join(repoRoot, 'locales'),
    path.join(repoRoot, 'i18n'),
    path.join(repoRoot, 'public', 'locales'),
  ]

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      const languages = entries
        .filter((entry) => entry.isDirectory() || entry.name.endsWith('.json'))
        .map((entry) =>
          entry.isDirectory() ? entry.name : entry.name.replace(/\.json$/, '')
        )
        .filter((name) => name)
      if (languages.length > 0) {
        return Array.from(new Set(languages))
      }
    } catch {
      continue
    }
  }
  return undefined
}

function buildScriptCommand(scriptName, packageManager) {
  const manager = packageManager || 'npm'
  switch (manager) {
    case 'pnpm':
      return `pnpm run ${scriptName}`
    case 'yarn':
      return `yarn ${scriptName}`
    case 'bun':
      return `bun run ${scriptName}`
    case 'npm':
    default:
      return `npm run ${scriptName}`
  }
}

function detectSignals(repoRoot) {
  const pkgPath = path.join(repoRoot, 'package.json')
  const pkgJson = readJson(pkgPath)
  const deps = pkgJson ? flattenDeps(pkgJson) : []
  const scripts = pkgJson?.scripts || {}
  const packageManager = detectPackageManager(repoRoot, pkgJson)
  const framework = detectFramework(deps)
  const linter = detectLinter(deps)
  const formatter = detectFormatter(deps)
  const testRunner = detectTestRunner(deps)
  const hasTypeScript =
    fileExists(repoRoot, 'tsconfig.json') || deps.includes('typescript')
  const srcDir = detectSrcDir(repoRoot)
  const languages = detectLocales(repoRoot)

  const commands = {
    lint: scripts.lint || buildScriptCommand('lint', packageManager),
    test: scripts.test || buildScriptCommand('test', packageManager),
    build: scripts.build || buildScriptCommand('build', packageManager),
    dev: scripts.dev || buildScriptCommand('dev', packageManager),
  }

  return {
    packageManager,
    framework,
    linter,
    formatter,
    testRunner,
    hasTypeScript,
    srcDir,
    languages,
    commands,
    deps,
  }
}

function matchChoiceOption(options, value) {
  if (!options || !value) return undefined
  const target = String(value).toLowerCase()
  return options.find(
    (opt) =>
      String(opt.value).toLowerCase() === target ||
      String(opt.label).toLowerCase() === target
  )
}

function inferValueForVariable(varName, variable, signals) {
  const name = varName.toUpperCase()

  if (variable.type === 'boolean') {
    if (name.includes('TYPESCRIPT') || name.includes('USE_TS')) {
      return signals.hasTypeScript
    }
  }

  if (name.includes('PACKAGE') || name.includes('PKG')) {
    return signals.packageManager
  }
  if (name.includes('FRAMEWORK') || name.includes('UI_LIBRARY')) {
    return signals.framework
  }
  if (name.includes('LINTER')) {
    return signals.linter
  }
  if (name.includes('FORMATTER')) {
    return signals.formatter
  }
  if (name.includes('TEST_RUNNER')) {
    return signals.testRunner
  }
  if (name.includes('SRC_DIR') || name.includes('SOURCE_DIR')) {
    return signals.srcDir
  }
  if (name.includes('LINT_COMMAND')) {
    return signals.commands.lint
  }
  if (name.includes('TEST_COMMAND')) {
    return signals.commands.test
  }
  if (name.includes('BUILD_COMMAND')) {
    return signals.commands.build
  }
  if (name.includes('DEV_COMMAND')) {
    return signals.commands.dev
  }
  if (name.includes('LANG') && Array.isArray(signals.languages)) {
    return signals.languages
  }

  return undefined
}

function resolveValue(varName, variable, inferred) {
  switch (variable.type) {
    case 'choice': {
      const matched = matchChoiceOption(variable.options || [], inferred)
      if (matched) return matched.value
      if (variable.default) return variable.default
      const first = variable.options?.[0]
      return first ? first.value : ''
    }
    case 'boolean': {
      if (typeof inferred === 'boolean') return inferred
      if (typeof variable.default === 'boolean') return variable.default
      return false
    }
    case 'array': {
      if (Array.isArray(inferred)) return inferred
      if (Array.isArray(variable.default)) return variable.default
      if (typeof inferred === 'string' && inferred) return [inferred]
      return []
    }
    case 'string':
    default: {
      if (typeof inferred === 'string' && inferred) return inferred
      if (variable.default !== undefined) return String(variable.default)
      return ''
    }
  }
}

function toTomlValue(value) {
  if (Array.isArray(value)) {
    const items = value.map((item) => `"${String(item).replace(/"/g, '\\"')}"`)
    return `[${items.join(', ')}]`
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  return `"${String(value).replace(/"/g, '\\"')}"`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  const skillConfigArg = args['--skill-config']
  if (!skillConfigArg) {
    printUsage()
    process.exit(1)
  }

  const skillConfigPath = path.resolve(skillConfigArg)
  const repoRoot = path.resolve(args['--repo-root'] || process.cwd())
  const outPath = path.resolve(
    args['--out'] || path.join(process.cwd(), 'answers.toml')
  )

  const { variables, order } = parseSkillConfig(skillConfigPath)
  const signals = detectSignals(repoRoot)
  const answers = {}

  for (const varName of order) {
    const variable = variables[varName]
    const inferred = inferValueForVariable(varName, variable, signals)
    const resolved = resolveValue(varName, variable, inferred)
    answers[varName] = resolved
  }

  const lines = order.map((varName) => {
    return `${varName} = ${toTomlValue(answers[varName])}`
  })

  fs.writeFileSync(outPath, lines.join('\n') + '\n')
  console.log(`Wrote ${outPath}`)
}

main()
