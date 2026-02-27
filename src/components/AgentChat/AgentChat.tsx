import { useEffect, useCallback } from 'react'
import { Box, Typography, IconButton, Tooltip } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { v4 as uuidv4 } from 'uuid'
import { useStore } from '../../store'
import { useWorkflow } from '../../hooks/useWorkflow'
import type { StoryChatHistory, StoryChatSession } from '../../types'
import AgentSidebar from './AgentSidebar'
import ChatThread from './ChatThread'

const SIDEBAR_WIDTH = 240

export default function AgentChat() {
  const selectedChatAgent = useStore((state) => state.selectedChatAgent)
  const setSelectedChatAgent = useStore((state) => state.setSelectedChatAgent)
  const chatThreads = useStore((state) => state.chatThreads)
  const clearChatThread = useStore((state) => state.clearChatThread)
  const setHelpPanelOpen = useStore((state) => state.setHelpPanelOpen)
  const projectPath = useStore((state) => state.projectPath)
  const stories = useStore((state) => state.stories)

  // Get agents from workflow (based on current project type)
  const { agents } = useWorkflow()

  const handleClearChat = useCallback(async () => {
    if (!selectedChatAgent) return

    const thread = chatThreads[selectedChatAgent]
    const agent = agents.find(a => a.id === selectedChatAgent)

    // If thread has messages and is linked to a story, save to story history first
    if (thread && thread.messages.length > 0 && thread.storyId && projectPath && agent) {
      try {
        const story = stories.find(s => s.id === thread.storyId)
        const storyTitle = story?.title || thread.storyId

        // Load existing history
        let history: StoryChatHistory | null = await window.chatAPI.loadStoryChatHistory(projectPath, thread.storyId)
        const now = Date.now()

        if (!history) {
          history = {
            storyId: thread.storyId,
            storyTitle,
            sessions: [],
            lastUpdated: now
          }
        }

        // Create a new finalized session for this cleared chat
        const newSession: StoryChatSession = {
          sessionId: uuidv4(),
          agentId: selectedChatAgent,
          agentName: agent.name,
          agentRole: agent.role,
          messages: thread.messages,
          startTime: thread.messages[0].timestamp,
          endTime: now,
          branchName: thread.branchName
        }
        history.sessions.push(newSession)
        history.lastUpdated = now

        // Save to story history
        await window.chatAPI.saveStoryChatHistory(projectPath, thread.storyId, history)
        console.log('Saved chat session to story history before clearing:', thread.storyId)
      } catch (error) {
        console.error('Failed to save chat session before clearing:', error)
      }
    }

    // Cancel any running process and clear the thread
    window.chatAPI.cancelMessage(selectedChatAgent).catch(() => {})
    clearChatThread(selectedChatAgent)
    if (projectPath) {
      window.chatAPI.clearThread(projectPath, selectedChatAgent)
    }
  }, [selectedChatAgent, chatThreads, agents, projectPath, stories, clearChatThread])

  // Select first agent if none selected or current selection invalid for project type
  useEffect(() => {
    const validAgent = agents.find((a) => a.id === selectedChatAgent)
    if (!validAgent && agents.length > 0) {
      setSelectedChatAgent(agents[0].id)
    }
  }, [selectedChatAgent, setSelectedChatAgent, agents])

  // Load thread from storage when agent is selected
  useEffect(() => {
    if (selectedChatAgent) {
      // Load persisted thread if not already loaded
      const thread = chatThreads[selectedChatAgent]
      if (!thread && projectPath) {
        window.chatAPI.loadThread(projectPath, selectedChatAgent).then((loadedThread) => {
          if (loadedThread && loadedThread.messages.length > 0) {
            // Restore thread from storage
            for (const msg of loadedThread.messages) {
              useStore.getState().addChatMessage(selectedChatAgent, msg)
            }
          }
        })
      }
    }
  }, [selectedChatAgent, chatThreads, projectPath])

  const selectedAgent = agents.find((a) => a.id === selectedChatAgent)

  return (
    <Box
      sx={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        bgcolor: 'background.default'
      }}
    >
      {/* Agent Sidebar */}
      <Box
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper'
        }}
      >
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
            AGENTS
          </Typography>
        </Box>
        <AgentSidebar />
      </Box>

      {/* Chat Area */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {selectedAgent ? (
          <>
            {/* Chat Header */}
            <Box
              sx={{
                p: 2,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '0.875rem'
                }}
              >
                {selectedAgent.avatar}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {selectedAgent.name}
                  </Typography>
                  <Tooltip title="View agent guide">
                    <IconButton
                      onClick={() => setHelpPanelOpen(true, 1, selectedAgent.id)}
                      size="small"
                      sx={{ color: 'text.secondary', p: 0.25 }}
                    >
                      <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {selectedAgent.role} - {selectedAgent.description}
                </Typography>
              </Box>
              <Tooltip title="Clear conversation">
                <IconButton
                  onClick={handleClearChat}
                  size="small"
                  sx={{ color: 'text.secondary' }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Chat Thread */}
            <ChatThread agentId={selectedChatAgent!} />
          </>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Typography color="text.secondary">
              Select an agent to start chatting
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}
