/**
 * Minimal glob matcher supporting ** and * (no brace expansion).
 * Patterns are matched against posix-style relative paths.
 */
export function matchGlob(pattern: string, path: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, '/')
  const normalizedPath = path.replace(/\\/g, '/')

  // Directory patterns like "docs/**" also match "docs" itself and children
  const regex = globToRegExp(normalizedPattern)
  if (regex.test(normalizedPath)) {
    return true
  }

  // If pattern ends with /**, also match the directory prefix
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3)
    if (
      normalizedPath === prefix ||
      normalizedPath.startsWith(prefix + '/')
    ) {
      return true
    }
  }

  return false
}

export function matchAnyGlob(patterns: string[], path: string): boolean {
  return patterns.some((pattern) => matchGlob(pattern, path))
}

function globToRegExp(pattern: string): RegExp {
  let regex = '^'
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '*' && pattern[i + 1] === '*') {
      // **
      if (pattern[i + 2] === '/') {
        regex += '(?:.*/)?'
        i += 2
      } else {
        regex += '.*'
        i += 1
      }
    } else if (char === '*') {
      regex += '[^/]*'
    } else if (char === '?') {
      regex += '[^/]'
    } else if ('+.^${}()|[]\\'.includes(char)) {
      regex += '\\' + char
    } else {
      regex += char
    }
  }
  regex += '$'
  return new RegExp(regex)
}
