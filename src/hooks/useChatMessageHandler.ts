import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { useWorkflow } from './useWorkflow'
import { getToolActivity, showChatNotification, debouncedSaveThread, debouncedSaveStoryChatHistory } from '../utils/chatUtils'
import type { LLMStats, ProjectCostEntry, ToolCall } from '../types'

// Per-agent message state tracking
interface AgentMessageState {
  currentMessageId: string | null
  streamBuffer: string
  pendingMessage: { content: string; assistantMsgId: string } | null
  isLoadingAgent: boolean
  messageCompleted: boolean
  toolUsed: boolean
  pendingToolCalls: ToolCall[]
}

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

// Global handler hook - manages all IPC subscriptions
export function useChatMessageHandler() {
  const projectPath = useStore((state) => state.projectPath)
  const outputFolder = useStore((state) => state.outputFolder)
  const addChatMessage = useStore((state) => state.addChatMessage)
  const updateChatMessage = useStore((state) => state.updateChatMessage)
  const setChatTyping = useStore((state) => state.setChatTyping)
  const setChatActivity = useStore((state) => state.setChatActivity)
  const incrementUnread = useStore((state) => state.incrementUnread)
  const setChatSessionId = useStore((state) => state.setChatSessionId)

  // Get agents from workflow
  const { agents } = useWorkflow()

  // Per-agent state tracking
  const agentStatesRef = useRef<Map<string, AgentMessageState>>(new Map())

  // Get or create state for an agent
  const getAgentState = useCallback((agentId: string): AgentMessageState => {
    let state = agentStatesRef.current.get(agentId)
    if (!state) {
      state = {
        currentMessageId: null,
        streamBuffer: '',
        pendingMessage: null,
        isLoadingAgent: false,
        messageCompleted: false,
        toolUsed: false,
        pendingToolCalls: []
      }
      agentStatesRef.current.set(agentId, state)
    }
    return state
  }, [])

  // Helper to create a new assistant message for a new response turn
  const createNewAssistantMessage = useCallback((agentId: string): string => {
    const newMsgId = `msg-${Date.now()}`
    addChatMessage(agentId, {
      id: newMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming'
    })

    const state = getAgentState(agentId)
    state.currentMessageId = newMsgId
    state.streamBuffer = ''
    state.messageCompleted = false
    state.toolUsed = false

    return newMsgId
  }, [addChatMessage, getAgentState])

  // Helper to attach a tool call to a message (or buffer it)
  const attachToolCall = useCallback((agentId: string, toolCall: ToolCall) => {
    const state = getAgentState(agentId)
    if (state.currentMessageId) {
      // Attach to current message
      const thread = useStore.getState().chatThreads[agentId]
      const msg = thread?.messages.find(m => m.id === state.currentMessageId)
      const existing = msg?.toolCalls || []
      updateChatMessage(agentId, state.currentMessageId, {
        toolCalls: [...existing, toolCall]
      })
    } else {
      // Buffer until a text message appears
      state.pendingToolCalls.push(toolCall)
    }
  }, [getAgentState, updateChatMessage])

  // Helper to flush pending tool calls onto the current message
  const flushPendingToolCalls = useCallback((agentId: string) => {
    const state = getAgentState(agentId)
    if (state.pendingToolCalls.length > 0 && state.currentMessageId) {
      const thread = useStore.getState().chatThreads[agentId]
      const msg = thread?.messages.find(m => m.id === state.currentMessageId)
      const existing = msg?.toolCalls || []
      updateChatMessage(agentId, state.currentMessageId, {
        toolCalls: [...existing, ...state.pendingToolCalls]
      })
      state.pendingToolCalls = []
    }
  }, [getAgentState, updateChatMessage])

  // Save thread to disk and story history
  const saveThreadForAgent = useCallback((agentId: string) => {
    const thread = useStore.getState().chatThreads[agentId]
    if (!thread || thread.messages.length === 0) return
    if (!projectPath) return

    // Save thread to disk
    debouncedSaveThread(projectPath, agentId, thread)

    // Also save to story chat history if linked to a story
    if (thread.storyId && projectPath) {
      const agent = agents.find((a) => a.id === agentId)
      if (agent) {
        const stories = useStore.getState().stories
        const story = stories.find(s => s.id === thread.storyId)
        const storyTitle = story?.title || thread.storyId

        debouncedSaveStoryChatHistory(
          projectPath,
          thread.storyId,
          storyTitle,
          agentId,
          agent.name,
          agent.role,
          thread.messages,
          thread.branchName,
          outputFolder
        )
      }
    }
  }, [projectPath, outputFolder, agents])

  // Subscribe to all chat events
  useEffect(() => {
    // Handle chat output
    const unsubOutput = window.chatAPI.onChatOutput((event) => {
      const { agentId } = event
      const state = getAgentState(agentId)
      const agent = agents.find((a) => a.id === agentId)

      // Skip message creation during agent load - show as status instead
      if (event.isAgentLoad) {
        setChatActivity(agentId, 'Loading agent...')
        return
      }

      // Parse stream-json output and extract text
      const chunk = event.chunk
      const lines = chunk.split('\n').filter(Boolean)

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)

          // Handle content_block_delta with input_json_delta - accumulate tool input
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
            const partial = parsed.delta.partial_json as string | undefined
            if (partial) {
              // Check for step file patterns in the streaming tool input
              const stepMatch = partial.match(/step-(\d+)/)
              if (stepMatch) {
                const { projectWizard, setWizardActiveSubStep } = useStore.getState()
                if (projectWizard.isActive) {
                  const stepNum = parseInt(stepMatch[1], 10)
                  console.log(`[WizardProgress] input_json_delta: step-${stepMatch[1]} detected`)
                  setWizardActiveSubStep(stepNum)
                }
              }
            }
          }

          // Handle content_block_delta - streaming text
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            const newText = parsed.delta.text

            // If previous message was completed, tool was used, or no current message, create a new one
            if (!state.currentMessageId || state.messageCompleted || state.toolUsed) {
              createNewAssistantMessage(agentId)
              flushPendingToolCalls(agentId)
              state.toolUsed = false
            }

            state.streamBuffer += newText

            // Update existing message
            if (state.currentMessageId) {
              const currentContent = useStore.getState().chatThreads[agentId]?.messages.find(
                m => m.id === state.currentMessageId
              )?.content || ''

              updateChatMessage(agentId, state.currentMessageId, {
                content: currentContent + newText,
                status: 'streaming'
              })
            }
          }

          // Handle content_block_start for text blocks
          if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'text') {
            if (!state.currentMessageId || state.messageCompleted || state.toolUsed) {
              createNewAssistantMessage(agentId)
              flushPendingToolCalls(agentId)
              state.toolUsed = false
            } else if (state.currentMessageId) {
              updateChatMessage(agentId, state.currentMessageId, {
                status: 'streaming'
              })
            }
          }

          // Handle content_block_start for tool_use blocks (streaming path)
          // Note: input is typically empty {} at this point; full input comes in assistant batch message
          if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
            const toolName = parsed.content_block.name
            const toolInput = parsed.content_block.input as Record<string, unknown> | undefined
            if (toolName) {
              const activity = getToolActivity(toolName, toolInput)
              setChatActivity(agentId, activity)

              // Detect step file reads from streaming tool_use (input may have file_path in some formats)
              if ((toolName === 'Read' || toolName === 'read_file') && toolInput) {
                const filePath = (toolInput.file_path || toolInput.path || '') as string
                if (filePath) {
                  const stepMatch = filePath.match(/step-(\d+)/)
                  if (stepMatch) {
                    const { projectWizard, setWizardActiveSubStep } = useStore.getState()
                    if (projectWizard.isActive) {
                      const stepNum = parseInt(stepMatch[1], 10)
                      console.log(`[WizardProgress] content_block_start: step-${stepMatch[1]} (${filePath})`)
                      setWizardActiveSubStep(stepNum)
                    }
                  }
                }
              }

              // Only mark complete if message has actual content
              if (state.currentMessageId && state.streamBuffer) {
                updateChatMessage(agentId, state.currentMessageId, { status: 'complete' })
                state.toolUsed = true
              }
            }
          }

          // Handle assistant message (complete message format)
          // Process text blocks FIRST, then tool_use blocks
          if (parsed.type === 'assistant' && parsed.message?.content) {
            // First pass: handle all text blocks
            for (const block of parsed.message.content) {
              if (block.type === 'text' && block.text) {
                setChatActivity(agentId, undefined)

                if (!state.currentMessageId || state.messageCompleted || state.toolUsed) {
                  createNewAssistantMessage(agentId)
                  flushPendingToolCalls(agentId)
                  state.toolUsed = false
                }

                if (state.currentMessageId) {
                  const currentContent = useStore.getState().chatThreads[agentId]?.messages.find(
                    m => m.id === state.currentMessageId
                  )?.content || ''
                  const newContent = currentContent ? currentContent + block.text : block.text

                  updateChatMessage(agentId, state.currentMessageId, {
                    content: newContent,
                    status: 'streaming'
                  })
                  state.streamBuffer = newContent
                }
              }
            }

            // Second pass: handle tool_use blocks
            for (const block of parsed.message.content) {
              if (block.type === 'tool_use' && block.name) {
                const input = block.input as Record<string, unknown> | undefined
                const activity = getToolActivity(block.name, input)
                setChatActivity(agentId, activity)

                // Capture tool call
                attachToolCall(agentId, {
                  name: block.name,
                  summary: activity,
                  input
                })

                // Detect step file reads for wizard sub-step tracking (assistant batch path)
                if ((block.name === 'Read' || block.name === 'read_file') && input) {
                  const filePath = (input.file_path || input.path || '') as string
                  const stepMatch = filePath.match(/step-(\d+)/)
                  if (stepMatch) {
                    const { projectWizard, setWizardActiveSubStep } = useStore.getState()
                    if (projectWizard.isActive) {
                      const stepNum = parseInt(stepMatch[1], 10)
                      console.log(`[WizardProgress] assistant handler: step-${stepMatch[1]} detected (${filePath})`)
                      setWizardActiveSubStep(stepNum)
                    }
                  }
                }

                // Only mark complete if message has actual content
                if (state.currentMessageId && state.streamBuffer) {
                  updateChatMessage(agentId, state.currentMessageId, { status: 'complete' })
                  state.toolUsed = true
                }
              }
            }
          }

          // Handle result - finalize message with stats
          if (parsed.type === 'result') {
            setChatActivity(agentId, undefined)

            if (state.currentMessageId) {
              // If no text was streamed but result contains the response text, use it as fallback.
              // This handles cases where assistant messages were missed (e.g., stdio timing).
              const existingMsg = useStore.getState().chatThreads[agentId]?.messages.find(
                m => m.id === state.currentMessageId
              )
              if (!state.streamBuffer && (!existingMsg?.content) && parsed.result) {
                const resultText = typeof parsed.result === 'string' ? parsed.result : ''
                if (resultText) {
                  updateChatMessage(agentId, state.currentMessageId, {
                    content: resultText,
                    status: 'streaming'
                  })
                  state.streamBuffer = resultText
                }
              }

              const stats: LLMStats | undefined = parsed.usage ? {
                model: parsed.modelUsage
                  ? Object.entries(parsed.modelUsage).sort((a, b) => ((b[1] as Record<string, number>).costUSD || 0) - ((a[1] as Record<string, number>).costUSD || 0))[0]?.[0] || 'unknown'
                  : 'unknown',
                inputTokens: parsed.usage.input_tokens || 0,
                outputTokens: parsed.usage.output_tokens || 0,
                cacheReadTokens: parsed.usage.cache_read_input_tokens,
                cacheWriteTokens: parsed.usage.cache_creation_input_tokens,
                totalCostUsd: parsed.total_cost_usd,
                durationMs: parsed.duration_ms,
                apiDurationMs: parsed.duration_api_ms
              } : undefined

              updateChatMessage(agentId, state.currentMessageId, { status: 'complete', stats })
              incrementUnread(agentId)

              // Show notification if not viewing this chat
              if (useStore.getState().selectedChatAgent !== agentId && agent) {
                showChatNotification(agent, state.streamBuffer)
              }
            }

            state.messageCompleted = true
            state.streamBuffer = ''

            // Save after result
            saveThreadForAgent(agentId)

            // Append cost entry to project ledger
            const resultCost = parsed.total_cost_usd
            if (resultCost && resultCost > 0) {
              const { projectPath: costProjectPath, outputFolder: costOutputFolder, addToProjectCostTotal } = useStore.getState()
              if (costProjectPath) {
                const thread = useStore.getState().chatThreads[agentId]
                const usage = parsed.usage || {}
                const costEntry: ProjectCostEntry = {
                  id: `cost-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  timestamp: Date.now(),
                  agentId,
                  storyId: thread?.storyId,
                  messageId: state.currentMessageId || '',
                  model: parsed.modelUsage
                    ? Object.entries(parsed.modelUsage).sort((a, b) => ((b[1] as Record<string, number>).costUSD || 0) - ((a[1] as Record<string, number>).costUSD || 0))[0]?.[0] || 'unknown'
                    : 'unknown',
                  inputTokens: usage.input_tokens || 0,
                  outputTokens: usage.output_tokens || 0,
                  cacheReadTokens: usage.cache_read_input_tokens,
                  cacheWriteTokens: usage.cache_creation_input_tokens,
                  totalCostUsd: resultCost,
                  durationMs: parsed.duration_ms
                }
                window.costAPI.appendCost(costProjectPath, costEntry, costOutputFolder)
                addToProjectCostTotal(resultCost)
              }
            }
          }
        } catch {
          // Not JSON, ignore
        }
      }
    })

    // Handle agent loaded event - send pending message if any
    const unsubAgentLoaded = window.chatAPI.onAgentLoaded(async (event) => {
      const { agentId } = event
      const state = getAgentState(agentId)

      console.log('[GlobalChatHandler] Agent loaded:', event)
      state.isLoadingAgent = false
      setChatActivity(agentId, undefined)

      // Store session ID
      if (event.sessionId) {
        setChatSessionId(agentId, event.sessionId)
      }

      // If there's a pending message, send it now
      if (state.pendingMessage && event.sessionId && event.code === 0) {
        const { content, assistantMsgId } = state.pendingMessage
        state.pendingMessage = null

        // Set up for streaming response
        state.currentMessageId = assistantMsgId
        state.streamBuffer = ''
        state.messageCompleted = false
        state.toolUsed = false

        // Wait a moment for session file to be written
        await new Promise(resolve => setTimeout(resolve, 150))

        // Send the actual user message
        const currentAiTool = useStore.getState().aiTool
        const currentClaudeModel = useStore.getState().claudeModel
        const currentCustomEndpoint = useStore.getState().customEndpoint
        const currentProjectPath = useStore.getState().projectPath

        if (!currentProjectPath) return

        const result = await window.chatAPI.sendMessage({
          agentId,
          projectPath: currentProjectPath,
          message: content,
          sessionId: event.sessionId,
          tool: currentAiTool,
          model: currentAiTool === 'claude-code' ? currentClaudeModel : undefined,
          customEndpoint: currentAiTool === 'custom-endpoint' ? currentCustomEndpoint : undefined
        })

        if (!result.success) {
          updateChatMessage(agentId, assistantMsgId, {
            content: result.error || 'Failed to send message',
            status: 'error'
          })
          setChatTyping(agentId, false)
          state.currentMessageId = null
        }
      } else if (state.pendingMessage && event.code !== 0) {
        // Agent load failed
        const { assistantMsgId } = state.pendingMessage
        state.pendingMessage = null
        updateChatMessage(agentId, assistantMsgId, {
          content: event.error || 'Failed to load agent',
          status: 'error'
        })
        setChatTyping(agentId, false)
        setChatActivity(agentId, undefined)

        // Notify completion callback of failure
        const callback = completionCallbacks.get(agentId)
        if (callback) {
          callback(false)
        }
      }
    })

    // Handle process exit
    const unsubExit = window.chatAPI.onChatExit((event) => {
      const { agentId } = event
      const state = getAgentState(agentId)
      const agent = agents.find((a) => a.id === agentId)

      setChatTyping(agentId, false)

      // Finalize any pending message
      if (state.currentMessageId) {
        const existingMessage = useStore.getState().chatThreads[agentId]?.messages.find(
          m => m.id === state.currentMessageId
        )
        const existingContent = existingMessage?.content || ''
        const finalContent = state.streamBuffer || existingContent || 'Response completed.'

        const updatePayload: { content?: string; status: 'complete' | 'error' } = {
          status: event.code === 0 ? 'complete' : 'error'
        }
        if (state.streamBuffer || !existingContent) {
          updatePayload.content = finalContent
        }

        updateChatMessage(agentId, state.currentMessageId, updatePayload)
        incrementUnread(agentId)

        if (useStore.getState().selectedChatAgent !== agentId && agent) {
          showChatNotification(agent, finalContent)
        }

        // Store session ID for continuity (unless just fallback content or thread was cleared)
        const threadAfterExit = useStore.getState().chatThreads[agentId]
        if (event.sessionId && finalContent !== 'Response completed.' && threadAfterExit?.isInitialized !== false) {
          setChatSessionId(agentId, event.sessionId)
        }
      } else {
        // No pending message - still store session ID (unless thread was cleared)
        const threadAfterExit = useStore.getState().chatThreads[agentId]
        if (event.sessionId && threadAfterExit?.isInitialized !== false) {
          setChatSessionId(agentId, event.sessionId)
        }
      }

      // Reset state on exit
      state.currentMessageId = null
      state.streamBuffer = ''
      state.messageCompleted = false
      state.toolUsed = false
      state.pendingToolCalls = []

      // Save after exit
      saveThreadForAgent(agentId)

      // Notify completion callback
      const callback = completionCallbacks.get(agentId)
      if (callback) {
        const success = event.code === 0 && !event.cancelled
        callback(success, event.sessionId)
      }
    })

    return () => {
      unsubOutput()
      unsubAgentLoaded()
      unsubExit()
    }
  }, [
    agents,
    getAgentState,
    createNewAssistantMessage,
    attachToolCall,
    flushPendingToolCalls,
    updateChatMessage,
    setChatTyping,
    setChatActivity,
    incrementUnread,
    setChatSessionId,
    saveThreadForAgent
  ])

  // Expose methods for ChatThread to register pending messages
  return {
    setPendingMessage: (agentId: string, content: string, assistantMsgId: string) => {
      const state = getAgentState(agentId)
      state.pendingMessage = { content, assistantMsgId }
      state.isLoadingAgent = true
    },
    setCurrentMessageId: (agentId: string, messageId: string) => {
      const state = getAgentState(agentId)
      state.currentMessageId = messageId
      state.streamBuffer = ''
      state.messageCompleted = false
      state.toolUsed = false
    },
    clearAgentState: (agentId: string) => {
      const state = getAgentState(agentId)
      state.currentMessageId = null
      state.streamBuffer = ''
      state.pendingMessage = null
      state.isLoadingAgent = false
      state.messageCompleted = false
      state.toolUsed = false
      state.pendingToolCalls = []
    },
    getAgentState
  }
}

// Context for sharing the handler methods
import { createContext, useContext } from 'react'

export interface ChatMessageHandlerContext {
  setPendingMessage: (agentId: string, content: string, assistantMsgId: string) => void
  setCurrentMessageId: (agentId: string, messageId: string) => void
  clearAgentState: (agentId: string) => void
}

export const ChatMessageHandlerContext = createContext<ChatMessageHandlerContext | null>(null)

export function useChatMessageHandlerContext() {
  const ctx = useContext(ChatMessageHandlerContext)
  if (!ctx) {
    throw new Error('useChatMessageHandlerContext must be used within GlobalChatHandler')
  }
  return ctx
}
