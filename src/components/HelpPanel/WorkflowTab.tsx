import { Box, Typography, Paper, Stack, Chip } from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import { useStore } from '../../store'
import { hasBoardModule } from '../../utils/projectTypes'
import { useWorkflow } from '../../hooks/useWorkflow'
import type { StoryStatus } from '../../types'

export default function WorkflowTab() {
  const projectType = useStore((state) => state.projectType)
  const bmadScanResult = useStore((state) => state.bmadScanResult)
  const hasBrd = bmadScanResult?.modules ? hasBoardModule(bmadScanResult.modules) : projectType !== 'dashboard'

  const { statuses, getAgentName, getPrimaryNextStep, getProjectWorkflows } = useWorkflow()

  // Dashboard projects: show project workflows grouped by module/phase
  if (!hasBrd) {
    const projectWorkflows = getProjectWorkflows()
    const phases = Object.entries(projectWorkflows)

    return (
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Available workflows organized by module. Each workflow can be run by its assigned agent.
        </Typography>

        {phases.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No workflows available. Install BMAD modules to see available workflows.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {phases.map(([phaseId, phase]) => {
              const agentIds = [...new Set(phase.workflows.map((wf) => wf.agentId))]

              return (
                <Paper
                  key={phaseId}
                  variant="outlined"
                  sx={{ p: 2, borderLeft: 4, borderLeftColor: 'primary.main' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography fontSize="1.2rem">{phase.icon}</Typography>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {phase.label}
                    </Typography>
                  </Box>
                  {phase.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {phase.description}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                    {agentIds.map((id) => (
                      <Chip
                        key={id}
                        label={getAgentName(id)}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ height: 22, fontSize: '0.75rem' }}
                      />
                    ))}
                  </Box>
                  <Stack spacing={1}>
                    {phase.workflows.map((wf) => (
                      <Box
                        key={wf.command}
                        sx={{
                          bgcolor: 'action.hover',
                          p: 1,
                          borderRadius: 1,
                        }}
                      >
                        <Typography variant="body2" fontWeight={500}>
                          {wf.label}
                        </Typography>
                        {wf.description && (
                          <Typography variant="caption" color="text.secondary">
                            {wf.description}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Stack>
                </Paper>
              )
            })}
          </Stack>
        )}
      </Box>
    )
  }

  // Board projects: show story status lifecycle
  const visibleStatuses = statuses.filter((s) => s.visible).sort((a, b) => a.displayOrder - b.displayOrder)
  const optionalStatus = statuses.find((s) => s.id === 'optional')

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Stories progress through these statuses as they move from idea to completion.
        Each status indicates where a story is in the development lifecycle and which agent can help.
      </Typography>

      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 3,
          bgcolor: 'action.hover',
          textAlign: 'center'
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Story Lifecycle Flow
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 1
          }}
        >
          {visibleStatuses.map((status, index) => (
            <Box key={status.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label={status.label} size="small" sx={{ bgcolor: status.color, color: 'white' }} />
              {index < visibleStatuses.length - 1 && (
                <ArrowForwardIcon sx={{ color: 'text.disabled', fontSize: 16 }} />
              )}
            </Box>
          ))}
        </Box>
        {optionalStatus && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <ArrowDownwardIcon sx={{ color: 'text.disabled', fontSize: 16 }} />
              <Chip label={optionalStatus.label} size="small" variant="outlined" sx={{ borderColor: optionalStatus.color }} />
            </Box>
          </Box>
        )}
      </Paper>

      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Status Details
      </Typography>

      <Stack spacing={2}>
        {statuses.map((status) => {
          const primaryStep = getPrimaryNextStep(status.id as StoryStatus)
          const agentName = primaryStep ? getAgentName(primaryStep.agentId) : null

          return (
            <Paper
              key={status.id}
              variant="outlined"
              sx={{
                p: 2,
                borderLeft: 4,
                borderLeftColor: status.color
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Chip
                  label={status.label}
                  size="small"
                  sx={{
                    bgcolor: status.color,
                    color: 'white',
                    fontWeight: 600
                  }}
                />
                {agentName && (
                  <Typography variant="caption" color="text.secondary">
                    {agentName}
                  </Typography>
                )}
              </Box>

              <Typography variant="body2" sx={{ mb: 1 }}>
                {status.description}
              </Typography>

              {primaryStep && (
                <Typography
                  variant="body2"
                  sx={{
                    bgcolor: 'action.hover',
                    p: 1,
                    borderRadius: 1,
                    fontStyle: 'italic',
                    fontSize: '0.85rem'
                  }}
                >
                  <strong>Next:</strong> {primaryStep.description}
                </Typography>
              )}
            </Paper>
          )
        })}
      </Stack>
    </Box>
  )
}
