// Types for BMAD project filesystem scanning

export interface ScannedAgent {
  id: string              // "analyst", "game-dev"
  name: string            // "Mary", "Link Freeman"
  title: string           // "Business Analyst", "Game Developer"
  icon: string            // "📊", "🕹️"
  role: string            // from <role> tag
  identity: string        // from <identity> tag
  communicationStyle: string
  principles: string
  module: string          // "bmm", "gds", "core"
  commands: ScannedCommand[]  // parsed from <menu> items
}

export interface ScannedCommand {
  name: string            // "dev-story", "brainstorming"
  module: string          // "bmm", "gds", "core" (extracted from path)
  type: 'workflows' | 'agents'
  label: string           // "[DS] Execute Dev Story workflow"
}

export interface ScannedWorkflow {
  name: string            // "dev-story"
  description: string     // from manifest or frontmatter
  module: string          // "bmm", "gds", "core"
  stepCount: number       // Number of step files in the workflow (0 for YAML-only workflows)
  maxStepNumber: number   // Highest main step number (e.g., step-08 → 8, ignoring variants like step-01b)
  stepNames: string[]     // Human-readable step names sorted by number: ["Init", "Discovery", "Users"]
}

export interface BmadScanResult {
  version: string | null        // "6.0.1"
  modules: string[]             // ['core', 'bmm'] or ['core', 'gds']
  agents: ScannedAgent[]
  workflows: ScannedWorkflow[]
  detectedDeveloperMode: 'ai' | 'human' | null  // detected from workflow file content
  scannedAt: string             // ISO timestamp
}
