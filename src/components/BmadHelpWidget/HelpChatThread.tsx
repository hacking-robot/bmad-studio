import { useEffect, useRef, useCallback } from 'react'
import { Box, Typography } from '@mui/material'
import { useStore } from '../../store'
import { useChatMessageHandlerContext } from '../../hooks/useChatMessageHandler'
import ChatMessage from '../AgentChat/ChatMessage'
import TypingIndicator from '../AgentChat/TypingIndicator'
import HelpChatInput from './HelpChatInput'

const AGENT_ID = 'bmad-help'

export default function HelpChatThread() {
  const projectPath = useStore((state) => state.projectPath)
  const chatThreads = useStore((state) => state.chatThreads)
  const addChatMessage = useStore((state) => state.addChatMessage)
  const updateChatMessage = useStore((state) => state.updateChatMessage)
  const setChatTyping = useStore((state) => state.setChatTyping)
  const setChatActivity = useStore((state) => state.setChatActivity)

  const { setPendingMessage, setCurrentMessageId, clearAgentState, isAgentLoading } = useChatMessageHandlerContext()

  const thread = chatThreads[AGENT_ID]
  const messages = thread?.messages || []
  const isTyping = thread?.isTyping || false
  const thinkingActivity = thread?.thinkingActivity

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isTyping])

  // Orphan detection: 3s + 6s pattern (same as ChatThread)
  const orphanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (orphanTimerRef.current) {
      clearTimeout(orphanTimerRef.current)
      orphanTimerRef.current = null
    }

    if (!isTyping) return

    const checkOrphan = async (): Promise<boolean> => {
      const currentThread = useStore.getState().chatThreads[AGENT_ID]
      if (!currentThread?.isTyping) return false
      if (isAgentLoading(AGENT_ID)) return false
      const isActuallyRunning = await window.chatAPI.isAgentRunning(AGENT_ID, projectPath || undefined)
      if (!isActuallyRunning) {
        const recheckThread = useStore.getState().chatThreads[AGENT_ID]
        if (!recheckThread?.isTyping) return false
        if (isAgentLoading(AGENT_ID)) return false
        return true
      }
      return false
    }

    const cleanupOrphan = () => {
      console.log('[HelpChatThread] Detected crashed/orphaned agent:', AGENT_ID)
      setChatTyping(AGENT_ID, false)
      setChatActivity(AGENT_ID, undefined)
      const recheckThread = useStore.getState().chatThreads[AGENT_ID]
      const msgs = recheckThread?.messages || []
      const pendingMsg = msgs.find(m => m.status === 'pending' || m.status === 'streaming')
      if (pendingMsg) {
        const errorContent = pendingMsg.content
          ? pendingMsg.content + '\n\n*[Process terminated unexpectedly]*'
          : '*[Process terminated unexpectedly]*'
        updateChatMessage(AGENT_ID, pendingMsg.id, { content: errorContent, status: 'error' })
      }
      clearAgentState(AGENT_ID)
    }

    orphanTimerRef.current = setTimeout(async () => {
      const maybeOrphaned = await checkOrphan()
      if (!maybeOrphaned) return
      orphanTimerRef.current = setTimeout(async () => {
        const confirmedOrphaned = await checkOrphan()
        if (!confirmedOrphaned) return
        cleanupOrphan()
      }, 3000)
    }, 3000)

    return () => {
      if (orphanTimerRef.current) {
        clearTimeout(orphanTimerRef.current)
        orphanTimerRef.current = null
      }
    }
  }, [isTyping, projectPath, setChatTyping, setChatActivity, updateChatMessage, clearAgentState, isAgentLoading])

  const handleSendMessage = useCallback(async (content: string) => {
    if (!projectPath || !content.trim()) return

    const currentThread = useStore.getState().chatThreads[AGENT_ID]
    const currentSessionId = currentThread?.sessionId
    const hasSession = !!currentSessionId

    const userMsgId = `msg-${Date.now()}`
    addChatMessage(AGENT_ID, {
      id: userMsgId,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      status: 'complete'
    })

    setChatTyping(AGENT_ID, true)

    const assistantMsgId = `msg-${Date.now() + 1}`
    addChatMessage(AGENT_ID, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending'
    })

    if (!hasSession) {
      setPendingMessage(AGENT_ID, content.trim(), assistantMsgId, userMsgId)
      try {
        const currentAiTool = useStore.getState().aiTool
        const currentClaudeModel = useStore.getState().claudeModel
        const currentCustomEndpoint = useStore.getState().customEndpoint
        const result = await window.chatAPI.loadAgent({
          agentId: AGENT_ID,
          projectPath,
          projectType: useStore.getState().projectType || 'bmm',
          tool: currentAiTool,
          model: currentAiTool === 'claude-code' ? currentClaudeModel : undefined,
          customEndpoint: currentAiTool === 'custom-endpoint' ? currentCustomEndpoint : undefined,
          agentCommand: '/bmad-help',
          pendingMessage: content.trim(),
          pendingAssistantMsgId: assistantMsgId,
          pendingUserMsgId: userMsgId,
        })
        if (!result.success) {
          updateChatMessage(AGENT_ID, assistantMsgId, {
            content: result.error || 'Failed to load BMAD Help',
            status: 'error'
          })
          setChatTyping(AGENT_ID, false)
          clearAgentState(AGENT_ID)
        }
      } catch (error) {
        updateChatMessage(AGENT_ID, assistantMsgId, {
          content: error instanceof Error ? error.message : 'Failed to load BMAD Help',
          status: 'error'
        })
        setChatTyping(AGENT_ID, false)
        clearAgentState(AGENT_ID)
      }
    } else {
      setCurrentMessageId(AGENT_ID, assistantMsgId)
      try {
        const currentAiTool = useStore.getState().aiTool
        const currentClaudeModel = useStore.getState().claudeModel
        const currentCustomEndpoint = useStore.getState().customEndpoint
        const result = await window.chatAPI.sendMessage({
          agentId: AGENT_ID,
          projectPath,
          message: content.trim(),
          sessionId: currentSessionId,
          tool: currentAiTool,
          model: currentAiTool === 'claude-code' ? currentClaudeModel : undefined,
          customEndpoint: currentAiTool === 'custom-endpoint' ? currentCustomEndpoint : undefined,
          assistantMsgId,
          userMsgId,
        })
        if (!result.success) {
          updateChatMessage(AGENT_ID, assistantMsgId, {
            content: result.error || 'Failed to send message',
            status: 'error'
          })
          setChatTyping(AGENT_ID, false)
          clearAgentState(AGENT_ID)
        }
      } catch (error) {
        updateChatMessage(AGENT_ID, assistantMsgId, {
          content: error instanceof Error ? error.message : 'Failed to send message',
          status: 'error'
        })
        setChatTyping(AGENT_ID, false)
        clearAgentState(AGENT_ID)
      }
    }
  }, [projectPath, addChatMessage, setChatTyping, updateChatMessage, setPendingMessage, setCurrentMessageId, clearAgentState])

  const handleCancel = useCallback(async () => {
    try {
      await window.chatAPI.cancelMessage(AGENT_ID, projectPath || undefined)
    } catch (error) {
      console.error('[HelpChatThread] Failed to cancel:', error)
    }
    const currentMessages = useStore.getState().chatThreads[AGENT_ID]?.messages || []
    const pendingMsg = currentMessages.find(m => m.status === 'pending' || m.status === 'streaming')
    if (pendingMsg) {
      const currentContent = pendingMsg.content || ''
      updateChatMessage(AGENT_ID, pendingMsg.id, {
        content: currentContent + (currentContent ? '\n\n' : '') + '*[Response cancelled]*',
        status: 'complete'
      })
    }
    setChatTyping(AGENT_ID, false)
    clearAgentState(AGENT_ID)
  }, [projectPath, setChatTyping, updateChatMessage, clearAgentState])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Messages */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {messages.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary', mt: 4 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
              BMAD Help
            </Typography>
            <Typography variant="caption">
              Ask about BMAD workflows, project guidance, or what to do next.
            </Typography>
          </Box>
        ) : (
          <Box>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                agentName="BMAD Help"
                agentAvatar="?"
              />
            ))}
            {isTyping && (
              <Box sx={{ px: 2, pb: 1 }}>
                <TypingIndicator agentName="BMAD Help" activity={thinkingActivity} />
              </Box>
            )}
            <div ref={messagesEndRef} />
          </Box>
        )}
      </Box>

      {/* Input */}
      <HelpChatInput
        onSend={handleSendMessage}
        onCancel={isTyping ? handleCancel : undefined}
        disabled={isTyping}
      />
    </Box>
  )
}
