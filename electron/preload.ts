import { contextBridge, ipcRenderer } from 'electron'

export type ProjectType = 'bmm' | 'gds'

export interface AgentHistoryEntry {
  id: string
  storyId: string
  storyTitle: string
  command: string
  status: 'running' | 'completed' | 'error' | 'interrupted'
  output: string[]
  startTime: number
  endTime?: number
  exitCode?: number
}

export interface RecentProject {
  path: string
  projectType: ProjectType
  name: string
  outputFolder?: string
  developerMode?: 'ai' | 'human'
}

export type AITool = 'claude-code' | 'custom-endpoint' | 'cursor' | 'windsurf' | 'roo-code' | 'aider'
export type ClaudeModel = 'sonnet' | 'opus'

// Custom Anthropic-compatible endpoint configuration
export interface CustomEndpointConfig {
  name: string
  baseUrl: string
  apiKey: string
  modelName: string
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  isMaximized?: boolean
}

// Human Review checklist types (must match src/types/index.ts)
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

// Status change tracking types
export type StoryStatus = 'backlog' | 'ready-for-dev' | 'in-progress' | 'review' | 'human-review' | 'done' | 'optional'
export type StatusChangeSource = 'user' | 'external'

export interface StatusChangeEntry {
  id: string
  storyId: string
  storyTitle: string
  oldStatus: StoryStatus
  newStatus: StoryStatus
  timestamp: number
  source: StatusChangeSource
}

export interface AppSettings {
  themeMode: 'light' | 'dark'
  aiTool: AITool
  claudeModel: ClaudeModel
  customEndpoint: CustomEndpointConfig | null
  projectPath: string | null
  projectType: ProjectType | null
  outputFolder: string
  selectedEpicId: number | null
  collapsedColumnsByEpic: Record<string, string[]>
  agentHistory?: AgentHistoryEntry[]
  recentProjects: RecentProject[]
  windowBounds?: WindowBounds
  notificationsEnabled: boolean
  verboseMode: boolean
  storyOrder: Record<string, Record<string, string[]>> // { [epicId]: { [status]: [storyIds...] } }
  // Git settings
  baseBranch: 'main' | 'master' | 'develop'
  allowDirectEpicMerge: boolean // Allow merging epic branches to base without PR
  bmadInGitignore: boolean // When true, bmad folders are gitignored so branch restrictions are relaxed
  bmadInGitignoreUserSet: boolean // When true, user has manually set bmadInGitignore (don't auto-detect)
  enableEpicBranches: boolean // When true, show epic branch features
  disableGitBranching: boolean // When true, bypass all branch restrictions and hide branch UI
  fullCycleReviewCount: number // 0-5, how many code review rounds in full cycle
  developerMode: 'ai' | 'human' // Development mode (ai = standard, human = modified workflows)
  // Human Review feature
  enableHumanReviewColumn: boolean
  humanReviewChecklist: HumanReviewChecklistItem[]
  humanReviewStates: Record<string, StoryReviewState> // keyed by storyId
  humanReviewStories: string[] // story IDs currently in human-review (app-level status override)
  // Chat settings
  maxThreadMessages: number // Max messages per chat thread (default 100)
  // Status history
  statusHistoryByStory: Record<string, StatusChangeEntry[]>
  globalStatusHistory: StatusChangeEntry[]
  lastViewedStatusHistoryAt: number
}

export interface FileAPI {
  selectDirectory: () => Promise<{ path?: string; projectType?: ProjectType; isNewProject?: boolean; outputFolder?: string; error?: string } | null>
  readFile: (filePath: string) => Promise<{ content?: string; error?: string }>
  listDirectory: (dirPath: string) => Promise<{ files?: string[]; dirs?: string[]; error?: string }>
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: Partial<AppSettings>) => Promise<boolean>
  startWatching: (projectPath: string, projectType: ProjectType, outputFolder?: string) => Promise<boolean>
  stopWatching: () => Promise<boolean>
  updateStoryStatus: (filePath: string, newStatus: string) => Promise<{ success: boolean; error?: string }>
  toggleStoryTask: (filePath: string, taskIndex: number, subtaskIndex: number) => Promise<{ success: boolean; error?: string }>
  showNotification: (title: string, body: string) => Promise<void>
  checkBmadInGitignore: (projectPath: string, outputFolder?: string) => Promise<{ inGitignore: boolean; error?: string }>
  scanBmad: (projectPath: string) => Promise<unknown | null>
  onFilesChanged: (callback: () => void) => () => void
  onShowKeyboardShortcuts: (callback: () => void) => () => void
}

const fileAPI: FileAPI = {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  listDirectory: (dirPath: string) => ipcRenderer.invoke('list-directory', dirPath),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('save-settings', settings),
  startWatching: (projectPath: string, projectType: ProjectType, outputFolder?: string) => ipcRenderer.invoke('start-watching', projectPath, projectType, outputFolder),
  stopWatching: () => ipcRenderer.invoke('stop-watching'),
  updateStoryStatus: (filePath: string, newStatus: string) => ipcRenderer.invoke('update-story-status', filePath, newStatus),
  toggleStoryTask: (filePath: string, taskIndex: number, subtaskIndex: number) => ipcRenderer.invoke('toggle-story-task', filePath, taskIndex, subtaskIndex),
  showNotification: (title: string, body: string) => ipcRenderer.invoke('show-notification', title, body),
  checkBmadInGitignore: (projectPath: string, outputFolder?: string) => ipcRenderer.invoke('check-bmad-in-gitignore', projectPath, outputFolder),
  scanBmad: (projectPath: string) => ipcRenderer.invoke('scan-bmad', projectPath),
  onFilesChanged: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('files-changed', listener)
    // Return cleanup function
    return () => ipcRenderer.removeListener('files-changed', listener)
  },
  onShowKeyboardShortcuts: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('show-keyboard-shortcuts', listener)
    return () => ipcRenderer.removeListener('show-keyboard-shortcuts', listener)
  }
}

contextBridge.exposeInMainWorld('fileAPI', fileAPI)

// Agent API types
export interface AgentInfo {
  id: string
  storyId: string
  storyTitle: string
  command: string
  status: 'running' | 'completed' | 'error'
  startTime: number
  pid: number | undefined
}

export interface AgentOutputEvent {
  agentId: string
  type: 'stdout' | 'stderr'
  chunk: string
  timestamp: number
}

export interface AgentExitEvent {
  agentId: string
  code: number | null
  signal: string | null
  timestamp: number
}

export interface AgentErrorEvent {
  agentId: string
  error: string
  timestamp: number
}

export interface AgentSpawnedEvent {
  agentId: string
  storyId: string
  storyTitle: string
  command: string
  pid: number | undefined
  timestamp: number
}

export interface AgentAPI {
  spawnAgent: (options: {
    storyId: string
    storyTitle: string
    projectPath: string
    initialPrompt: string
  }) => Promise<{ success: boolean; agentId?: string; error?: string }>
  sendInput: (agentId: string, input: string) => Promise<boolean>
  killAgent: (agentId: string) => Promise<boolean>
  getAgents: () => Promise<AgentInfo[]>
  getAgent: (agentId: string) => Promise<AgentInfo | null>
  getAgentForStory: (storyId: string) => Promise<string | null>
  detectProjectType: (projectPath: string) => Promise<ProjectType>
  // Agent output file management
  appendOutput: (agentId: string, lines: string[]) => Promise<boolean>
  loadOutput: (agentId: string) => Promise<string[]>
  deleteOutput: (agentId: string) => Promise<boolean>
  listOutputs: () => Promise<string[]>
  // Event listeners
  onAgentOutput: (callback: (event: AgentOutputEvent) => void) => () => void
  onAgentExit: (callback: (event: AgentExitEvent) => void) => () => void
  onAgentError: (callback: (event: AgentErrorEvent) => void) => () => void
  onAgentSpawned: (callback: (event: AgentSpawnedEvent) => void) => () => void
}

const agentAPI: AgentAPI = {
  spawnAgent: (options) => ipcRenderer.invoke('spawn-agent', options),
  sendInput: (agentId, input) => ipcRenderer.invoke('send-agent-input', agentId, input),
  killAgent: (agentId) => ipcRenderer.invoke('kill-agent', agentId),
  getAgents: () => ipcRenderer.invoke('get-agents'),
  getAgent: (agentId) => ipcRenderer.invoke('get-agent', agentId),
  getAgentForStory: (storyId) => ipcRenderer.invoke('get-agent-for-story', storyId),
  detectProjectType: (projectPath) => ipcRenderer.invoke('detect-project-type', projectPath),
  // Agent output file management
  appendOutput: (agentId, lines) => ipcRenderer.invoke('append-agent-output', agentId, lines),
  loadOutput: (agentId) => ipcRenderer.invoke('load-agent-output', agentId),
  deleteOutput: (agentId) => ipcRenderer.invoke('delete-agent-output', agentId),
  listOutputs: () => ipcRenderer.invoke('list-agent-outputs'),
  // Event listeners
  onAgentOutput: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: AgentOutputEvent) => callback(data)
    ipcRenderer.on('agent:output', listener)
    return () => ipcRenderer.removeListener('agent:output', listener)
  },
  onAgentExit: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: AgentExitEvent) => callback(data)
    ipcRenderer.on('agent:exit', listener)
    return () => ipcRenderer.removeListener('agent:exit', listener)
  },
  onAgentError: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: AgentErrorEvent) => callback(data)
    ipcRenderer.on('agent:error', listener)
    return () => ipcRenderer.removeListener('agent:error', listener)
  },
  onAgentSpawned: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: AgentSpawnedEvent) => callback(data)
    ipcRenderer.on('agent:spawned', listener)
    return () => ipcRenderer.removeListener('agent:spawned', listener)
  }
}

contextBridge.exposeInMainWorld('agentAPI', agentAPI)

// Git API types
export interface GitChangedFile {
  status: 'A' | 'M' | 'D' | 'R' | 'C'
  path: string
  mtime: number | null
  lastCommitTime: number | null
}

export interface GitBranchActivity {
  isOnBranch: boolean
  hasRecentFileChanges: boolean
  lastCommitTime: number | null
  hasRecentCommit: boolean
  isActive: boolean
}

export interface GitCommit {
  hash: string
  author: string
  timestamp: number
  subject: string
}

export interface GitCommitFile {
  status: 'A' | 'M' | 'D' | 'R' | 'C'
  path: string
}

export interface GitAPI {
  getCurrentBranch: (projectPath: string) => Promise<{ branch?: string; error?: string }>
  listBranches: (projectPath: string) => Promise<{ branches: string[]; error?: string }>
  checkoutBranch: (projectPath: string, branchName: string) => Promise<{ success: boolean; error?: string }>
  createBranch: (projectPath: string, branchName: string, fromBranch?: string) => Promise<{ success: boolean; error?: string; alreadyExists?: boolean }>
  branchExists: (projectPath: string, branchName: string) => Promise<{ exists: boolean }>
  hasChanges: (projectPath: string) => Promise<{ hasChanges: boolean; error?: string }>
  commit: (projectPath: string, message: string, noVerify?: boolean) => Promise<{ success: boolean; error?: string }>
  getBranchActivity: (projectPath: string, branchName: string) => Promise<GitBranchActivity>
  getDefaultBranch: (projectPath: string) => Promise<{ branch?: string; error?: string }>
  getChangedFiles: (projectPath: string, baseBranch: string, featureBranch?: string) => Promise<{ files?: GitChangedFile[]; mergeBase?: string; error?: string }>
  getFileContent: (projectPath: string, filePath: string, commitOrBranch: string) => Promise<{ content: string }>
  getWorkingFileContent: (projectPath: string, filePath: string) => Promise<{ content: string }>
  getCommitHistory: (projectPath: string, baseBranch: string, featureBranch: string) => Promise<{ commits: GitCommit[]; error?: string }>
  getCommitDiff: (projectPath: string, commitHash: string) => Promise<{ files: GitCommitFile[]; error?: string }>
  getFileAtParent: (projectPath: string, filePath: string, commitHash: string) => Promise<{ content: string }>
  getFileAtCommit: (projectPath: string, filePath: string, commitHash: string) => Promise<{ content: string }>
  isBranchMerged: (projectPath: string, branchToCheck: string, targetBranch: string) => Promise<{ merged: boolean; error?: string }>
  mergeBranch: (projectPath: string, branchToMerge: string) => Promise<{ success: boolean; error?: string; hasConflicts?: boolean }>
}

const gitAPI: GitAPI = {
  getCurrentBranch: (projectPath) => ipcRenderer.invoke('git-current-branch', projectPath),
  listBranches: (projectPath) => ipcRenderer.invoke('git-list-branches', projectPath),
  checkoutBranch: (projectPath, branchName) => ipcRenderer.invoke('git-checkout-branch', projectPath, branchName),
  createBranch: (projectPath, branchName, fromBranch) => ipcRenderer.invoke('git-create-branch', projectPath, branchName, fromBranch),
  branchExists: (projectPath, branchName) => ipcRenderer.invoke('git-branch-exists', projectPath, branchName),
  hasChanges: (projectPath) => ipcRenderer.invoke('git-has-changes', projectPath),
  commit: (projectPath, message, noVerify) => ipcRenderer.invoke('git-commit', projectPath, message, noVerify),
  getBranchActivity: (projectPath, branchName) => ipcRenderer.invoke('git-branch-activity', projectPath, branchName),
  getDefaultBranch: (projectPath) => ipcRenderer.invoke('git-default-branch', projectPath),
  getChangedFiles: (projectPath, baseBranch, featureBranch) => ipcRenderer.invoke('git-changed-files', projectPath, baseBranch, featureBranch),
  getFileContent: (projectPath, filePath, commitOrBranch) => ipcRenderer.invoke('git-file-content', projectPath, filePath, commitOrBranch),
  getWorkingFileContent: (projectPath, filePath) => ipcRenderer.invoke('git-working-file-content', projectPath, filePath),
  getCommitHistory: (projectPath, baseBranch, featureBranch) => ipcRenderer.invoke('git-commit-history', projectPath, baseBranch, featureBranch),
  getCommitDiff: (projectPath, commitHash) => ipcRenderer.invoke('git-commit-diff', projectPath, commitHash),
  getFileAtParent: (projectPath, filePath, commitHash) => ipcRenderer.invoke('git-file-at-parent', projectPath, filePath, commitHash),
  getFileAtCommit: (projectPath, filePath, commitHash) => ipcRenderer.invoke('git-file-at-commit', projectPath, filePath, commitHash),
  isBranchMerged: (projectPath, branchToCheck, targetBranch) => ipcRenderer.invoke('git-is-merged', projectPath, branchToCheck, targetBranch),
  mergeBranch: (projectPath, branchToMerge) => ipcRenderer.invoke('git-merge-branch', projectPath, branchToMerge)
}

contextBridge.exposeInMainWorld('gitAPI', gitAPI)

// Chat API types
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status: 'pending' | 'streaming' | 'complete' | 'error'
}

export interface AgentThread {
  agentId: string
  messages: ChatMessage[]
  lastActivity: number
  unreadCount: number
  isTyping: boolean
  isInitialized: boolean
  sessionId?: string // Claude conversation session ID for --resume
}

export interface ChatOutputEvent {
  agentId: string
  type: 'stdout' | 'stderr'
  chunk: string
  timestamp: number
  isAgentLoad?: boolean
}

export interface ChatExitEvent {
  agentId: string
  code: number | null
  signal: string | null
  error?: string
  timestamp: number
  sessionId?: string // Session ID captured from this conversation
  cancelled?: boolean // True if the message was cancelled by user
}

export interface ChatAgentLoadedEvent {
  agentId: string
  code: number | null
  signal: string | null
  error?: string
  sessionId?: string // Session ID for subsequent messages
  timestamp: number
}

// Story chat history types (persisted to project and user directories)
export interface StoryChatSession {
  sessionId: string
  agentId: string
  agentName: string
  agentRole?: string
  messages: ChatMessage[]
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

export interface ChatAPI {
  // Thread persistence (project-scoped)
  loadThread: (projectPath: string, agentId: string) => Promise<AgentThread | null>
  saveThread: (projectPath: string, agentId: string, thread: AgentThread) => Promise<boolean>
  clearThread: (projectPath: string, agentId: string) => Promise<boolean>
  listThreads: (projectPath: string) => Promise<string[]>
  // Story chat history (persisted to project and user directories)
  saveStoryChatHistory: (projectPath: string, storyId: string, history: StoryChatHistory, outputFolder?: string) => Promise<boolean>
  loadStoryChatHistory: (projectPath: string, storyId: string, outputFolder?: string) => Promise<StoryChatHistory | null>
  listStoryChatHistories: (projectPath: string, outputFolder?: string) => Promise<string[]>
  // Agent loading - loads the BMAD agent, returns session ID via event
  loadAgent: (options: {
    agentId: string
    projectPath: string
    projectType: 'bmm' | 'gds'
    tool?: AITool // AI tool to use (defaults to claude-code)
    model?: ClaudeModel // Claude model to use (only for claude-code)
    customEndpoint?: CustomEndpointConfig | null // Custom endpoint config (for custom-endpoint tool)
    agentCommand?: string // Pre-resolved agent command from scan data
  }) => Promise<{ success: boolean; error?: string }>
  // Message sending - spawns new process per message, uses --resume for conversation continuity
  sendMessage: (options: {
    agentId: string
    projectPath: string
    message: string
    sessionId?: string // Session ID from previous response for --resume
    tool?: AITool // AI tool to use (defaults to claude-code)
    model?: ClaudeModel // Claude model to use (only for claude-code)
    customEndpoint?: CustomEndpointConfig | null // Custom endpoint config (for custom-endpoint tool)
  }) => Promise<{ success: boolean; error?: string }>
  // Cancel an ongoing message/agent load
  cancelMessage: (agentId: string) => Promise<boolean>
  // Check if agent has a running process (for crash detection)
  isAgentRunning: (agentId: string) => Promise<boolean>
  // Event listeners
  onChatOutput: (callback: (event: ChatOutputEvent) => void) => () => void
  onChatExit: (callback: (event: ChatExitEvent) => void) => () => void
  onAgentLoaded: (callback: (event: ChatAgentLoadedEvent) => void) => () => void
}

const chatAPI: ChatAPI = {
  loadThread: (projectPath, agentId) => ipcRenderer.invoke('load-chat-thread', projectPath, agentId),
  saveThread: (projectPath, agentId, thread) => ipcRenderer.invoke('save-chat-thread', projectPath, agentId, thread),
  clearThread: (projectPath, agentId) => ipcRenderer.invoke('clear-chat-thread', projectPath, agentId),
  listThreads: (projectPath) => ipcRenderer.invoke('list-chat-threads', projectPath),
  // Story chat history
  saveStoryChatHistory: (projectPath, storyId, history, outputFolder) => ipcRenderer.invoke('save-story-chat-history', projectPath, storyId, history, outputFolder),
  loadStoryChatHistory: (projectPath, storyId, outputFolder) => ipcRenderer.invoke('load-story-chat-history', projectPath, storyId, outputFolder),
  listStoryChatHistories: (projectPath, outputFolder) => ipcRenderer.invoke('list-story-chat-histories', projectPath, outputFolder),
  // Agent loading
  loadAgent: (options) => ipcRenderer.invoke('chat-load-agent', options),
  // Message sending
  sendMessage: (options) => ipcRenderer.invoke('chat-send-message', options),
  // Cancel message
  cancelMessage: (agentId) => ipcRenderer.invoke('chat-cancel-message', agentId),
  // Check if agent is running
  isAgentRunning: (agentId) => ipcRenderer.invoke('chat-is-agent-running', agentId),
  // Event listeners
  onChatOutput: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ChatOutputEvent) => {
      callback(data)
    }
    ipcRenderer.on('chat:output', listener)
    return () => ipcRenderer.removeListener('chat:output', listener)
  },
  onChatExit: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ChatExitEvent) => {
      callback(data)
    }
    ipcRenderer.on('chat:exit', listener)
    return () => ipcRenderer.removeListener('chat:exit', listener)
  },
  onAgentLoaded: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ChatAgentLoadedEvent) => {
      callback(data)
    }
    ipcRenderer.on('chat:agent-loaded', listener)
    return () => ipcRenderer.removeListener('chat:agent-loaded', listener)
  }
}

contextBridge.exposeInMainWorld('chatAPI', chatAPI)

// CLI Tool API types
export interface CLIDetectionResult {
  available: boolean
  path: string | null
  version: string | null
  error: string | null
}

export interface EnvCheckItem {
  id: string
  label: string
  status: 'checking' | 'ok' | 'warning' | 'error'
  version?: string | null
  detail?: string
}

export interface CLIAPI {
  detectTool: (toolId: AITool) => Promise<CLIDetectionResult>
  detectAllTools: () => Promise<Record<string, CLIDetectionResult>>
  clearCache: () => Promise<void>
  checkEnvironment: () => Promise<{ items: EnvCheckItem[] }>
}

const cliAPI: CLIAPI = {
  detectTool: (toolId) => ipcRenderer.invoke('cli-detect-tool', toolId),
  detectAllTools: () => ipcRenderer.invoke('cli-detect-all-tools'),
  clearCache: () => ipcRenderer.invoke('cli-clear-cache'),
  checkEnvironment: () => ipcRenderer.invoke('check-environment')
}

contextBridge.exposeInMainWorld('cliAPI', cliAPI)

// Wizard API types
export interface WizardInstallOutputEvent {
  type: 'stdout' | 'stderr'
  chunk: string
}

export interface WizardInstallCompleteEvent {
  success: boolean
  code?: number | null
  signal?: string | null
  error?: string
}

export interface WizardFileChangedEvent {
  filename: string
}

export interface WizardAPI {
  install: (projectPath: string, useAlpha?: boolean, outputFolder?: string, modules?: string[]) => Promise<{ success: boolean; error?: string }>
  onInstallOutput: (callback: (event: WizardInstallOutputEvent) => void) => () => void
  onInstallComplete: (callback: (event: WizardInstallCompleteEvent) => void) => () => void
  startWatching: (projectPath: string, outputFolder?: string) => Promise<boolean>
  stopWatching: () => Promise<boolean>
  onFileChanged: (callback: (event: WizardFileChangedEvent) => void) => () => void
  checkFileExists: (filePath: string) => Promise<boolean>
  checkDirHasPrefix: (dirPath: string, prefix: string) => Promise<boolean>
  saveState: (projectPath: string, state: unknown, outputFolder?: string) => Promise<boolean>
  loadState: (projectPath: string, outputFolder?: string) => Promise<unknown | null>
  deleteState: (projectPath: string, outputFolder?: string) => Promise<boolean>
  selectDirectoryAny: () => Promise<{ path: string } | null>
  createProjectDirectory: (parentPath: string, projectName: string) => Promise<{ success: boolean; path?: string; error?: string }>
  writeProjectFiles: (projectPath: string, files: { relativePath: string; content: string }[]) => Promise<{ success: boolean; written: number; error?: string }>
  appendConfigFields: (projectPath: string, fields: Record<string, string>) => Promise<{ success: boolean; updated?: number; error?: string }>
}

const wizardAPI: WizardAPI = {
  install: (projectPath, useAlpha, outputFolder, modules) => ipcRenderer.invoke('bmad-install', projectPath, useAlpha, outputFolder, modules),
  onInstallOutput: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: WizardInstallOutputEvent) => callback(data)
    ipcRenderer.on('bmad:install-output', listener)
    return () => ipcRenderer.removeListener('bmad:install-output', listener)
  },
  onInstallComplete: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: WizardInstallCompleteEvent) => callback(data)
    ipcRenderer.on('bmad:install-complete', listener)
    return () => ipcRenderer.removeListener('bmad:install-complete', listener)
  },
  startWatching: (projectPath, outputFolder) => ipcRenderer.invoke('wizard-start-watching', projectPath, outputFolder),
  stopWatching: () => ipcRenderer.invoke('wizard-stop-watching'),
  onFileChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: WizardFileChangedEvent) => callback(data)
    ipcRenderer.on('wizard:file-changed', listener)
    return () => ipcRenderer.removeListener('wizard:file-changed', listener)
  },
  checkFileExists: (filePath) => ipcRenderer.invoke('check-file-exists', filePath),
  checkDirHasPrefix: (dirPath, prefix) => ipcRenderer.invoke('check-dir-has-prefix', dirPath, prefix),
  saveState: (projectPath, state, outputFolder) => ipcRenderer.invoke('save-wizard-state', projectPath, state, outputFolder),
  loadState: (projectPath, outputFolder) => ipcRenderer.invoke('load-wizard-state', projectPath, outputFolder),
  deleteState: (projectPath, outputFolder) => ipcRenderer.invoke('delete-wizard-state', projectPath, outputFolder),
  selectDirectoryAny: () => ipcRenderer.invoke('select-directory-any'),
  createProjectDirectory: (parentPath, projectName) => ipcRenderer.invoke('create-project-directory', parentPath, projectName),
  writeProjectFiles: (projectPath, files) => ipcRenderer.invoke('write-project-files', projectPath, files),
  appendConfigFields: (projectPath, fields) => ipcRenderer.invoke('append-config-fields', projectPath, fields)
}

contextBridge.exposeInMainWorld('wizardAPI', wizardAPI)

// Updater API types
export interface UpdaterStatusEvent {
  status: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'error' | 'dev-mode'
  version?: string
  percent?: number
  message?: string
}

export interface UpdaterAPI {
  checkForUpdates: () => Promise<{ success?: boolean; status?: string; error?: string }>
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>
  installUpdate: () => void
  getAppVersion: () => Promise<string>
  onUpdateStatus: (callback: (event: UpdaterStatusEvent) => void) => () => void
}

const updaterAPI: UpdaterAPI = {
  checkForUpdates: () => ipcRenderer.invoke('updater-check'),
  downloadUpdate: () => ipcRenderer.invoke('updater-download'),
  installUpdate: () => ipcRenderer.invoke('updater-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: UpdaterStatusEvent) => callback(data)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  }
}

contextBridge.exposeInMainWorld('updaterAPI', updaterAPI)

// Cost tracking API
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

export interface CostAPI {
  appendCost: (projectPath: string, entry: ProjectCostEntry, outputFolder?: string) => Promise<boolean>
  loadCosts: (projectPath: string, outputFolder?: string) => Promise<ProjectCostEntry[]>
}

const costAPI: CostAPI = {
  appendCost: (projectPath, entry, outputFolder) => ipcRenderer.invoke('append-project-cost', projectPath, entry, outputFolder),
  loadCosts: (projectPath, outputFolder) => ipcRenderer.invoke('load-project-costs', projectPath, outputFolder)
}

contextBridge.exposeInMainWorld('costAPI', costAPI)

declare global {
  interface Window {
    fileAPI: FileAPI
    agentAPI: AgentAPI
    gitAPI: GitAPI
    chatAPI: ChatAPI
    cliAPI: CLIAPI
    wizardAPI: WizardAPI
    updaterAPI: UpdaterAPI
    costAPI: CostAPI
  }
}
