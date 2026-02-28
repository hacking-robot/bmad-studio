import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Box, Fab } from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { useStore } from '../../store'
import { useWorkflow } from '../../hooks/useWorkflow'
import { useChatMessageHandlerContext } from '../../hooks/useChatMessageHandler'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import TypingIndicator from './TypingIndicator'

interface ChatThreadProps {
  agentId: string
}

export default function ChatThread({ agentId }: ChatThreadProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const projectPath = useStore((state) => state.projectPath)
  const chatThreads = useStore((state) => state.chatThreads)
  const addChatMessage = useStore((state) => state.addChatMessage)
  const updateChatMessage = useStore((state) => state.updateChatMessage)
  const setChatTyping = useStore((state) => state.setChatTyping)
  const setChatActivity = useStore((state) => state.setChatActivity)
  const setThreadContext = useStore((state) => state.setThreadContext)
  const pendingChatMessage = useStore((state) => state.pendingChatMessage)
  const clearPendingChatMessage = useStore((state) => state.clearPendingChatMessage)

  const [atBottom, setAtBottom] = useState(true)
  const prevIsTypingRef = useRef(false)

  const fullCycle = useStore((state) => state.fullCycle)
  const epicCycle = useStore((state) => state.epicCycle)

  const thread = chatThreads[agentId]
  const messages = thread?.messages || []
  const isTyping = thread?.isTyping || false
  const thinkingActivity = thread?.thinkingActivity

  // Get context usage from the last assistant message with stats
  // inputTokens of the latest response = current conversation context size
  const contextTokens = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant' && msg.stats?.inputTokens) {
        return msg.stats.inputTokens + msg.stats.outputTokens
      }
    }
    return 0
  }, [messages])

  // Determine if agent is busy with automation cycle
  const isBusyWithCycle = fullCycle.isRunning || epicCycle.isRunning
  const cycleBusyReason = fullCycle.isRunning
    ? 'Agent busy with Full Cycle automation...'
    : epicCycle.isRunning
      ? 'Agent busy with Epic Cycle automation...'
      : undefined

  // Get agents from workflow (based on current project type)
  const { agents } = useWorkflow()
  const agent = agents.find((a) => a.id === agentId)

  // Get global handler context for registering pending messages
  const { setPendingMessage, setCurrentMessageId, clearAgentState } = useChatMessageHandlerContext()

  // Sync isTyping state with actual process status on mount/agent change
  // This detects crashed processes that didn't send proper exit events
  useEffect(() => {
    async function syncAgentStatus() {
      const currentThread = useStore.getState().chatThreads[agentId]
      const isTypingInStore = currentThread?.isTyping || false

      // If store says we're typing, verify with main process
      if (isTypingInStore) {
        const isActuallyRunning = await window.chatAPI.isAgentRunning(agentId)

        if (!isActuallyRunning) {
          console.log('[ChatThread] Detected crashed/orphaned agent:', agentId)
          setChatTyping(agentId, false)
          setChatActivity(agentId, undefined)

          // Find and update any pending/streaming message to show error
          const messages = currentThread?.messages || []
          const pendingMsg = messages.find(m => m.status === 'pending' || m.status === 'streaming')
          if (pendingMsg) {
            const errorContent = pendingMsg.content
              ? pendingMsg.content + '\n\n*[Process terminated unexpectedly]*'
              : '*[Process terminated unexpectedly]*'
            updateChatMessage(agentId, pendingMsg.id, {
              content: errorContent,
              status: 'error'
            })
          }

          // Clear global handler state for this agent
          clearAgentState(agentId)
        }
      }
    }

    syncAgentStatus()
  }, [agentId, setChatTyping, setChatActivity, updateChatMessage, clearAgentState])


  const handleSendMessage = useCallback(async (content: string) => {
    if (!projectPath || !content.trim()) return

    // Get current thread state
    const currentThread = useStore.getState().chatThreads[agentId]
    const currentSessionId = currentThread?.sessionId
    const hasSession = !!currentSessionId

    // Add user message
    const userMsgId = `msg-${Date.now()}`
    addChatMessage(agentId, {
      id: userMsgId,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      status: 'complete'
    })

    // Show typing indicator
    setChatTyping(agentId, true)

    // Prepare assistant message placeholder
    const assistantMsgId = `msg-${Date.now() + 1}`

    // Add placeholder assistant message
    addChatMessage(agentId, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending'
    })

    if (!hasSession) {
      // First message - need to load the agent first, then send the message
      console.log('[ChatThread] No session, loading agent first...')
      // Register pending message with global handler
      setPendingMessage(agentId, content.trim(), assistantMsgId)

      try {
        const currentProjectType = useStore.getState().projectType || 'bmm'
        const currentAiTool = useStore.getState().aiTool
        const currentClaudeModel = useStore.getState().claudeModel
        const currentCustomEndpoint = useStore.getState().customEndpoint
        // Pass the resolved agent command from workflow config (first command is the invocation command)
        const agentCommand = agent?.commands?.[0]
        const result = await window.chatAPI.loadAgent({
          agentId,
          projectPath,
          projectType: currentProjectType,
          tool: currentAiTool,
          model: currentAiTool === 'claude-code' ? currentClaudeModel : undefined,
          customEndpoint: currentAiTool === 'custom-endpoint' ? currentCustomEndpoint : undefined,
          agentCommand
        })

        if (!result.success) {
          updateChatMessage(agentId, assistantMsgId, {
            content: result.error || 'Failed to load agent',
            status: 'error'
          })
          setChatTyping(agentId, false)
          clearAgentState(agentId)
        }
        // If successful, the global handler's onAgentLoaded will send the pending message
      } catch (error) {
        updateChatMessage(agentId, assistantMsgId, {
          content: error instanceof Error ? error.message : 'Failed to load agent',
          status: 'error'
        })
        setChatTyping(agentId, false)
        clearAgentState(agentId)
      }
    } else {
      // Have session - send message directly with --resume
      // Register the message ID with global handler
      setCurrentMessageId(agentId, assistantMsgId)

      try {
        const currentAiTool = useStore.getState().aiTool
        const currentClaudeModel = useStore.getState().claudeModel
        const currentCustomEndpoint = useStore.getState().customEndpoint
        const result = await window.chatAPI.sendMessage({
          agentId,
          projectPath,
          message: content.trim(),
          sessionId: currentSessionId,
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
          clearAgentState(agentId)
        }
      } catch (error) {
        updateChatMessage(agentId, assistantMsgId, {
          content: error instanceof Error ? error.message : 'Failed to send message',
          status: 'error'
        })
        setChatTyping(agentId, false)
        clearAgentState(agentId)
      }
    }
  }, [agentId, projectPath, addChatMessage, setChatTyping, updateChatMessage, setPendingMessage, setCurrentMessageId, clearAgentState])

  const handleCancel = useCallback(async () => {
    try {
      const result = await window.chatAPI.cancelMessage(agentId)
      if (result) {
        console.log('[ChatThread] Cancelled message for agent:', agentId)
        // Find the current streaming/pending message and update it
        const currentMessages = useStore.getState().chatThreads[agentId]?.messages || []
        const pendingMsg = currentMessages.find(m => m.status === 'pending' || m.status === 'streaming')
        if (pendingMsg) {
          const currentContent = pendingMsg.content || ''
          updateChatMessage(agentId, pendingMsg.id, {
            content: currentContent + (currentContent ? '\n\n' : '') + '*[Response cancelled]*',
            status: 'complete'
          })
        }
        setChatTyping(agentId, false)
        clearAgentState(agentId)
      }
    } catch (error) {
      console.error('[ChatThread] Failed to cancel:', error)
    }
  }, [agentId, setChatTyping, updateChatMessage, clearAgentState])

  // Scroll to bottom when typing starts only if already at bottom (handles wizard flow where thread is freshly created)
  useEffect(() => {
    if (isTyping && !prevIsTypingRef.current && messages.length > 0 && atBottom) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: 'end', behavior: 'smooth' })
      }, 50)
    }
    prevIsTypingRef.current = isTyping
  }, [isTyping, messages.length, atBottom])

  // Guard against concurrent pending message processing
  const isSendingRef = useRef(false)

  // Handle pending chat messages from other components (e.g., StoryCard, Wizard)
  useEffect(() => {
    if (pendingChatMessage && pendingChatMessage.agentId === agentId && projectPath) {
      // Skip if already processing a send or if a cycle is running
      if (isSendingRef.current) return
      if (isBusyWithCycle) {
        console.log('[ChatThread] Skipping pending message - cycle automation is running')
        clearPendingChatMessage()
        return
      }
      isSendingRef.current = true

      // Store story context if provided
      if (pendingChatMessage.storyId || pendingChatMessage.branchName) {
        setThreadContext(agentId, pendingChatMessage.storyId, pendingChatMessage.branchName)
      }

      // Clear the pending message first to prevent re-triggering
      const messageToSend = pendingChatMessage.message
      clearPendingChatMessage()

      // Send the message after a short delay to ensure UI is ready
      setTimeout(() => {
        handleSendMessage(messageToSend)
        isSendingRef.current = false
      }, 100)
    }
  }, [pendingChatMessage, agentId, projectPath, clearPendingChatMessage, handleSendMessage, setThreadContext])

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Messages List */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {messages.length === 0 ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 4
            }}
          >
            <Box sx={{ textAlign: 'center', color: 'text.secondary' }}>
              <Box sx={{ fontSize: '2rem', mb: 1 }}>
                {agent?.avatar}
              </Box>
              <Box sx={{ fontWeight: 500 }}>
                Start a conversation with {agent?.name}
              </Box>
              <Box sx={{ fontSize: '0.875rem', mt: 0.5 }}>
                {agent?.description}
              </Box>
            </Box>
          </Box>
        ) : (
          <Box sx={{ position: 'relative', height: '100%' }}>
            <Virtuoso
              ref={virtuosoRef}
              data={messages}
              initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
              followOutput={(isAtBottom) => isAtBottom ? 'smooth' : false}
              atBottomStateChange={setAtBottom}
              atBottomThreshold={50}
              itemContent={(_index, message) => (
                <ChatMessage
                  message={message}
                  agentName={agent?.name || 'Agent'}
                  agentAvatar={agent?.avatar || 'A'}
                />
              )}
              style={{ height: '100%' }}
              components={{
                Footer: () =>
                  isTyping ? (
                    <Box sx={{ px: 2, pb: 2 }}>
                      <TypingIndicator agentName={agent?.name || 'Agent'} activity={thinkingActivity} />
                    </Box>
                  ) : null
              }}
            />
            {!atBottom && (
              <Fab
                size="small"
                onClick={() => virtuosoRef.current?.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: 'smooth' })}
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  right: 20,
                  width: 28,
                  height: 28,
                  minHeight: 'unset',
                  bgcolor: 'background.paper',
                  color: 'text.secondary',
                  boxShadow: 1,
                  opacity: 0.5,
                  '&:hover': { opacity: 0.85, bgcolor: 'background.paper' },
                  zIndex: 1
                }}
              >
                <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
              </Fab>
            )}
          </Box>
        )}
      </Box>

      {/* Input */}
      <ChatInput
        onSend={handleSendMessage}
        onCancel={isTyping ? handleCancel : undefined}
        disabled={isTyping || isBusyWithCycle}
        agentId={agentId}
        busyReason={cycleBusyReason}
        contextTokens={contextTokens}
        contextLimit={200_000}
      />
    </Box>
  )
}
