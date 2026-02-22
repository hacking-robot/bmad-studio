// Canonical statuses used in the UI
export type StoryStatus = 'backlog' | 'ready-for-dev' | 'in-progress' | 'review' | 'human-review' | 'done' | 'optional'

// Extended type that includes legacy/alternate status values that may appear in sprint-status.yaml
export type StoryStatusExtended = StoryStatus | 'ready-for-review' | 'complete'

// Normalize extended statuses to canonical statuses (for display in columns)
// 'ready-for-review' is treated as 'review'
// 'complete' is treated as 'done'
export function normalizeStatus(status: StoryStatusExtended): StoryStatus {
  if (status === 'ready-for-review') return 'review'
  if (status === 'complete') return 'done'
  return status
}

export interface Epic {
  id: number
  name: string
  goal: string
  status: StoryStatus
  stories: Story[]
}

export interface Story {
  id: string // e.g., "1-1-place-nand-gates"
  epicId: number
  storyNumber: number
  title: string
  slug: string
  status: StoryStatus
  filePath?: string
  // User story description from epics.md (for stories without story files)
  epicDescription?: string
  // Parsed content (loaded on demand from story file)
  content?: StoryContent
  // Additional metadata from epics.md (for stories without story files)
  acceptanceCriteriaPreview?: string[]  // First 3 AC items from epics.md
  technicalNotes?: string               // Technical Notes section
  frsAddressed?: string[]               // FRs addressed list
}

export interface StoryContent {
  rawMarkdown: string
  description: string // The "As a... I want... so that..." part
  acceptanceCriteria: AcceptanceCriterion[]
  tasks: Task[]
  devNotes: string
  fileChanges?: FileChanges
}

export interface AcceptanceCriterion {
  id: string
  title: string
  description: string
}

export interface Task {
  id: string
  title: string
  completed: boolean
  subtasks: Subtask[]
}

export interface Subtask {
  id: string
  title: string
  completed: boolean
}

export interface FileChanges {
  created: string[]
  modified: string[]
  verified: string[]
}

// Column configuration for the board
export const STATUS_COLUMNS: { status: StoryStatus; label: string; color: string }[] = [
  { status: 'backlog', label: 'Backlog', color: '#9e9e9e' },
  { status: 'ready-for-dev', label: 'Ready for Dev', color: '#2196f3' },
  { status: 'in-progress', label: 'In Progress', color: '#ff9800' },
  { status: 'review', label: 'Review', color: '#9c27b0' },
  { status: 'human-review', label: 'Human Review', color: '#e91e63' },
  { status: 'done', label: 'Done', color: '#4caf50' }
]

// Human Review checklist types
export interface HumanReviewChecklistItem {
  id: string
  label: string
  description?: string
}

export interface StoryReviewState {
  storyId: string
  checkedItems: string[]
  lastUpdated: number
}

// Epic colors for badges
export const EPIC_COLORS: string[] = [
  '#1976d2', // Blue
  '#388e3c', // Green
  '#f57c00', // Orange
  '#7b1fa2', // Purple
  '#c62828', // Red
  '#00838f', // Cyan
  '#5d4037', // Brown
  '#455a64', // Blue Grey
  '#ad1457'  // Pink
]

// Agent types
export type AgentStatus = 'running' | 'completed' | 'error' | 'interrupted'
export type ProjectType = 'bmm' | 'gds'
export type BmadVersion = 'stable'

// AI Tool types - determines command syntax
export type AITool = 'claude-code' | 'custom-endpoint' | 'cursor' | 'windsurf' | 'roo-code' | 'aider'

// Claude model aliases for --model flag
export type ClaudeModel = 'sonnet' | 'opus'

// Custom Anthropic-compatible endpoint configuration (e.g., GLM, Kimi)
export interface CustomEndpointConfig {
  name: string           // User-friendly name (e.g., "GLM", "Kimi")
  baseUrl: string        // e.g., "https://api.moonshot.ai/anthropic/"
  apiKey: string         // API key for authentication
  modelName: string      // Custom model name (e.g., "kimi-k2", "glm-4.7")
}

export const CLAUDE_MODELS: { id: ClaudeModel; name: string; description: string }[] = [
  { id: 'opus', name: 'Opus', description: 'Most intelligent, best for complex tasks' },
  { id: 'sonnet', name: 'Sonnet', description: 'Fast and capable' }
]

// CLI Tool capabilities
export interface CLIToolInfo {
  cliCommand: string | null  // null means IDE-only (no CLI support)
  hasStreamJson: boolean     // Supports --output-format stream-json
  hasResume: boolean         // Supports --resume <sessionId>
  supportsHeadless: boolean  // Can run without UI/IDE
}

// CLI detection result from backend
export interface CLIDetectionResult {
  available: boolean
  path: string | null
  version: string | null
  error: string | null
}

export const AI_TOOLS: { id: AITool; name: string; agentPrefix: string; description: string; cli: CLIToolInfo }[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    agentPrefix: '/',
    description: 'Anthropic CLI - uses /agent slash commands',
    cli: { cliCommand: 'claude', hasStreamJson: true, hasResume: true, supportsHeadless: true }
  },
  {
    id: 'custom-endpoint',
    name: 'Custom Endpoint',
    agentPrefix: '/',
    description: 'Anthropic-compatible API (GLM, Kimi, etc.)',
    cli: { cliCommand: 'claude', hasStreamJson: true, hasResume: true, supportsHeadless: true }
  },
  { 
    id: 'cursor', 
    name: 'Cursor', 
    agentPrefix: '@', 
    description: 'Cursor IDE - uses @agent rules',
    cli: { cliCommand: 'cursor', hasStreamJson: false, hasResume: false, supportsHeadless: true }
  },
  { 
    id: 'aider', 
    name: 'Aider', 
    agentPrefix: '/', 
    description: 'AI pair programming - git-aware coding assistant',
    cli: { cliCommand: 'aider', hasStreamJson: false, hasResume: false, supportsHeadless: true }
  },
  { 
    id: 'windsurf', 
    name: 'Windsurf', 
    agentPrefix: '@', 
    description: 'Codeium IDE - uses @agent workflows',
    cli: { cliCommand: null, hasStreamJson: false, hasResume: false, supportsHeadless: false }
  },
  { 
    id: 'roo-code', 
    name: 'Roo Code', 
    agentPrefix: '@', 
    description: 'VS Code extension - uses @agent rules',
    cli: { cliCommand: null, hasStreamJson: false, hasResume: false, supportsHeadless: false }
  }
]

export interface Agent {
  id: string
  storyId: string
  storyTitle: string
  command: string
  status: AgentStatus
  output: string[]
  startTime: number
  pid?: number
}

// Agent history for persistence across app restarts
export interface AgentHistoryEntry {
  id: string
  storyId: string
  storyTitle: string
  command: string
  status: AgentStatus
  output: string[] // Last N lines of output
  startTime: number
  endTime?: number
  exitCode?: number
}

// NOTE: Agent actions are now defined in src/data/flow.json
// Use the useWorkflow hook to access workflow data

// LLM response statistics (from claude CLI --output-format stream-json)
export interface LLMStats {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalCostUsd?: number
  durationMs?: number
  apiDurationMs?: number
}

// Per-project LLM cost tracking
export interface ProjectCostEntry {
  id: string
  timestamp: number
  agentId: string
  storyId?: string
  messageId: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalCostUsd: number
  durationMs?: number
}

// Tool call tracking for verbose chat mode
export interface ToolCall {
  name: string                      // "Read", "Edit", "Bash", etc.
  summary: string                   // From getToolActivity(): "Reading store.ts"
  input?: Record<string, unknown>   // Raw input for expanded detail
}

// Chat interface types
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status: 'pending' | 'streaming' | 'complete' | 'error'
  stats?: LLMStats // LLM usage stats for assistant messages
  toolCalls?: ToolCall[] // Tool calls made during this message (always captured, displayed in verbose mode)
}

export interface AgentThread {
  agentId: string
  messages: ChatMessage[]
  lastActivity: number
  unreadCount: number
  isTyping: boolean
  isInitialized: boolean // Whether the BMAD agent has been loaded in the session
  sessionId?: string // Claude conversation session ID for --resume
  thinkingActivity?: string // What Claude is currently doing (e.g., "Reading file...", "Searching...")
  storyId?: string // The story this thread is working on
  branchName?: string // The branch this thread is working on
}

// Story chat history types (persisted to project and user directories)
export interface StoryChatSession {
  sessionId: string          // UUID for this session
  agentId: string            // e.g., "dev", "pm"
  agentName: string          // Human-readable name
  agentRole?: string         // Agent role (e.g., "PM", "DEV")
  messages: ChatMessage[]    // Conversation messages
  startTime: number
  endTime?: number
  branchName?: string
}

export interface StoryChatHistory {
  storyId: string
  storyTitle: string
  sessions: StoryChatSession[]
  lastUpdated: number
}

// Status change tracking types
export type StatusChangeSource = 'user' | 'external'

export interface StatusChangeEntry {
  id: string                    // UUID
  storyId: string               // e.g., "1-1-place-nand-gates"
  storyTitle: string            // Human-readable title
  epicId: number                // Epic number
  storyNumber: number           // Story number within epic
  oldStatus: StoryStatus
  newStatus: StoryStatus
  timestamp: number             // Unix timestamp
  source: StatusChangeSource    // 'user' (drag-drop) or 'external' (file watcher)
}

// NOTE: BMAD agent definitions are now in src/data/flow-bmm.json and src/data/flow-gds.json
// Use the useWorkflow hook to access agent data

