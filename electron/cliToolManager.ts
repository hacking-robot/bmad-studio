/**
 * CLI Tool Manager
 * Handles detection, validation, and spawning of AI coding assistant CLI tools
 */

import { spawn, ChildProcess, SpawnOptions, execSync } from 'child_process'
import { getAugmentedEnv, findBinary, clearPathCache } from './envUtils'

// Tool configuration and capabilities
export interface CLIToolConfig {
  id: string
  cliCommand: string | null  // null means no CLI support (IDE-only)
  versionFlag: string
  hasStreamJson: boolean     // Supports --output-format stream-json
  hasResume: boolean         // Supports --resume <sessionId>
  hasPromptFlag: boolean     // Uses -p for prompt
  supportsHeadless: boolean  // Can run without UI/IDE
  extraFlags?: string[]      // Additional flags always needed
}

export interface CLIDetectionResult {
  available: boolean
  path: string | null
  version: string | null
  error: string | null
}

// Define supported tools with their capabilities
const CLI_TOOLS: Record<string, CLIToolConfig> = {
  'claude-code': {
    id: 'claude-code',
    cliCommand: 'claude',
    versionFlag: '--version',
    hasStreamJson: true,
    hasResume: true,
    hasPromptFlag: true,
    supportsHeadless: true,
    extraFlags: ['--dangerously-skip-permissions']
  },
  'custom-endpoint': {
    id: 'custom-endpoint',
    cliCommand: 'claude', // Uses claude CLI with custom env vars
    versionFlag: '--version',
    hasStreamJson: true,
    hasResume: true,
    hasPromptFlag: true,
    supportsHeadless: true,
    extraFlags: ['--dangerously-skip-permissions']
  },
  'cursor': {
    id: 'cursor',
    cliCommand: 'cursor',
    versionFlag: '--version',
    hasStreamJson: false,
    hasResume: false,
    hasPromptFlag: false,
    supportsHeadless: true,
    extraFlags: ['--headless']
  },
  'aider': {
    id: 'aider',
    cliCommand: 'aider',
    versionFlag: '--version',
    hasStreamJson: false,
    hasResume: false,
    hasPromptFlag: false, // Uses --message
    supportsHeadless: true,
    extraFlags: ['--no-auto-commits', '--yes']
  },
  'windsurf': {
    id: 'windsurf',
    cliCommand: null, // No CLI support - IDE only
    versionFlag: '',
    hasStreamJson: false,
    hasResume: false,
    hasPromptFlag: false,
    supportsHeadless: false
  },
  'roo-code': {
    id: 'roo-code',
    cliCommand: null, // No CLI support - VS Code extension only
    versionFlag: '',
    hasStreamJson: false,
    hasResume: false,
    hasPromptFlag: false,
    supportsHeadless: false
  }
}

// Detection result cache
interface CacheEntry {
  result: CLIDetectionResult
  timestamp: number
}

const detectionCache = new Map<string, CacheEntry>()
const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Get tool configuration
 */
export function getToolConfig(toolId: string): CLIToolConfig | null {
  return CLI_TOOLS[toolId] || null
}

/**
 * Check if a tool supports headless CLI operation
 */
export function supportsHeadless(toolId: string): boolean {
  const config = CLI_TOOLS[toolId]
  return config?.supportsHeadless ?? false
}

/**
 * Detect if a CLI tool is available
 */
export async function detectTool(toolId: string): Promise<CLIDetectionResult> {
  // Check cache first
  const cached = detectionCache.get(toolId)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    return cached.result
  }

  const config = CLI_TOOLS[toolId]

  // IDE-only tools are never "available" as CLI
  if (!config || !config.cliCommand) {
    const result: CLIDetectionResult = {
      available: false,
      path: null,
      version: null,
      error: config ? 'IDE-only tool - no CLI available' : 'Unknown tool'
    }
    detectionCache.set(toolId, { result, timestamp: Date.now() })
    return result
  }

  // Try to find the binary
  const binaryPath = findBinary(config.cliCommand)

  if (!binaryPath) {
    const result: CLIDetectionResult = {
      available: false,
      path: null,
      version: null,
      error: `${config.cliCommand} not found in PATH`
    }
    detectionCache.set(toolId, { result, timestamp: Date.now() })
    return result
  }

  // Try to get version
  let version: string | null = null
  try {
    const versionOutput = execSync(`"${binaryPath}" ${config.versionFlag}`, {
      encoding: 'utf-8',
      timeout: 10000,
      env: getAugmentedEnv()
    }).trim()

    // Extract version number from output
    const versionMatch = versionOutput.match(/v?(\d+\.\d+\.\d+)/)
    version = versionMatch ? versionMatch[1] : versionOutput.split('\n')[0].trim()
  } catch (error) {
    // Version detection failed, but binary exists
    console.warn(`Failed to get version for ${toolId}:`, error)
  }

  const result: CLIDetectionResult = {
    available: true,
    path: binaryPath,
    version,
    error: null
  }

  detectionCache.set(toolId, { result, timestamp: Date.now() })
  return result
}

/**
 * Detect all supported tools
 */
export async function detectAllTools(): Promise<Record<string, CLIDetectionResult>> {
  const results: Record<string, CLIDetectionResult> = {}

  await Promise.all(
    Object.keys(CLI_TOOLS).map(async (toolId) => {
      results[toolId] = await detectTool(toolId)
    })
  )

  return results
}

/**
 * Clear detection cache (useful for manual refresh)
 */
export function clearDetectionCache(): void {
  detectionCache.clear()
  clearPathCache()
}

/**
 * Build CLI arguments for a tool
 */
export type ClaudeModel = 'sonnet' | 'opus'

export interface BuildArgsOptions {
  prompt: string
  sessionId?: string
  verbose?: boolean
  model?: ClaudeModel // Claude model alias (only for claude-code)
  customModelName?: string // Custom model name for custom-endpoint
}

export function buildArgs(toolId: string, options: BuildArgsOptions): string[] {
  const config = CLI_TOOLS[toolId]
  if (!config || !config.cliCommand) {
    throw new Error(`Cannot build args for ${toolId}: no CLI support`)
  }

  const args: string[] = []

  switch (toolId) {
    case 'claude-code':
    case 'custom-endpoint':
      // Claude: --output-format stream-json --print --verbose --dangerously-skip-permissions [--model MODEL] [--resume ID] -p "prompt"
      args.push('--output-format', 'stream-json')
      args.push('--print')
      if (options.verbose !== false) {
        args.push('--verbose')
      }
      args.push('--dangerously-skip-permissions')
      // For custom-endpoint, use the custom model name; for claude-code, use the model alias
      if (toolId === 'custom-endpoint' && options.customModelName) {
        args.push('--model', options.customModelName)
      } else if (options.model) {
        args.push('--model', options.model)
      }
      if (options.sessionId) {
        args.push('--resume', options.sessionId)
      }
      args.push('-p', options.prompt)
      break

    case 'cursor':
      // Cursor: --headless --message "prompt"
      args.push('--headless')
      args.push('--message', options.prompt)
      break

    case 'aider':
      // Aider: --no-auto-commits --yes --message "prompt" --verbose
      args.push('--no-auto-commits')
      args.push('--yes')  // Non-interactive mode
      if (options.verbose !== false) {
        args.push('--verbose')
      }
      args.push('--message', options.prompt)
      break

    default:
      throw new Error(`Unknown tool: ${toolId}`)
  }

  return args
}

// Custom endpoint configuration (mirrors the type in src/types)
export interface CustomEndpointConfig {
  name: string
  baseUrl: string
  apiKey: string
  modelName: string
}

/**
 * Spawn a CLI tool process
 */
export interface SpawnToolOptions {
  toolId: string
  prompt: string
  cwd: string
  sessionId?: string
  verbose?: boolean
  model?: ClaudeModel
  customEndpoint?: CustomEndpointConfig | null
}

export interface SpawnToolResult {
  success: boolean
  process?: ChildProcess
  error?: string
}

export async function spawnTool(options: SpawnToolOptions): Promise<SpawnToolResult> {
  const config = CLI_TOOLS[options.toolId]

  // Check if tool supports CLI
  if (!config || !config.cliCommand) {
    return {
      success: false,
      error: `${options.toolId} does not support CLI operation. Use the IDE instead.`
    }
  }

  // Detect tool availability
  const detection = await detectTool(options.toolId)
  if (!detection.available) {
    return {
      success: false,
      error: detection.error || `${config.cliCommand} not found`
    }
  }

  // Build arguments
  const args = buildArgs(options.toolId, {
    prompt: options.prompt,
    sessionId: options.sessionId,
    verbose: options.verbose,
    model: options.model,
    customModelName: options.customEndpoint?.modelName
  })

  // Build environment - inject custom endpoint vars if configured
  let env = getAugmentedEnv()
  if (options.toolId === 'custom-endpoint' && options.customEndpoint) {
    env = {
      ...env,
      ANTHROPIC_BASE_URL: options.customEndpoint.baseUrl,
      ANTHROPIC_AUTH_TOKEN: options.customEndpoint.apiKey
    }
    console.log(`[CLIToolManager] Using custom endpoint: ${options.customEndpoint.name} (${options.customEndpoint.baseUrl})`)
  }

  // Spawn options
  const spawnOptions: SpawnOptions = {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env
  }

  console.log(`[CLIToolManager] Spawning ${config.cliCommand} with args:`, args)
  console.log(`[CLIToolManager] CWD:`, options.cwd)

  try {
    const proc = spawn(detection.path!, args, spawnOptions)
    return { success: true, process: proc }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to spawn process'
    }
  }
}

/**
 * Get display info for a tool
 */
export function getToolDisplayInfo(toolId: string): { name: string; isIdeOnly: boolean; cliCommand: string | null } {
  const displayNames: Record<string, string> = {
    'claude-code': 'Claude Code',
    'cursor': 'Cursor',
    'aider': 'Aider',
    'windsurf': 'Windsurf',
    'roo-code': 'Roo Code'
  }

  const config = CLI_TOOLS[toolId]
  return {
    name: displayNames[toolId] || toolId,
    isIdeOnly: !config?.supportsHeadless,
    cliCommand: config?.cliCommand || null
  }
}
