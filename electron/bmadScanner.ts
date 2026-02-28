// BMAD project filesystem scanner
// Scans _bmad/ directory and .claude/commands/ to dynamically discover agents, workflows, and version info

import { join } from 'path'
import { readFile, readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { spawnSync } from 'child_process'

// Types duplicated here for electron main process (no access to src/types)
export interface ScannedAgent {
  id: string
  name: string
  title: string
  icon: string
  role: string
  identity: string
  communicationStyle: string
  principles: string
  module: string
  commands: ScannedCommand[]
}

export interface ScannedCommand {
  name: string
  module: string
  type: 'workflows' | 'agents'
  label: string
}

export interface ScannedWorkflow {
  name: string
  description: string
  module: string
  stepCount: number
  maxStepNumber: number  // Highest main step number (e.g., step-08 → 8, ignoring variants like step-01b)
  stepNames: string[]    // Human-readable step names sorted by number
}

export interface BmadScanResult {
  version: string | null
  modules: string[]
  agents: ScannedAgent[]
  workflows: ScannedWorkflow[]
  detectedDeveloperMode: 'ai' | 'human' | null
  installedIdes: string[]
  missingClaudeCommands: boolean
  outputFolder?: string
  scannedAt: string
}

/**
 * Extract workflow/agent info from a menu item path attribute.
 * e.g. "_bmad/bmm/workflows/4-implementation/dev-story/workflow.yaml" -> { module: "bmm", name: "dev-story", type: "workflows" }
 * e.g. "_bmad/core/workflows/brainstorming/workflow.md" -> { module: "core", name: "brainstorming", type: "workflows" }
 * e.g. "_bmad/bmm/workflows/2-plan-workflows/create-prd/workflow-edit-prd.md" -> { module: "bmm", name: "edit-prd", type: "workflows" }
 */
function extractFromPath(path: string): { name: string; module: string; type: 'workflows' | 'agents' } | null {
  // Variant workflow: _bmad/{module}/workflows/.../{dir}/workflow-{name}.{ext}
  // Multiple workflow variants live in the same directory (e.g. create-prd/, edit-prd/, validate-prd/ all under create-prd/)
  const variantMatch = path.match(/_bmad\/([^/]+)\/workflows\/(?:.*\/)?[^/]+\/workflow-([^/.]+)\.\w+$/)
  if (variantMatch) {
    return { module: variantMatch[1], name: variantMatch[2], type: 'workflows' }
  }

  // Standard workflow: _bmad/{module}/workflows/.../{name}/workflow.{ext}
  const workflowMatch = path.match(/_bmad\/([^/]+)\/workflows\/(?:.*\/)?([^/]+)\/workflow\.\w+$/)
  if (workflowMatch) {
    return { module: workflowMatch[1], name: workflowMatch[2], type: 'workflows' }
  }

  // Agent path: _bmad/{module}/agents/{name} (strip multiple extensions like .agent.yaml)
  const agentMatch = path.match(/_bmad\/([^/]+)\/agents\/([^/]+?)(?:\.\w+)*$/)
  if (agentMatch) {
    return { module: agentMatch[1], name: agentMatch[2], type: 'agents' }
  }

  return null
}

/**
 * Extract text between XML-like tags (non-greedy).
 */
function extractTag(content: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const match = content.match(regex)
  return match ? match[1].trim() : ''
}

/**
 * Extract attribute value from an XML-like opening tag.
 */
function extractAttr(attrs: string, name: string): string {
  const regex = new RegExp(`${name}="([^"]*)"`)
  const match = attrs.match(regex)
  return match ? match[1] : ''
}

/**
 * Parse an agent markdown file to extract metadata and menu commands.
 */
function parseAgentFile(content: string, module: string): ScannedAgent | null {
  // Extract <agent ...> attributes
  const agentTagMatch = content.match(/<agent\s+([^>]+)>/)
  if (!agentTagMatch) return null

  const attrs = agentTagMatch[1]
  const rawId = extractAttr(attrs, 'id')
  if (!rawId) return null

  // BMAD agent files use filename as ID (e.g. "game-dev.agent.yaml", "dev.agent.yaml")
  // Strip file extension suffixes to get the clean agent ID (e.g. "game-dev", "dev")
  const id = rawId.replace(/\.agent\.\w+$/, '').replace(/\.\w+$/, '')

  const name = extractAttr(attrs, 'name') || id
  const title = extractAttr(attrs, 'title') || ''
  const icon = extractAttr(attrs, 'icon') || ''

  // Extract content sections
  const role = extractTag(content, 'role')
  const identity = extractTag(content, 'identity')
  const communicationStyle = extractTag(content, 'communication_style')
  const principles = extractTag(content, 'principles')

  // Parse <menu> -> <item> entries
  const commands: ScannedCommand[] = []
  const menuContent = extractTag(content, 'menu')

  if (menuContent) {
    const itemRegex = /<item\s+([^>]*?)>([^<]*)<\/item>/g
    let itemMatch
    while ((itemMatch = itemRegex.exec(menuContent)) !== null) {
      const itemAttrs = itemMatch[1]
      const itemLabel = itemMatch[2].trim()

      // Look for workflow= or exec= attributes
      const workflowPath = extractAttr(itemAttrs, 'workflow')
      const execPath = extractAttr(itemAttrs, 'exec')
      const pathValue = workflowPath || execPath

      if (pathValue) {
        const extracted = extractFromPath(pathValue)
        if (extracted) {
          commands.push({
            name: extracted.name,
            module: extracted.module,
            type: extracted.type,
            label: itemLabel
          })
        }
      }
    }
  }

  return {
    id,
    name,
    title,
    icon,
    role,
    identity,
    communicationStyle,
    principles,
    module,
    commands
  }
}

/**
 * Discover BMAD modules by checking subdirectories of _bmad/ that contain agents/.
 */
async function discoverModules(bmadPath: string): Promise<string[]> {
  const modules: string[] = []

  try {
    const entries = await readdir(bmadPath)
    for (const entry of entries) {
      if (entry.startsWith('_') || entry.startsWith('.')) continue
      const entryPath = join(bmadPath, entry)
      const stats = await stat(entryPath)
      if (!stats.isDirectory()) continue

      // Check if this directory has an agents/ subfolder
      const agentsDir = join(entryPath, 'agents')
      if (existsSync(agentsDir)) {
        modules.push(entry)
      }
    }
  } catch {
    // ignore
  }

  // Scan custom modules in _config/custom/{module-id}/
  try {
    const customDir = join(bmadPath, '_config', 'custom')
    if (existsSync(customDir)) {
      const customEntries = await readdir(customDir)
      for (const entry of customEntries) {
        if (entry.startsWith('.')) continue
        if (modules.includes(entry)) continue // skip if already discovered as official module
        // Custom modules have agents at _config/custom/{id}/src/{id}/agents/
        const agentsDir = join(customDir, entry, 'src', entry, 'agents')
        if (existsSync(agentsDir)) {
          // Store as __custom:{code}:{relative-path} so scanModuleAgents can resolve it
          // while downstream code can extract the module code
          modules.push(`__custom:${entry}:${join('_config', 'custom', entry, 'src', entry)}`)
        }
      }
    }
  } catch {
    // ignore
  }

  return modules
}

/**
 * Read manifest.yaml if it exists to get version info.
 */
async function readManifest(bmadPath: string): Promise<{ version: string | null; modules: string[] | null; ides: string[] }> {
  const manifestPath = join(bmadPath, '_config', 'manifest.yaml')
  if (!existsSync(manifestPath)) {
    return { version: null, modules: null, ides: [] }
  }

  try {
    const content = await readFile(manifestPath, 'utf-8')

    // Simple YAML parsing for version field (handles both top-level and nested under installation:)
    const versionMatch = content.match(/^\s*version:\s*['"]?([^'"\n]+)['"]?/m)
    const version = versionMatch ? versionMatch[1].trim() : null

    // Parse modules list — handles both simple (`- core`) and V6 object (`- name: core\n  version: ...`) formats
    // Capture everything under `modules:` until the next top-level key or EOF
    const modulesMatch = content.match(/^modules:\s*\n([\s\S]*?)(?=^\S|\Z)/m)
    let modules: string[] | null = null
    if (modulesMatch) {
      const block = modulesMatch[1]
      // Extract dash-prefixed lines (each starts a list item)
      const dashLines = block.split('\n').filter(l => /^\s+-/.test(l))
      modules = dashLines.map(line => {
        const stripped = line.replace(/^\s*-\s*/, '').trim()
        // V6 format: "name: core" (object with name key) → extract just the name
        const nameMatch = stripped.match(/^name:\s*(.+)/)
        return nameMatch ? nameMatch[1].trim() : stripped
      }).filter(Boolean)
    }

    // Parse ides list (e.g., ides:\n  - claude-code\n  - crush)
    const idesMatch = content.match(/^ides:\s*\n([\s\S]*?)(?=^\S|\Z)/m)
    let ides: string[] = []
    if (idesMatch) {
      const block = idesMatch[1]
      ides = block.split('\n')
        .filter(l => /^\s+-/.test(l))
        .map(l => l.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean)
    }

    return { version, modules, ides }
  } catch {
    return { version: null, modules: null, ides: [] }
  }
}

/**
 * Scan agents for a given module directory.
 */
async function scanModuleAgents(bmadPath: string, module: string): Promise<ScannedAgent[]> {
  const agentsDir = join(bmadPath, module, 'agents')
  if (!existsSync(agentsDir)) {
    console.log(`[Scanner] No agents dir: ${agentsDir}`)
    return []
  }

  const agents: ScannedAgent[] = []

  try {
    const files = await readdir(agentsDir)
    console.log(`[Scanner] Module ${module}: ${files.length} entries in agents/: ${files.join(', ')}`)
    for (const file of files) {
      if (!file.endsWith('.md')) continue
      const filePath = join(agentsDir, file)
      try {
        const content = await readFile(filePath, 'utf-8')
        const agent = parseAgentFile(content, module)
        if (agent) {
          console.log(`[Scanner] Parsed agent: ${agent.id} (${agent.name})`)
          agents.push(agent)
        } else {
          console.log(`[Scanner] Failed to parse agent from: ${file} (no <agent> tag?)`)
          // Log first 200 chars to see format
          console.log(`[Scanner] File starts with: ${content.substring(0, 200)}`)
        }
      } catch (err) {
        console.error(`[Scanner] Error reading ${file}:`, err)
      }
    }
  } catch (err) {
    console.error(`[Scanner] Error reading agents dir:`, err)
  }

  return agents
}

/**
 * Parse workflow-manifest.csv and return a map of workflow name -> { description, module, path }.
 */
async function parseWorkflowManifest(bmadPath: string): Promise<Map<string, { description: string; module: string; path: string }>> {
  const manifestPath = join(bmadPath, '_config', 'workflow-manifest.csv')
  const map = new Map<string, { description: string; module: string; path: string }>()
  if (!existsSync(manifestPath)) return map

  try {
    const content = await readFile(manifestPath, 'utf-8')
    const lines = content.split('\n').filter(Boolean)
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      // Parse CSV handling quoted fields
      const fields: string[] = []
      let current = ''
      let inQuotes = false
      for (let j = 0; j < line.length; j++) {
        const ch = line[j]
        if (ch === '"') {
          inQuotes = !inQuotes
        } else if (ch === ',' && !inQuotes) {
          fields.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
      fields.push(current.trim())

      if (fields.length >= 4) {
        const [name, description, module, path] = fields
        map.set(name, { description, module, path })
      }
    }
  } catch {
    // ignore
  }

  return map
}

/**
 * Find the step directory for a workflow by:
 * 1. Reading the workflow file and looking for step-01 references
 * 2. Falling back to scanning sibling directories for step files (covers YAML workflows)
 */
async function findStepDirectory(projectPath: string, workflowFilePath: string): Promise<string | null> {
  const fullPath = join(projectPath, workflowFilePath)
  if (!existsSync(fullPath)) return null

  const workflowDir = fullPath.substring(0, fullPath.lastIndexOf('/'))

  // Strategy 1: Parse workflow file content for step-01 references
  try {
    const content = await readFile(fullPath, 'utf-8')
    // Patterns: ./steps/step-01-init.md, ./steps-c/step-01-init.md, steps/step-01-foo.md
    const stepMatch = content.match(/['"`]?\.?\/?([^'"`\s]*\/step-01[^'"`\s]*\.md)['"`]?/)
    if (stepMatch) {
      const stepRef = stepMatch[1]
      const lastSlash = stepRef.lastIndexOf('/')
      if (lastSlash > 0) {
        const stepDirName = stepRef.substring(0, lastSlash)
        return join(workflowDir, stepDirName)
      }
    }
  } catch {
    // ignore
  }

  // Strategy 2: Look for sibling directories containing step-01*.md files
  // This handles YAML workflows that don't reference step files in their content
  try {
    const entries = await readdir(workflowDir)
    for (const entry of entries) {
      const entryPath = join(workflowDir, entry)
      const stats = await stat(entryPath)
      if (!stats.isDirectory()) continue
      // Check if this directory has step files
      const files = await readdir(entryPath)
      if (files.some(f => /^step-01.*\.md$/.test(f))) {
        return entryPath
      }
    }
  } catch {
    // ignore
  }

  return null
}

/**
 * Count step files in a directory matching /^step-\d+.*\.md$/.
 * Returns count, highest main step number, and human-readable step names sorted by number.
 * e.g., step-01-init.md → "Init", step-02-user-research.md → "User Research"
 */
async function countStepFiles(stepDirPath: string): Promise<{ count: number; maxStep: number; names: string[] }> {
  if (!existsSync(stepDirPath)) return { count: 0, maxStep: 0, names: [] }
  try {
    const files = await readdir(stepDirPath)
    const stepFiles = files.filter(f => /^step-\d+.*\.md$/.test(f))
    let maxStep = 0
    // Parse each step file into { num, label } for sorting
    const parsed: { num: number; label: string }[] = []
    for (const f of stepFiles) {
      const match = f.match(/^step-(\d+[a-z]?)[-.](.*)\.md$/)
      if (match) {
        const numStr = match[1]
        const num = parseInt(numStr, 10)
        if (num > maxStep) maxStep = num
        // Convert "user-research" → "User Research"
        const rawName = match[2].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        parsed.push({ num, label: rawName })
      } else {
        // Fallback: just extract the number
        const numMatch = f.match(/^step-(\d+)/)
        if (numMatch) {
          const num = parseInt(numMatch[1], 10)
          if (num > maxStep) maxStep = num
          parsed.push({ num, label: `Step ${num}` })
        }
      }
    }
    // Sort by step number, then alphabetically for variants (01a, 01b)
    parsed.sort((a, b) => a.num - b.num || a.label.localeCompare(b.label))
    return { count: stepFiles.length, maxStep, names: parsed.map(p => p.label) }
  } catch {
    return { count: 0, maxStep: 0, names: [] }
  }
}

/**
 * Scan workflows from command files or manifests.
 */
async function scanWorkflows(projectPath: string, modules: string[]): Promise<ScannedWorkflow[]> {
  const workflows: ScannedWorkflow[] = []
  const seen = new Set<string>()

  // Scan .claude/commands/bmad-{module}-{name}.md (stable format)
  const commandsDir = join(projectPath, '.claude', 'commands')
  if (existsSync(commandsDir)) {
    try {
      const files = await readdir(commandsDir)
      for (const file of files) {
        if (!file.startsWith('bmad-') || !file.endsWith('.md')) continue
        const withoutExt = file.replace('.md', '')

        // Skip agent commands
        if (withoutExt.startsWith('bmad-agent-')) continue

        // bmad-{module}-{name} or bmad-{name} (core module omits prefix)
        const rest = withoutExt.substring('bmad-'.length)
        const firstDash = rest.indexOf('-')

        let module: string
        let name: string
        if (firstDash === -1) {
          // No dash — core module workflow (e.g., bmad-brainstorming)
          module = 'core'
          name = rest
        } else {
          // Check if first segment is a known module, otherwise treat as core
          const possibleModule = rest.substring(0, firstDash)
          if (modules.includes(possibleModule)) {
            module = possibleModule
            name = rest.substring(firstDash + 1)
          } else {
            // Not a known module — core workflow with dashes in name (e.g., bmad-party-mode)
            module = 'core'
            name = rest
          }
        }
        const key = `${module}:${name}`
        if (!seen.has(key)) {
          seen.add(key)
          workflows.push({ name, description: '', module, stepCount: 0, maxStepNumber: 0, stepNames: [] })
        }
      }
    } catch { /* ignore */ }
  }

  // Parse workflow manifest for descriptions and step counts
  const bmadPath = join(projectPath, '_bmad')
  const manifest = await parseWorkflowManifest(bmadPath)

  // Enrich existing workflows with manifest data and count steps
  for (const wf of workflows) {
    const manifestEntry = manifest.get(wf.name)
    if (manifestEntry) {
      if (manifestEntry.description) wf.description = manifestEntry.description
      // Count step files for this workflow
      const stepDir = await findStepDirectory(projectPath, manifestEntry.path)
      if (stepDir) {
        const stepInfo = await countStepFiles(stepDir)
        wf.stepCount = stepInfo.count
        wf.maxStepNumber = stepInfo.maxStep
        wf.stepNames = stepInfo.names
        if (wf.stepCount > 0) {
          console.log(`[Scanner] Workflow ${wf.name}: ${wf.stepCount} steps (max step ${wf.maxStepNumber}) in ${stepDir}`)
        }
      }
    }
  }

  // Also add any manifest workflows not found via .claude/commands/ scan
  for (const [name, entry] of manifest) {
    const key = `${entry.module}:${name}`
    if (!seen.has(key)) {
      seen.add(key)
      let stepCount = 0
      let maxStepNumber = 0
      let stepNames: string[] = []
      const stepDir = await findStepDirectory(projectPath, entry.path)
      if (stepDir) {
        const stepInfo = await countStepFiles(stepDir)
        stepCount = stepInfo.count
        maxStepNumber = stepInfo.maxStep
        stepNames = stepInfo.names
      }
      workflows.push({ name, description: entry.description, module: entry.module, stepCount, maxStepNumber, stepNames })
    }
  }

  return workflows
}

/**
 * Detect developer mode by checking workflow file content.
 * Human mode uses "Development Record" while AI mode uses "Dev Agent Record".
 */
async function detectDeveloperMode(bmadPath: string, modules: string[]): Promise<'ai' | 'human' | null> {
  // Check bmm module first (most common), then others
  const modulesToCheck = modules.includes('bmm') ? ['bmm', ...modules.filter(m => m !== 'bmm')] : modules
  for (const module of modulesToCheck) {
    const checklistPath = join(bmadPath, module, 'workflows', '4-implementation', 'dev-story', 'checklist.md')
    try {
      const content = await readFile(checklistPath, 'utf-8')
      if (content.includes('Development Record')) return 'human'
      if (content.includes('Dev Agent Record')) return 'ai'
    } catch {
      // File doesn't exist for this module, try next
    }
  }
  return null
}

/**
 * Main scan function. Scans a project directory for BMAD data.
 * Returns null if no _bmad/ directory exists.
 */
export async function scanBmadProject(projectPath: string): Promise<BmadScanResult | null> {
  const bmadPath = join(projectPath, '_bmad')
  if (!existsSync(bmadPath)) {
    return null
  }

  // Read manifest for version info
  const manifest = await readManifest(bmadPath)

  // Discover modules by scanning directory structure (ground truth)
  // Manifest module list can be incomplete or use different formats across BMAD versions
  let modules = await discoverModules(bmadPath)
  if (modules.length === 0) {
    // Fallback: check for common module directories
    const common = ['core', 'bmm', 'gds']
    modules = common.filter(m => existsSync(join(bmadPath, m)))
  }

  // Scan agents from all modules
  const allAgents: ScannedAgent[] = []
  for (const module of modules) {
    if (module.startsWith('__custom:')) {
      // Custom module: __custom:{code}:{relative-path}
      const parts = module.split(':')
      const code = parts[1]
      const relPath = parts.slice(2).join(':')
      const moduleAgents = await scanModuleAgents(bmadPath, relPath)
      // Override module name to use the code, not the path
      for (const agent of moduleAgents) {
        agent.module = code
      }
      allAgents.push(...moduleAgents)
    } else {
      const moduleAgents = await scanModuleAgents(bmadPath, module)
      allAgents.push(...moduleAgents)
    }
  }

  // Clean module list: replace __custom:{code}:{path} entries with just the code
  const cleanModules = modules.map(m => m.startsWith('__custom:') ? m.split(':')[1] : m)

  // Scan workflows
  const workflows = await scanWorkflows(projectPath, cleanModules)

  // Detect developer mode from workflow content
  const detectedDeveloperMode = await detectDeveloperMode(bmadPath, cleanModules)

  // Check if Claude Code commands are installed
  const claudeCommandsDir = join(projectPath, '.claude', 'commands')
  const missingClaudeCommands = !existsSync(claudeCommandsDir)

  return {
    version: manifest.version,
    modules: cleanModules,
    agents: allAgents,
    workflows,
    detectedDeveloperMode,
    installedIdes: manifest.ides,
    missingClaudeCommands,
    scannedAt: new Date().toISOString()
  }
}

// --- Remote/ref-based scanning ---

/**
 * Run a git command synchronously and return stdout.
 */
function runGit(args: string[], cwd: string): { stdout: string; error?: string } {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  if (result.error) return { stdout: '', error: result.error.message }
  if (result.status !== 0) return { stdout: '', error: result.stderr || 'git command failed' }
  return { stdout: result.stdout }
}

/**
 * Read a file's content at a specific git ref.
 */
function readFileAtRef(projectPath: string, filePath: string, ref: string): string | null {
  const result = runGit(['show', `${ref}:${filePath}`], projectPath)
  if (result.error) return null
  return result.stdout
}

/**
 * List all files under a directory prefix at a specific git ref using `git ls-tree`.
 * Returns relative paths (e.g., "_bmad/bmm/agents/dev.agent.md").
 */
function listFilesAtRef(projectPath: string, prefix: string, ref: string): string[] {
  const result = runGit(['ls-tree', '-r', '--name-only', ref, prefix], projectPath)
  if (result.error) return []
  return result.stdout.trim().split('\n').filter(Boolean)
}

/**
 * Scan a BMAD project at a specific git ref (branch/tag/commit).
 * This is the remote equivalent of scanBmadProject — uses git objects
 * instead of the filesystem so it works on non-checked-out branches.
 *
 * Returns null if _bmad/ doesn't exist at the given ref.
 */
export function scanBmadAtRef(projectPath: string, ref: string): BmadScanResult | null {
  // Check if _bmad/ exists at the ref
  const allFiles = listFilesAtRef(projectPath, '_bmad/', ref)
  if (allFiles.length === 0) return null

  // Read manifest for version info
  let version: string | null = null
  let manifestIdes: string[] = []
  const manifestContent = readFileAtRef(projectPath, '_bmad/_config/manifest.yaml', ref)
  if (manifestContent) {
    const versionMatch = manifestContent.match(/^\s*version:\s*['"]?([^'"\n]+)['"]?/m)
    version = versionMatch ? versionMatch[1].trim() : null

    const idesMatch = manifestContent.match(/^ides:\s*\n([\s\S]*?)(?=^\S|\Z)/m)
    if (idesMatch) {
      manifestIdes = idesMatch[1].split('\n')
        .filter(l => /^\s+-/.test(l))
        .map(l => l.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean)
    }
  }

  // Discover modules: find directories under _bmad/ that have agents/ files
  const moduleSet = new Set<string>()
  for (const f of allFiles) {
    // _bmad/{module}/agents/{file} => module
    const match = f.match(/^_bmad\/([^/]+)\/agents\//)
    if (match && !match[1].startsWith('_') && !match[1].startsWith('.')) {
      moduleSet.add(match[1])
    }
  }
  const modules = Array.from(moduleSet)

  // Scan agents from all modules
  const allAgents: ScannedAgent[] = []
  for (const module of modules) {
    const agentFiles = allFiles.filter(f =>
      f.startsWith(`_bmad/${module}/agents/`) && f.endsWith('.md')
    )
    for (const agentFile of agentFiles) {
      const content = readFileAtRef(projectPath, agentFile, ref)
      if (!content) continue
      const agent = parseAgentFile(content, module)
      if (agent) allAgents.push(agent)
    }
  }

  // Scan workflows from .claude/commands/ at the ref
  const commandFiles = listFilesAtRef(projectPath, '.claude/commands/', ref)
  const workflows: ScannedWorkflow[] = []
  const seen = new Set<string>()

  for (const file of commandFiles) {
    const filename = file.split('/').pop() || ''
    if (!filename.startsWith('bmad-') || !filename.endsWith('.md')) continue
    const withoutExt = filename.replace('.md', '')
    if (withoutExt.startsWith('bmad-agent-')) continue

    const rest = withoutExt.substring('bmad-'.length)
    const firstDash = rest.indexOf('-')

    let module: string
    let name: string
    if (firstDash === -1) {
      module = 'core'
      name = rest
    } else {
      const possibleModule = rest.substring(0, firstDash)
      if (modules.includes(possibleModule)) {
        module = possibleModule
        name = rest.substring(firstDash + 1)
      } else {
        module = 'core'
        name = rest
      }
    }
    const key = `${module}:${name}`
    if (!seen.has(key)) {
      seen.add(key)
      workflows.push({ name, description: '', module, stepCount: 0, maxStepNumber: 0, stepNames: [] })
    }
  }

  // Detect developer mode from workflow content at ref
  let detectedDeveloperMode: 'ai' | 'human' | null = null
  const modulesToCheck = modules.includes('bmm') ? ['bmm', ...modules.filter(m => m !== 'bmm')] : modules
  for (const mod of modulesToCheck) {
    const checklistContent = readFileAtRef(
      projectPath,
      `_bmad/${mod}/workflows/4-implementation/dev-story/checklist.md`,
      ref
    )
    if (checklistContent) {
      if (checklistContent.includes('Development Record')) { detectedDeveloperMode = 'human'; break }
      if (checklistContent.includes('Dev Agent Record')) { detectedDeveloperMode = 'ai'; break }
    }
  }

  // Check if Claude Code commands exist at ref
  const missingClaudeCommands = commandFiles.length === 0

  // Detect output folder from BMAD config at ref
  let outputFolder: string | undefined
  const configContent = readFileAtRef(projectPath, '_bmad/_memory/config.yaml', ref)
  if (configContent) {
    const folderMatch = configContent.match(/^\s*output_folder:\s*['"]?([^'"\n]+)['"]?/m)
    if (folderMatch) {
      const folder = folderMatch[1].trim().replace(/^\{project-root\}\//, '')
      if (folder) outputFolder = folder
    }
  }

  return {
    version,
    modules,
    agents: allAgents,
    workflows,
    detectedDeveloperMode,
    installedIdes: manifestIdes,
    missingClaudeCommands,
    outputFolder,
    scannedAt: new Date().toISOString()
  }
}
