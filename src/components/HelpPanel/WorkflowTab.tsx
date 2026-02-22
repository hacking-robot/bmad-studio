import { Box, Typography, Paper, Stack, Chip } from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import { useWorkflow } from '../../hooks/useWorkflow'
import type { StoryStatus } from '../../types'

export default function WorkflowTab() {
  const { statuses, getAgentName, getPrimaryNextStep } = useWorkflow()

  // Get visible statuses for the flow diagram
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
