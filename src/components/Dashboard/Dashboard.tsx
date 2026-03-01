import { useMemo } from 'react'
import {
  Box,
  Typography,
  Chip,
  Avatar,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ChatIcon from '@mui/icons-material/Chat'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useStore } from '../../store'
import { useWorkflow } from '../../hooks/useWorkflow'
import { transformCommand } from '../../utils/commandTransform'

const MODULE_COLORS: Record<string, string> = {
  core: '#6B7280',
  bmb: '#D97706',
  cis: '#7C3AED',
  tea: '#059669',
  bmm: '#2563EB',
  gds: '#DC2626',
}

export default function Dashboard() {
  const bmadScanResult = useStore((state) => state.bmadScanResult)
  const setViewMode = useStore((state) => state.setViewMode)
  const setSelectedChatAgent = useStore((state) => state.setSelectedChatAgent)
  const setPendingChatMessage = useStore((state) => state.setPendingChatMessage)
  const clearChatThread = useStore((state) => state.clearChatThread)
  const aiTool = useStore((state) => state.aiTool)

  const { getProjectWorkflows, agents, getAgent } = useWorkflow()
  const phases = useMemo(() => getProjectWorkflows(), [getProjectWorkflows])
  const phaseEntries = Object.entries(phases)

  const modules = bmadScanResult?.modules?.filter(m => m !== 'core') || []

  const handleRun = (agentId: string, command: string) => {
    const currentPath = useStore.getState().projectPath
    window.chatAPI.cancelMessage(agentId, currentPath || undefined).catch(() => {})
    clearChatThread(agentId)
    // Also clear on-disk JSONL so the loadThreadData effect doesn't restore old messages
    if (currentPath) {
      window.chatAPI.clearThread(currentPath, agentId)
    }
    setViewMode('chat')
    setSelectedChatAgent(agentId)
    setPendingChatMessage({
      agentId,
      message: transformCommand(command, aiTool)
    })
  }

  const handleChatWithAgent = (agentId: string) => {
    setSelectedChatAgent(agentId)
    setViewMode('chat')
  }

  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        px: { xs: 2, sm: 4, md: 6 },
        py: 3,
      }}
    >
      {/* Module Chips */}
      {modules.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
          {modules.map((mod) => (
            <Chip
              key={mod}
              label={mod.toUpperCase()}
              size="small"
              sx={{
                fontWeight: 600,
                fontSize: '0.7rem',
                bgcolor: MODULE_COLORS[mod] || '#6B7280',
                color: 'white',
              }}
            />
          ))}
        </Box>
      )}

      {/* Workflow Sections */}
      {phaseEntries.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Workflows
          </Typography>
          {phaseEntries.map(([phaseId, phase]) => (
            <Accordion
              key={phaseId}
              defaultExpanded
              disableGutters
              elevation={0}
              sx={{
                '&:before': { display: 'none' },
                border: 1,
                borderColor: 'divider',
                borderRadius: '8px !important',
                mb: 1.5,
                overflow: 'hidden',
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  minHeight: 44,
                  '& .MuiAccordionSummary-content': { my: 0.5 },
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <span>{phase.icon}</span> {phase.label}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, px: 2, pb: 1.5 }}>
                {phase.workflows.map((wf, i) => {
                  const agent = getAgent(wf.agentId)
                  return (
                    <Box
                      key={i}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        py: 1.5,
                        borderTop: i > 0 ? 1 : 0,
                        borderColor: 'divider',
                      }}
                    >
                      {agent && (
                        <Avatar
                          sx={{
                            width: 28,
                            height: 28,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            bgcolor: agent.color,
                            flexShrink: 0,
                          }}
                        >
                          {agent.avatar}
                        </Avatar>
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {wf.label}
                          </Typography>
                          {wf.tooltip && (
                            <Tooltip
                              title={wf.tooltip}
                              placement="top"
                              arrow
                              slotProps={{
                                tooltip: {
                                  sx: { maxWidth: 300, fontSize: '0.75rem', lineHeight: 1.4 },
                                },
                              }}
                            >
                              <InfoOutlinedIcon
                                sx={{
                                  fontSize: 14,
                                  color: 'text.disabled',
                                  cursor: 'help',
                                  flexShrink: 0,
                                  '&:hover': { color: 'primary.main' },
                                }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block' }}
                        >
                          {wf.description}
                          {agent && ` · ${agent.name}`}
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PlayArrowIcon sx={{ fontSize: '16px !important' }} />}
                        onClick={() => handleRun(wf.agentId, wf.command)}
                        sx={{ flexShrink: 0, textTransform: 'none', minWidth: 72 }}
                      >
                        Run
                      </Button>
                    </Box>
                  )
                })}
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}

      {/* Agent Cards */}
      {agents.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Agents
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 2,
            }}
          >
            {agents.map((agent) => (
              <Box
                key={agent.id}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  transition: 'border-color 0.15s',
                  '&:hover': { borderColor: 'primary.main' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Avatar
                    sx={{
                      width: 36,
                      height: 36,
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      bgcolor: agent.color,
                    }}
                  >
                    {agent.avatar}
                  </Avatar>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {agent.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {agent.role}
                    </Typography>
                  </Box>
                </Box>
                {agent.description && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {agent.description}
                  </Typography>
                )}
                <Button
                  size="small"
                  variant="text"
                  startIcon={<ChatIcon sx={{ fontSize: '16px !important' }} />}
                  onClick={() => handleChatWithAgent(agent.id)}
                  sx={{ alignSelf: 'flex-start', textTransform: 'none', mt: 'auto' }}
                >
                  Chat
                </Button>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Empty state */}
      {phaseEntries.length === 0 && agents.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary">
            No agents or workflows found. Make sure BMAD is installed and scanned.
          </Typography>
        </Box>
      )}
    </Box>
  )
}
