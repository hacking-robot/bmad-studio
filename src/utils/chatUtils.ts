import { v4 as uuidv4 } from 'uuid'
import { useStore } from '../store'
import type { AgentDefinition } from '../types/flow'
import type { StoryChatHistory, StoryChatSession, ChatMessage } from '../types'

// Map Claude tool names to human-readable activity descriptions
export function getToolActivity(toolName: string, input?: Record<string, unknown>): string {
  const toolMap: Record<string, (input?: Record<string, unknown>) => string> = {
    Read: (i) => i?.file_path ? `Reading ${(i.file_path as string).split('/').pop()}` : 'Reading file',
    Edit: (i) => i?.file_path ? `Editing ${(i.file_path as string).split('/').pop()}` : 'Editing file',
    Write: (i) => i?.file_path ? `Writing ${(i.file_path as string).split('/').pop()}` : 'Writing file',
    Glob: () => 'Searching for files',
    Grep: (i) => i?.pattern ? `Searching for "${i.pattern}"` : 'Searching code',
    Bash: (i) => i?.command ? `Running: ${(i.command as string).split(' ')[0]}` : 'Running command',
    Task: () => 'Launching subagent',
    WebFetch: () => 'Fetching web content',
    WebSearch: (i) => i?.query ? `Searching: "${i.query}"` : 'Searching web',
    TodoWrite: () => 'Updating task list',
    NotebookEdit: () => 'Editing notebook',
    AskUserQuestion: () => 'Preparing question',
    EnterPlanMode: () => 'Planning approach',
    ExitPlanMode: () => 'Finalizing plan',
  }

  const formatter = toolMap[toolName]
  if (formatter) {
    return formatter(input)
  }

  // Handle MCP tools (mcp__*)
  if (toolName.startsWith('mcp__')) {
    return 'Using MCP tool'
  }

  return `Using ${toolName}`
}

// Helper to show system notification for new messages
export function showChatNotification(agent: AgentDefinition, messageContent: string) {
  const notificationsEnabled = useStore.getState().notificationsEnabled
  if (!notificationsEnabled) return

  // Only show if app is not focused
  if (document.hasFocus()) return

  // Show system notification
  const preview = messageContent.length > 100
    ? messageContent.substring(0, 100) + '...'
    : messageContent

  window.fileAPI.showNotification(
    `Message from ${agent.name}`,
    preview || `${agent.name} sent a response`
  )
}

// Debounce utility for saving threads
let saveTimeout: NodeJS.Timeout | null = null
let pendingSave: { projectPath: string; agentId: string; thread: unknown } | null = null

export function debouncedSaveThread(projectPath: string, agentId: string, thread: unknown) {
  if (saveTimeout) clearTimeout(saveTimeout)
  pendingSave = { projectPath, agentId, thread }
  saveTimeout = setTimeout(() => {
    pendingSave = null
    window.chatAPI.saveThread(projectPath, agentId, thread as Parameters<typeof window.chatAPI.saveThread>[2])
  }, 1000)
}

// Flush any pending debounced thread save immediately
export function flushPendingThreadSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  if (pendingSave) {
    const { projectPath, agentId, thread } = pendingSave
    pendingSave = null
    window.chatAPI.saveThread(projectPath, agentId, thread as Parameters<typeof window.chatAPI.saveThread>[2])
  }
}

// Debounce utility for saving story chat history (2s debounce)
let storyChatSaveTimeout: NodeJS.Timeout | null = null
const SESSION_MERGE_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

export async function debouncedSaveStoryChatHistory(
  projectPath: string,
  storyId: string,
  storyTitle: string,
  agentId: string,
  agentName: string,
  agentRole: string,
  messages: ChatMessage[],
  branchName?: string,
  outputFolder?: string
) {
  if (storyChatSaveTimeout) clearTimeout(storyChatSaveTimeout)
  storyChatSaveTimeout = setTimeout(async () => {
    try {
      // Load existing history
      let history: StoryChatHistory | null = await window.chatAPI.loadStoryChatHistory(projectPath, storyId, outputFolder)
      const now = Date.now()

      if (!history) {
        // Create new history
        history = {
          storyId,
          storyTitle,
          sessions: [],
          lastUpdated: now
        }
      }

      // Find the most recent session for this agent
      const recentSession = history.sessions
        .filter(s => s.agentId === agentId)
        .sort((a, b) => (b.endTime || b.startTime) - (a.endTime || a.startTime))[0]

      // Check if we should merge into existing session (within 30 minutes)
      const withinTimeWindow = recentSession &&
        (now - (recentSession.endTime || recentSession.startTime)) < SESSION_MERGE_THRESHOLD_MS

      // Check if current messages are a continuation of the stored session
      // If stored session has messages not in current thread, chat was cleared - don't merge
      const isContinuation = recentSession && recentSession.messages.length > 0 && messages.length > 0 &&
        recentSession.messages.some(storedMsg =>
          messages.some(currentMsg => currentMsg.id === storedMsg.id)
        )

      const shouldMerge = withinTimeWindow && isContinuation

      if (shouldMerge && recentSession) {
        // Update existing session with current messages (which includes old + new)
        recentSession.messages = messages
        recentSession.endTime = now
        recentSession.branchName = branchName
      } else {
        // Create new session
        const newSession: StoryChatSession = {
          sessionId: uuidv4(),
          agentId,
          agentName,
          agentRole,
          messages,
          startTime: messages.length > 0 ? messages[0].timestamp : now,
          endTime: now,
          branchName
        }
        history.sessions.push(newSession)
      }

      history.lastUpdated = now

      // Save to both locations
      await window.chatAPI.saveStoryChatHistory(projectPath, storyId, history, outputFolder)
    } catch (error) {
      console.error('Failed to save story chat history:', error)
    }
  }, 2000)
}

// Immediate save for story chat history (for orchestrator - no debounce)
export async function saveStoryChatHistoryImmediate(
  projectPath: string,
  storyId: string,
  storyTitle: string,
  agentId: string,
  agentName: string,
  agentRole: string,
  messages: ChatMessage[],
  branchName?: string,
  outputFolder?: string
) {
  try {
    const now = Date.now()
    let history: StoryChatHistory | null = await window.chatAPI.loadStoryChatHistory(projectPath, storyId, outputFolder)

    if (!history) {
      history = {
        storyId,
        storyTitle,
        sessions: [],
        lastUpdated: now
      }
    }

    // Create a new session for this chat
    const newSession: StoryChatSession = {
      sessionId: uuidv4(),
      agentId,
      agentName,
      agentRole,
      messages,
      startTime: messages[0]?.timestamp || now,
      endTime: now,
      branchName
    }
    history.sessions.push(newSession)
    history.lastUpdated = now

    await window.chatAPI.saveStoryChatHistory(projectPath, storyId, history, outputFolder)
  } catch (error) {
    console.error('Failed to save story chat history:', error)
  }
}
