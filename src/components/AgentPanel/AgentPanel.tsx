import { useEffect, useState, useRef } from 'react'
import { Box, Drawer, Typography, IconButton, Chip, Tabs, Tab, ToggleButtonGroup, ToggleButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import StopIcon from '@mui/icons-material/Stop'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import HistoryIcon from '@mui/icons-material/History'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import { useStore } from '../../store'
import { AgentHistoryEntry } from '../../types'
import AgentTerminal from './AgentTerminal'
import AgentInput from './AgentInput'

const PANEL_WIDTH = 500

export default function AgentPanel() {
  const agentPanelOpen = useStore((state) => state.agentPanelOpen)
  const setAgentPanelOpen = useStore((state) => state.setAgentPanelOpen)
  const agents = useStore((state) => state.agents)
  const activeAgentId = useStore((state) => state.activeAgentId)
  const setActiveAgent = useStore((state) => state.setActiveAgent)
  const appendAgentOutput = useStore((state) => state.appendAgentOutput)
  const updateAgent = useStore((state) => state.updateAgent)
  const removeAgent = useStore((state) => state.removeAgent)
  const agentHistory = useStore((state) => state.agentHistory)
  const addToHistory = useStore((state) => state.addToHistory)
  const updateHistoryEntry = useStore((state) => state.updateHistoryEntry)
  const clearHistory = useStore((state) => state.clearHistory)

  const [viewMode, setViewMode] = useState<'running' | 'history'>('running')
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [loadedHistoryOutput, setLoadedHistoryOutput] = useState<string[]>([])
  const [loadingHistoryOutput, setLoadingHistoryOutput] = useState(false)

  // Track which agents we've already added to history
  const addedToHistoryRef = useRef<Set<string>>(new Set())

  const activeAgent = activeAgentId ? agents[activeAgentId] : null
  const agentList = Object.values(agents)
  const selectedHistory = selectedHistoryId ? agentHistory.find((h) => h.id === selectedHistoryId) : null

  // Load output from file when history selection changes
  useEffect(() => {
    if (selectedHistoryId && viewMode === 'history') {
      setLoadingHistoryOutput(true)
      window.agentAPI.loadOutput(selectedHistoryId).then((output) => {
        setLoadedHistoryOutput(output)
        setLoadingHistoryOutput(false)
      }).catch(() => {
        setLoadedHistoryOutput([])
        setLoadingHistoryOutput(false)
      })
    } else {
      setLoadedHistoryOutput([])
    }
  }, [selectedHistoryId, viewMode])

  // Buffer for batching output writes to files
  const outputBufferRef = useRef<Map<string, string[]>>(new Map())
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Flush buffered output to files
  const flushOutputBuffer = async () => {
    const buffer = outputBufferRef.current
    for (const [agentId, lines] of buffer.entries()) {
      if (lines.length > 0) {
        await window.agentAPI.appendOutput(agentId, lines)
      }
    }
    buffer.clear()
  }

  // Subscribe to agent events and sync with history
  useEffect(() => {
    const unsubOutput = window.agentAPI.onAgentOutput((event) => {
      appendAgentOutput(event.agentId, event.chunk)

      // Buffer output for file saving (debounced)
      const buffer = outputBufferRef.current
      if (!buffer.has(event.agentId)) {
        buffer.set(event.agentId, [])
      }
      buffer.get(event.agentId)!.push(event.chunk)

      // Debounce file writes
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
      }
      flushTimeoutRef.current = setTimeout(flushOutputBuffer, 500)
    })

    const unsubExit = window.agentAPI.onAgentExit((event) => {
      const newStatus = event.code === 0 ? 'completed' : 'error'
      updateAgent(event.agentId, { status: newStatus })
      // Flush any remaining output before updating status
      flushOutputBuffer().then(() => {
        updateHistoryEntry(event.agentId, {
          status: newStatus,
          endTime: Date.now(),
          exitCode: event.code ?? undefined
        })
      })
    })

    const unsubError = window.agentAPI.onAgentError((event) => {
      updateAgent(event.agentId, { status: 'error' })
      const errorLine = `\n[Error: ${event.error}]\n`
      appendAgentOutput(event.agentId, errorLine)

      // Save error to file
      window.agentAPI.appendOutput(event.agentId, [errorLine]).then(() => {
        updateHistoryEntry(event.agentId, {
          status: 'error',
          endTime: Date.now()
        })
      })
    })

    return () => {
      unsubOutput()
      unsubExit()
      unsubError()
      // Flush on cleanup
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
      }
      flushOutputBuffer()
    }
  }, [appendAgentOutput, updateAgent, updateHistoryEntry])

  // Add new agents to history when they appear
  useEffect(() => {
    for (const agent of agentList) {
      if (!addedToHistoryRef.current.has(agent.id)) {
        addedToHistoryRef.current.add(agent.id)
        const historyEntry: AgentHistoryEntry = {
          id: agent.id,
          storyId: agent.storyId,
          storyTitle: agent.storyTitle,
          command: agent.command,
          status: agent.status,
          output: [...agent.output],
          startTime: agent.startTime
        }
        addToHistory(historyEntry)
      }
    }
  }, [agentList, addToHistory])

  // Auto-switch to running view when agents are running
  useEffect(() => {
    if (agentList.length > 0 && viewMode === 'history') {
      setViewMode('running')
    }
  }, [agentList.length])

  const handleClose = () => {
    setAgentPanelOpen(false)
  }

  const handleKillAgent = async () => {
    if (!activeAgentId) return
    await window.agentAPI.killAgent(activeAgentId)
    removeAgent(activeAgentId)
  }

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveAgent(newValue)
  }

  const handleHistorySelect = (historyId: string) => {
    setSelectedHistoryId(historyId)
  }

  const handleViewModeChange = (_: React.MouseEvent<HTMLElement>, newMode: 'running' | 'history' | null) => {
    if (newMode) {
      setViewMode(newMode)
      if (newMode === 'history') {
        setSelectedHistoryId(agentHistory[0]?.id || null)
      }
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'success'
      case 'completed':
        return 'default'
      case 'error':
        return 'error'
      case 'interrupted':
        return 'warning'
      default:
        return 'default'
    }
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <Drawer
      anchor="right"
      open={agentPanelOpen}
      onClose={handleClose}
      variant="persistent"
      sx={{
        '& .MuiDrawer-paper': {
          width: PANEL_WIDTH,
          boxSizing: 'border-box',
          borderLeft: 1,
          borderColor: 'divider'
        }
      }}
    >
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default'
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            Agent Panel
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={handleViewModeChange}
              size="small"
            >
              <ToggleButton value="running" title="Working Agents">
                <PlayArrowIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="history" title="History">
                <HistoryIcon fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
            <IconButton size="small" onClick={handleClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {viewMode === 'running' ? (
          <>
            {/* Agent Tabs */}
            {agentList.length > 0 && (
              <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                  value={activeAgentId || false}
                  onChange={handleTabChange}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{
                    minHeight: 40,
                    '& .MuiTab-root': {
                      minHeight: 40,
                      textTransform: 'none',
                      fontSize: '0.8rem'
                    }
                  }}
                >
                  {agentList.map((agent) => (
                    <Tab
                      key={agent.id}
                      value={agent.id}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="caption" noWrap sx={{ maxWidth: 120 }}>
                            {agent.storyTitle}
                          </Typography>
                          <Chip
                            label={agent.status}
                            size="small"
                            color={getStatusColor(agent.status) as 'success' | 'default' | 'error' | 'warning'}
                            sx={{ height: 18, fontSize: '0.65rem' }}
                          />
                        </Box>
                      }
                    />
                  ))}
                </Tabs>
              </Box>
            )}

            {/* Active Agent Content */}
            {activeAgent ? (
              <>
                {/* Agent Info Bar */}
                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    borderBottom: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    bgcolor: 'background.paper'
                  }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Story: {activeAgent.storyId}
                    </Typography>
                    {activeAgent.command && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                        Command: {activeAgent.command}
                      </Typography>
                    )}
                  </Box>
                  {activeAgent.status === 'running' && (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={handleKillAgent}
                      title="Stop agent"
                    >
                      <StopIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>

                {/* Terminal Output */}
                <AgentTerminal output={activeAgent.output} />

                {/* Input */}
                {activeAgent.status === 'running' && (
                  <AgentInput agentId={activeAgent.id} />
                )}
              </>
            ) : (
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 4
                }}
              >
                <Typography color="text.secondary" textAlign="center">
                  {agentList.length === 0
                    ? 'No agents working. Start an agent from a story card.'
                    : 'Select an agent tab to view output.'}
                </Typography>
              </Box>
            )}
          </>
        ) : (
          <>
            {/* History Header */}
            <Box
              sx={{
                px: 2,
                py: 1,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                bgcolor: 'background.paper'
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {agentHistory.length} past sessions
              </Typography>
              {agentHistory.length > 0 && (
                <IconButton
                  size="small"
                  color="error"
                  onClick={clearHistory}
                  title="Clear history"
                >
                  <DeleteSweepIcon fontSize="small" />
                </IconButton>
              )}
            </Box>

            {/* History List */}
            {agentHistory.length > 0 ? (
              <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* History sidebar */}
                <Box
                  sx={{
                    width: 180,
                    borderRight: 1,
                    borderColor: 'divider',
                    overflow: 'auto'
                  }}
                >
                  {agentHistory.map((entry) => (
                    <Box
                      key={entry.id}
                      onClick={() => handleHistorySelect(entry.id)}
                      sx={{
                        px: 1.5,
                        py: 1,
                        cursor: 'pointer',
                        borderBottom: 1,
                        borderColor: 'divider',
                        bgcolor: selectedHistoryId === entry.id ? 'action.selected' : 'transparent',
                        '&:hover': {
                          bgcolor: selectedHistoryId === entry.id ? 'action.selected' : 'action.hover'
                        }
                      }}
                    >
                      <Typography variant="caption" noWrap sx={{ display: 'block', fontWeight: 500 }}>
                        {entry.storyTitle}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <Chip
                          label={entry.status}
                          size="small"
                          color={getStatusColor(entry.status) as 'success' | 'default' | 'error' | 'warning'}
                          sx={{ height: 16, fontSize: '0.6rem' }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                          {formatTime(entry.startTime)}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>

                {/* History content */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {selectedHistory ? (
                    <>
                      <Box
                        sx={{
                          px: 2,
                          py: 1,
                          borderBottom: 1,
                          borderColor: 'divider',
                          bgcolor: 'background.paper'
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {selectedHistory.storyId}
                        </Typography>
                        {selectedHistory.command && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                            {selectedHistory.command}
                          </Typography>
                        )}
                      </Box>
                      {loadingHistoryOutput ? (
                        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Typography color="text.secondary">Loading output...</Typography>
                        </Box>
                      ) : (
                        <AgentTerminal output={loadedHistoryOutput} />
                      )}
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
                        Select a session to view
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            ) : (
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 4
                }}
              >
                <Typography color="text.secondary" textAlign="center">
                  No agent history yet.
                  <br />
                  Past sessions will appear here.
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>
    </Drawer>
  )
}
