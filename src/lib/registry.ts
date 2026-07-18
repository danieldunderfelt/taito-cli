import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

import type { RegisteredTemplate, TaitoRegistry } from '../types.js'

const REGISTRY_VERSION_COMMENT = '# Taito global registry'

export function getTaitoHome(): string {
  return process.env.TAITO_HOME ?? join(homedir(), '.taito')
}

export function getRegistryPath(): string {
  return join(getTaitoHome(), 'registry.toml')
}

export function getTemplatesCacheDir(): string {
  return join(getTaitoHome(), 'templates')
}

export function getTemplateCachePath(name: string): string {
  return join(getTemplatesCacheDir(), name)
}

function emptyRegistry(): TaitoRegistry {
  return { templates: {} }
}

export function ensureTaitoHome(): void {
  mkdirSync(getTaitoHome(), { recursive: true })
  mkdirSync(getTemplatesCacheDir(), { recursive: true })
}

export function readRegistry(): TaitoRegistry {
  const path = getRegistryPath()
  if (!existsSync(path)) {
    return emptyRegistry()
  }

  const content = readFileSync(path, 'utf-8')
  const parsed = parseToml(content) as Record<string, unknown>
  const templatesRaw = (parsed.templates ?? {}) as Record<string, unknown>
  const templates: Record<string, RegisteredTemplate> = {}

  for (const [key, value] of Object.entries(templatesRaw)) {
    if (typeof value !== 'object' || value === null) continue
    const entry = value as Record<string, unknown>
    if (typeof entry.name !== 'string' || typeof entry.path !== 'string') {
      continue
    }
    templates[key] = {
      name: entry.name,
      path: entry.path,
      source: typeof entry.source === 'string' ? entry.source : 'local',
      ref: typeof entry.ref === 'string' ? entry.ref : undefined,
      extends: typeof entry.extends === 'string' ? entry.extends : undefined,
      branch: typeof entry.branch === 'string' ? entry.branch : undefined,
      addedAt:
        typeof entry.addedAt === 'string'
          ? entry.addedAt
          : new Date().toISOString(),
    }
  }

  return { templates }
}

export function writeRegistry(registry: TaitoRegistry): void {
  ensureTaitoHome()
  const path = getRegistryPath()
  const body = stringifyToml({ templates: registry.templates })
  writeFileSync(path, `${REGISTRY_VERSION_COMMENT}\n${body}\n`)
}

export function getRegisteredTemplate(
  name: string
): RegisteredTemplate | undefined {
  const registry = readRegistry()
  return registry.templates[name]
}

export function listRegisteredTemplates(): RegisteredTemplate[] {
  const registry = readRegistry()
  return Object.values(registry.templates).toSorted((a, b) =>
    a.name.localeCompare(b.name)
  )
}

export function registerTemplate(entry: RegisteredTemplate): void {
  const registry = readRegistry()
  registry.templates[entry.name] = entry
  writeRegistry(registry)
}

export function unregisterTemplate(name: string): RegisteredTemplate | undefined {
  const registry = readRegistry()
  const existing = registry.templates[name]
  if (!existing) return undefined
  delete registry.templates[name]
  writeRegistry(registry)
  return existing
}

export function isTemplateNameTaken(name: string): boolean {
  return getRegisteredTemplate(name) !== undefined
}
