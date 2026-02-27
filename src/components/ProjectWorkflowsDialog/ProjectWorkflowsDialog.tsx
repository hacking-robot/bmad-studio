import { useMemo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Button,
  IconButton,
  Avatar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useStore } from '../../store'
import { useWorkflow } from '../../hooks/useWorkflow'
import { transformCommand } from '../../utils/commandTransform'

export default function ProjectWorkflowsDialog() {
  const open = useStore((state) => state.projectWorkflowsDialogOpen)
  const setOpen = useStore((state) => state.setProjectWorkflowsDialogOpen)
  const setViewMode = useStore((state) => state.setViewMode)
  const setSelectedChatAgent = useStore((state) => state.setSelectedChatAgent)
  const setPendingChatMessage = useStore((state) => state.setPendingChatMessage)
  const clearChatThread = useStore((state) => state.clearChatThread)
  const aiTool = useStore((state) => state.aiTool)

  const { getProjectWorkflows, getAgent } = useWorkflow()
  const phases = useMemo(() => getProjectWorkflows(), [getProjectWorkflows])
  const phaseEntries = Object.entries(phases)

  const handleRun = (agentId: string, command: string) => {
    window.chatAPI.cancelMessage(agentId).catch(() => {})
    clearChatThread(agentId)
    setViewMode('chat')
    setSelectedChatAgent(agentId)
    setPendingChatMessage({
      agentId,
      message: transformCommand(command, aiTool)
    })
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { maxHeight: '80vh' }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="h6" component="span">Project Workflows</Typography>
        <IconButton onClick={() => setOpen(false)} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ px: 2, pb: 2 }}>
        {phaseEntries.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No project workflows available. Make sure BMAD is installed and scanned.
          </Typography>
        ) : (
          phaseEntries.map(([phaseId, phase]) => (
            <Accordion key={phaseId} defaultExpanded disableGutters elevation={0} sx={{
              '&:before': { display: 'none' },
              border: 1,
              borderColor: 'divider',
              borderRadius: '8px !important',
              mb: 1.5,
              overflow: 'hidden'
            }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  minHeight: 44,
                  '& .MuiAccordionSummary-content': { my: 0.5 }
                }}
              >
                <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                        borderColor: 'divider'
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
                            flexShrink: 0
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
                                  sx: { maxWidth: 300, fontSize: '0.75rem', lineHeight: 1.4 }
                                }
                              }}
                            >
                              <InfoOutlinedIcon
                                sx={{
                                  fontSize: 14,
                                  color: 'text.disabled',
                                  cursor: 'help',
                                  flexShrink: 0,
                                  '&:hover': { color: 'primary.main' }
                                }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
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
          ))
        )}
      </DialogContent>
    </Dialog>
  )
}
