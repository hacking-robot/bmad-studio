import { useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react'
import { useStore } from '../store'
import { useWorkflow } from './useWorkflow'
import { showChatNotification, debouncedSaveStoryChatHistory } from '../utils/chatUtils'
import type { ProjectCostEntry } from '../types'

// Completion callback type
type CompletionCallback = (success: boolean, sessionId?: string) => void

// Store for completion callbacks (accessible outside React)
const completionCallbacks = new Map<string, CompletionCallback>()

// Register a completion callback for an agent
export function registerCompletionCallback(agentId: string, callback: CompletionCallback) {
  completionCallbacks.set(agentId, callback)
}

// Unregister a completion callback
export function unregisterCompletionCallback(agentId: string) {
  completionCallbacks.delete(agentId)
}

// Per-agent loading state (thin — the backend owns the full parsing state)
interface AgentLoadingState {
  pendingMessage: { content: string; assistantMsgId: string; userMsgId?: string } | null
  isLoadingAgent: boolean
}

// Global handler hook — subscribes to semantic events from the backend ChatStateManager
// and mirrors state into Zustand. No stream-JSON parsing here.
export function useChatMessageHandler() {
  const addChatMessage = useStore((state) => state.addChatMessage)
  const updateChatMessage = useStore((state) => state.updateChatMessage)
  const removeChatMessage = useStore((state) => state.removeChatMessage)
  const setChatTyping = useStore((state) => state.setChatTyping)
  const setChatActivity = useStore((state) => state.setChatActivity)
  const incrementUnread = useStore((state) => state.incrementUnread)
  const setChatSessionId = useStore((state) => state.setChatSessionId)

  const { agents } = useWorkflow()

  // Thin loading-state tracker (pending messages for agent-load flow)
  const loadingStatesRef = useRef<Map<string, AgentLoadingState>>(new Map())

  const getLoadingState = useCallback((agentId: string): AgentLoadingState => {
    let s = loadingStatesRef.current.get(agentId)
    if (!s) {
      s = { pendingMessage: null, isLoadingAgent: false }
      loadingStatesRef.current.set(agentId, s)
    }
    return s
  }, [])

  // Keep refs for volatile values so IPC handlers always read latest
  const agentsRef = useRef(agents)
  agentsRef.current = agents
  const projectPathRef = useRef(useStore.getState().projectPath)
  const outputFolderRef = useRef(useStore.getState().outputFolder)

  // Track projectPath/outputFolder changes via store subscription
  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      projectPathRef.current = state.projectPath
      outputFolderRef.current = state.outputFolder
    })
    return unsub
  }, [])

  // Save story chat history (separate concern from thread persistence — stories have their own save path)
  const saveStoryChatHistoryForAgent = useCallback((agentId: string) => {
    const thread = useStore.getState().chatThreads[agentId]
    if (!thread || thread.messages.length === 0) return
    const currentProjectPath = projectPathRef.current
    if (!currentProjectPath) return

    if (thread.storyId) {
      const agent = agentsRef.current.find((a) => a.id === agentId)
      if (agent) {
        const stories = useStore.getState().stories
        const story = stories.find(s => s.id === thread.storyId)
        debouncedSaveStoryChatHistory(
          currentProjectPath, thread.storyId,
          story?.title || thread.storyId,
          agentId, agent.name, agent.role,
          thread.messages, thread.branchName,
          outputFolderRef.current
        )
      }
    }
  }, [])

  // Subscribe to semantic events from the backend
  useEffect(() => {
    const updateBackgroundChatThread = useStore.getState().updateBackgroundChatThread

    // Helper: check if event is for the current foreground project
    const isCurrentProject = (projectPath: string): boolean =>
      projectPath === useStore.getState().projectPath

    // Helper: check if event is for a background project
    const isBackgroundProject = (projectPath: string): boolean =>
      projectPath in useStore.getState().backgroundProjects

    // --- Text streaming ---
    const unsubTextDelta = window.chatAPI.onTextDelta((event) => {
      if (!isCurrentProject(event.projectPath)) {
        // Route to background project if it exists
        if (isBackgroundProject(event.projectPath)) {
          updateBackgroundChatThread(event.projectPath, event.agentId, (thread) => {
            const msgExists = thread.messages.some(m => m.id === event.messageId)
            if (!msgExists) {
              return {
                ...thread,
                messages: [...thread.messages, {
                  id: event.messageId,
                  role: 'assistant' as const,
                  content: event.fullContent,
                  timestamp: Date.now(),
                  status: 'streaming' as const,
                }],
                lastActivity: Date.now(),
              }
            }
            return {
              ...thread,
              messages: thread.messages.map(m =>
                m.id === event.messageId ? { ...m, content: event.fullContent, status: 'streaming' as const } : m
              ),
            }
          })
        }
        return
      }

      // Ensure the message exists in Zustand. The backend emits events with message IDs;
      // we create messages lazily. If the message ID doesn't exist yet, create it.
      const thread = useStore.getState().chatThreads[event.agentId]
      const msgExists = thread?.messages.some(m => m.id === event.messageId)
      if (!msgExists) {
        addChatMessage(event.agentId, {
          id: event.messageId,
          role: 'assistant',
          content: event.fullContent,
          timestamp: Date.now(),
          status: 'streaming',
        })
      } else {
        updateChatMessage(event.agentId, event.messageId, {
          content: event.fullContent,
          status: 'streaming',
        })
      }
    })

    // --- Tool use ---
    const unsubToolUse = window.chatAPI.onToolUse((event) => {
      if (!isCurrentProject(event.projectPath)) {
        if (isBackgroundProject(event.projectPath)) {
          updateBackgroundChatThread(event.projectPath, event.agentId, (thread) => ({
            ...thread,
            thinkingActivity: event.toolSummary,
            messages: thread.messages.map(m =>
              m.id === event.messageId ? {
                ...m,
                toolCalls: [...(m.toolCalls || []), { name: event.toolName, summary: event.toolSummary, input: event.toolInput }],
                status: 'complete' as const,
              } : m
            ),
          }))
        }
        return
      }
      setChatActivity(event.agentId, event.toolSummary)

      // Attach tool call to message
      const thread = useStore.getState().chatThreads[event.agentId]
      const msg = thread?.messages.find(m => m.id === event.messageId)
      if (msg) {
        const existing = msg.toolCalls || []
        updateChatMessage(event.agentId, event.messageId, {
          toolCalls: [...existing, {
            name: event.toolName,
            summary: event.toolSummary,
            input: event.toolInput,
          }],
          status: 'complete', // mark complete when tool starts (message text is done)
        })
      }
    })

    // --- Message complete (result with stats) ---
    const unsubMessageComplete = window.chatAPI.onMessageComplete((event) => {
      if (!isCurrentProject(event.projectPath)) {
        if (isBackgroundProject(event.projectPath)) {
          updateBackgroundChatThread(event.projectPath, event.agentId, (thread) => ({
            ...thread,
            messages: thread.messages.map(m =>
              m.id === event.messageId ? { ...m, status: 'complete' as const, stats: event.stats } : m
            ),
            unreadCount: thread.unreadCount + 1,
          }))
        }
        return
      }
      const { agentId, messageId, stats, cost } = event

      updateChatMessage(agentId, messageId, { status: 'complete', stats })
      incrementUnread(agentId)

      // Notification
      const agent = agentsRef.current.find(a => a.id === agentId)
      if (useStore.getState().selectedChatAgent !== agentId && agent) {
        const thread = useStore.getState().chatThreads[agentId]
        const msg = thread?.messages.find(m => m.id === messageId)
        showChatNotification(agent, msg?.content || '')
      }

      saveStoryChatHistoryForAgent(agentId)

      // Cost tracking
      if (cost && cost > 0) {
        const { projectPath: costProjectPath, outputFolder: costOutputFolder, addToProjectCostTotal } = useStore.getState()
        if (costProjectPath) {
          const thread = useStore.getState().chatThreads[agentId]
          const costEntry: ProjectCostEntry = {
            id: `cost-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            agentId,
            storyId: thread?.storyId,
            messageId,
            model: stats?.model || 'unknown',
            inputTokens: stats?.inputTokens || 0,
            outputTokens: stats?.outputTokens || 0,
            cacheReadTokens: stats?.cacheReadTokens,
            cacheWriteTokens: stats?.cacheWriteTokens,
            totalCostUsd: cost,
            durationMs: stats?.durationMs,
          }
          window.costAPI.appendCost(costProjectPath, costEntry, costOutputFolder)
          addToProjectCostTotal(cost)
        }
      }
    })

    // --- Message discard (empty placeholder — tool-only turn with no text) ---
    const unsubMessageDiscard = window.chatAPI.onMessageDiscard((event) => {
      if (!isCurrentProject(event.projectPath)) {
        if (isBackgroundProject(event.projectPath)) {
          updateBackgroundChatThread(event.projectPath, event.agentId, (thread) => ({
            ...thread,
            messages: thread.messages.filter(m => m.id !== event.messageId),
          }))
        }
        return
      }
      removeChatMessage(event.agentId, event.messageId)
    })

    // --- Agent ready (agent load succeeded) ---
    const unsubAgentReady = window.chatAPI.onAgentReady((event) => {
      const isCurrent = isCurrentProject(event.projectPath)
      const isBackground = !isCurrent && isBackgroundProject(event.projectPath)

      if (!isCurrent && !isBackground) {
        // Event for unknown project — likely a race where projectPath changed during agent load.
        // Check if there's a pending message that would be orphaned.
        const loadState = loadingStatesRef.current.get(event.agentId)
        console.warn('[useChatMessageHandler] agent-ready for unknown project:', {
          eventPath: event.projectPath,
          storePath: useStore.getState().projectPath,
          agentId: event.agentId,
          hasPending: !!loadState?.pendingMessage,
        })
        // Treat as current project — the pending message was set by the current ChatThread
        if (loadState?.pendingMessage) {
          console.log('[useChatMessageHandler] Recovering orphaned pending message for agent:', event.agentId)
        } else {
          // No pending message — nothing to do
          if (loadState) loadState.isLoadingAgent = false
          return
        }
      }

      if (isBackground) {
          updateBackgroundChatThread(event.projectPath, event.agentId, (thread) => ({
            ...thread,
            sessionId: event.sessionId,
            isInitialized: true,
          }))

          // Clear renderer-side pending message — backend auto-sends via loadAgent options.
          // No fallback send needed; the backend handles all failure cases via handleExit.
          const loadState = loadingStatesRef.current.get(event.agentId)
          if (loadState?.pendingMessage) {
            loadState.pendingMessage = null
            loadState.isLoadingAgent = false
          }
        return
      }
      const { agentId, sessionId } = event

      setChatSessionId(agentId, sessionId)
      setChatActivity(agentId, undefined)

      const loadState = getLoadingState(agentId)

      // Clear renderer-side pending message — backend auto-sends via loadAgent options.
      // No fallback send needed; the backend handles all failure cases via handleExit.
      if (loadState.pendingMessage) {
        loadState.pendingMessage = null
      }
      loadState.isLoadingAgent = false
    })

    // --- Agent exit ---
    const unsubAgentExit = window.chatAPI.onAgentExit((event) => {
      if (!isCurrentProject(event.projectPath)) {
        if (!isBackgroundProject(event.projectPath)) {
          // Event for unknown project — likely a project path race condition.
          // Force-clear typing for this agent to prevent "thinking forever".
          console.warn('[useChatMessageHandler] agent-exit for unknown project:', {
            eventPath: event.projectPath,
            storePath: useStore.getState().projectPath,
            agentId: event.agentId,
          })
          setChatTyping(event.agentId, false)
          setChatActivity(event.agentId, undefined)
          const loadState = loadingStatesRef.current.get(event.agentId)
          if (loadState) {
            loadState.pendingMessage = null
            loadState.isLoadingAgent = false
          }
        }
        if (isBackgroundProject(event.projectPath)) {
          updateBackgroundChatThread(event.projectPath, event.agentId, (thread) => {
            const finalStatus = (event.code === 0 || event.code === null) ? 'complete' as const : 'error' as const
            return {
              ...thread,
              isTyping: false,
              thinkingActivity: undefined,
              sessionId: event.sessionId || thread.sessionId,
              messages: thread.messages.map(m => {
                if (m.status === 'pending' || m.status === 'streaming') {
                  const updates: Partial<typeof m> = { status: finalStatus }
                  if (!m.content && finalStatus === 'error') {
                    updates.content = event.error || '*[Agent process exited with no response]*'
                  }
                  return { ...m, ...updates }
                }
                return m
              }),
            }
          })
        }
        // Fire completion callback even for background projects
        const callback = completionCallbacks.get(event.agentId)
        if (callback) {
          callback(event.code === 0 && !event.cancelled, event.sessionId)
        }
        return
      }
      const { agentId, sessionId, code, cancelled } = event

      setChatTyping(agentId, false)

      if (sessionId) {
        const existingThread = useStore.getState().chatThreads[agentId]
        if (existingThread?.isInitialized !== false) {
          setChatSessionId(agentId, sessionId)
        }
      }

      // Handle failed agent load with pending message
      const loadState = getLoadingState(agentId)
      if (loadState.pendingMessage && code !== 0) {
        const { assistantMsgId } = loadState.pendingMessage
        loadState.pendingMessage = null
        loadState.isLoadingAgent = false
        updateChatMessage(agentId, assistantMsgId, {
          content: event.error || 'Failed to load agent',
          status: 'error',
        })
        const callback = completionCallbacks.get(agentId)
        if (callback) callback(false)
        return
      }

      // Finalize any pending/streaming messages in the thread
      const thread = useStore.getState().chatThreads[agentId]
      if (thread) {
        const finalStatus = (code === 0 || code === null) ? 'complete' as const : 'error' as const
        for (const msg of thread.messages) {
          if (msg.status === 'pending' || msg.status === 'streaming') {
            const updates: Partial<typeof msg> = { status: finalStatus }
            // If the message has no content and the process failed, show an error message
            if (!msg.content && finalStatus === 'error') {
              updates.content = event.error || '*[Agent process exited with no response]*'
            }
            updateChatMessage(agentId, msg.id, updates)
          }
        }
      }

      // Increment unread for the last message if it exists
      const lastMsg = thread?.messages[thread.messages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.status !== 'complete') {
        incrementUnread(agentId)
      }

      saveStoryChatHistoryForAgent(agentId)

      // Notify completion callback
      const callback = completionCallbacks.get(agentId)
      if (callback) {
        callback(code === 0 && !cancelled, sessionId)
      }
    })

    // --- Typing ---
    const unsubTyping = window.chatAPI.onTyping((event) => {
      if (!isCurrentProject(event.projectPath)) {
        if (isBackgroundProject(event.projectPath)) {
          updateBackgroundChatThread(event.projectPath, event.agentId, (thread) => ({
            ...thread,
            isTyping: event.isTyping,
            thinkingActivity: event.isTyping ? thread.thinkingActivity : undefined,
          }))
        }
        return
      }
      setChatTyping(event.agentId, event.isTyping)
    })

    // --- Activity ---
    const unsubActivity = window.chatAPI.onActivity((event) => {
      if (!isCurrentProject(event.projectPath)) {
        if (isBackgroundProject(event.projectPath)) {
          updateBackgroundChatThread(event.projectPath, event.agentId, (thread) => ({
            ...thread,
            thinkingActivity: event.activity || undefined,
          }))
        }
        return
      }
      setChatActivity(event.agentId, event.activity || undefined)
    })

    // --- Wizard step ---
    const unsubWizardStep = window.chatAPI.onWizardStep((event) => {
      const { projectWizard, setWizardActiveSubStep } = useStore.getState()
      if (projectWizard.isActive) {
        setWizardActiveSubStep(event.stepNumber)
      }
    })

    return () => {
      unsubTextDelta()
      unsubToolUse()
      unsubMessageComplete()
      unsubMessageDiscard()
      unsubAgentReady()
      unsubAgentExit()
      unsubTyping()
      unsubActivity()
      unsubWizardStep()
    }
  }, [
    addChatMessage, updateChatMessage, removeChatMessage, setChatTyping, setChatActivity,
    incrementUnread, setChatSessionId, saveStoryChatHistoryForAgent, getLoadingState,
  ])

  // Expose methods for ChatThread and FullCycleOrchestrator
  return useMemo(() => ({
    setPendingMessage: (agentId: string, content: string, assistantMsgId: string, userMsgId?: string) => {
      const s = getLoadingState(agentId)
      s.pendingMessage = { content, assistantMsgId, userMsgId }
      s.isLoadingAgent = true
    },
    setCurrentMessageId: (_agentId: string, _messageId: string) => {
      // No-op: backend now owns currentMessageId tracking.
      // Kept for API compatibility with FullCycleOrchestrator.
    },
    clearAgentState: (agentId: string) => {
      const s = getLoadingState(agentId)
      s.pendingMessage = null
      s.isLoadingAgent = false
    },
    isAgentLoading: (agentId: string): boolean => {
      const s = loadingStatesRef.current.get(agentId)
      return s?.isLoadingAgent || s?.pendingMessage !== null || false
    },
  }), [getLoadingState])
}

// Context for sharing the handler methods
export interface ChatMessageHandlerContext {
  setPendingMessage: (agentId: string, content: string, assistantMsgId: string, userMsgId?: string) => void
  setCurrentMessageId: (agentId: string, messageId: string) => void
  clearAgentState: (agentId: string) => void
  isAgentLoading: (agentId: string) => boolean
}

export const ChatMessageHandlerContext = createContext<ChatMessageHandlerContext | null>(null)

export function useChatMessageHandlerContext() {
  const ctx = useContext(ChatMessageHandlerContext)
  if (!ctx) {
    throw new Error('useChatMessageHandlerContext must be used within GlobalChatHandler')
  }
  return ctx
}
