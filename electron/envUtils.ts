/**
 * Environment utilities for CLI tool detection
 * Handles PATH discovery from multiple sources when running in a GUI-launched Electron app
 */

import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir, platform } from 'os'
import { execSync } from 'child_process'

// Cache the augmented PATH to avoid recomputing
let cachedAugmentedPath: string | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Get common binary paths based on platform
 */
function getCommonPaths(): string[] {
  const home = homedir()
  const paths: string[] = []

  if (platform() === 'darwin' || platform() === 'linux') {
    // Standard system paths
    paths.push('/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin')

    // Homebrew (macOS)
    // ARM64 (Apple Silicon)
    paths.push('/opt/homebrew/bin', '/opt/homebrew/sbin')
    // Intel
    paths.push('/usr/local/bin', '/usr/local/sbin')

    // Linux brew
    paths.push(join(home, '.linuxbrew', 'bin'))
    paths.push('/home/linuxbrew/.linuxbrew/bin')

    // User-local installs
    paths.push(join(home, '.local', 'bin'))

    // Cargo (Rust)
    paths.push(join(home, '.cargo', 'bin'))

    // pip user installs
    if (platform() === 'darwin') {
      // Python 3.x user installs on macOS
      paths.push(join(home, 'Library', 'Python', '3.11', 'bin'))
      paths.push(join(home, 'Library', 'Python', '3.10', 'bin'))
      paths.push(join(home, 'Library', 'Python', '3.9', 'bin'))
    } else {
      paths.push(join(home, '.local', 'bin'))
    }

    // asdf version manager
    paths.push(join(home, '.asdf', 'shims'))

    // mise version manager (modern asdf replacement)
    paths.push(join(home, '.local', 'share', 'mise', 'shims'))
  }

  return paths
}

/**
 * Discover NVM node installations and return the active version's bin path
 */
function getNvmPaths(): string[] {
  const home = homedir()
  const nvmDir = join(home, '.nvm', 'versions', 'node')
  const paths: string[] = []

  if (existsSync(nvmDir)) {
    try {
      // List all installed node versions
      const versions = readdirSync(nvmDir).filter(v => v.startsWith('v'))

      // Add all version paths (most recent first based on version number)
      versions.sort((a, b) => {
        const aParts = a.substring(1).split('.').map(Number)
        const bParts = b.substring(1).split('.').map(Number)
        for (let i = 0; i < 3; i++) {
          if ((bParts[i] || 0) !== (aParts[i] || 0)) {
            return (bParts[i] || 0) - (aParts[i] || 0)
          }
        }
        return 0
      })

      for (const version of versions) {
        paths.push(join(nvmDir, version, 'bin'))
      }
    } catch {
      // NVM directory might not be accessible
    }
  }

  // Also check for fnm (Fast Node Manager)
  const fnmDir = join(home, '.fnm', 'node-versions')
  if (existsSync(fnmDir)) {
    try {
      const versions = readdirSync(fnmDir).filter(v => v.startsWith('v'))
      versions.sort().reverse() // Most recent first
      for (const version of versions) {
        paths.push(join(fnmDir, version, 'installation', 'bin'))
      }
    } catch {
      // fnm directory might not be accessible
    }
  }

  // Also check for n (node version manager)
  const nDir = join(home, 'n', 'bin')
  if (existsSync(nDir)) {
    paths.push(nDir)
  }

  return paths
}

/**
 * Try to get npm global bin directory
 */
function getNpmGlobalBin(): string | null {
  try {
    // First try to get it from npm config
    const result = execSync('npm config get prefix --location=global', {
      encoding: 'utf-8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: getAugmentedPath()
      }
    }).trim()

    if (result && result !== 'undefined') {
      const binPath = platform() === 'win32'
        ? result
        : join(result, 'bin')
      if (existsSync(binPath)) {
        return binPath
      }
    }
  } catch {
    // npm might not be installed or accessible
  }

  return null
}

/**
 * Build an augmented PATH that includes all common binary locations
 * This solves the problem where Finder-launched apps get minimal PATH
 */
export function getAugmentedPath(): string {
  // Return cached value if still valid
  if (cachedAugmentedPath && Date.now() - cacheTimestamp < CACHE_DURATION_MS) {
    return cachedAugmentedPath
  }

  // Clear cache first to prevent infinite recursion if getNpmGlobalBin() calls us back
  const hadCachedPath = cachedAugmentedPath !== null
  cachedAugmentedPath = null

  const existingPath = process.env.PATH || ''
  const existingPaths = new Set(existingPath.split(':').filter(Boolean))

  // Collect all potential paths
  const additionalPaths: string[] = []

  // Add common paths
  for (const p of getCommonPaths()) {
    if (existsSync(p) && !existingPaths.has(p)) {
      additionalPaths.push(p)
    }
  }

  // Add NVM/fnm/n paths
  for (const p of getNvmPaths()) {
    if (existsSync(p) && !existingPaths.has(p)) {
      additionalPaths.push(p)
    }
  }

  // Try npm global (only on subsequent calls to avoid recursion)
  // hadCachedPath means this isn't our very first call ever
  if (hadCachedPath) {
    const npmBin = getNpmGlobalBin()
    if (npmBin && !existingPaths.has(npmBin)) {
      additionalPaths.push(npmBin)
    }
  }

  // Build the augmented PATH
  // Put our discovered paths first, then the original PATH
  const allPaths = [...additionalPaths, ...Array.from(existingPaths)]
  cachedAugmentedPath = allPaths.join(':')
  cacheTimestamp = Date.now()

  return cachedAugmentedPath
}

/**
 * Get environment variables with augmented PATH for spawning CLI tools
 */
export function getAugmentedEnv(): NodeJS.ProcessEnv {
  // Remove GPG_TTY so gpg-agent uses GUI pinentry instead of terminal
  // This prevents blocking when running from Electron (no TTY available)
  const env = { ...process.env }
  delete env.GPG_TTY

  return {
    ...env,
    PATH: getAugmentedPath()
  }
}

/**
 * Clear the cached PATH (useful for testing or manual refresh)
 */
export function clearPathCache(): void {
  cachedAugmentedPath = null
  cacheTimestamp = 0
}

/**
 * Check if a binary exists in the augmented PATH
 */
export function findBinary(name: string): string | null {
  const augmentedPath = getAugmentedPath()
  const paths = augmentedPath.split(':')

  for (const dir of paths) {
    const fullPath = join(dir, name)
    if (existsSync(fullPath)) {
      return fullPath
    }
  }

  return null
}
