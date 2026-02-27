import { Box, Typography, Tooltip } from '@mui/material'
import CircularProgress from '@mui/material/CircularProgress'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import GitHubIcon from '@mui/icons-material/GitHub'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import ChecklistIcon from '@mui/icons-material/Checklist'
import { FullCycleStep, FullCycleStepStatus } from '../../types/fullCycle'

interface FullCycleStepperProps {
  steps: FullCycleStep[]
  currentStep: number
  stepStatuses: FullCycleStepStatus[]
}

// Get icon for step type
function getStepTypeIcon(step: FullCycleStep) {
  switch (step.type) {
    case 'git':
      return <GitHubIcon sx={{ fontSize: 14 }} />
    case 'agent':
      return <SmartToyIcon sx={{ fontSize: 14 }} />
    case 'status':
      return <ChecklistIcon sx={{ fontSize: 14 }} />
    default:
      return null
  }
}

// Get status icon with color
function getStatusIcon(status: FullCycleStepStatus, isActive: boolean) {
  if (isActive && status === 'running') {
    return <CircularProgress size={20} color="primary" />
  }

  switch (status) {
    case 'completed':
      return <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />
    case 'error':
      return <ErrorIcon sx={{ fontSize: 20, color: 'error.main' }} />
    case 'skipped':
      return <SkipNextIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
    case 'running':
      return <CircularProgress size={20} color="primary" />
    case 'pending':
    default:
      return <RadioButtonUncheckedIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
  }
}

export default function FullCycleStepper({ steps, currentStep, stepStatuses }: FullCycleStepperProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 1 }}>
      {steps.map((step, index) => {
        const status = stepStatuses[index] || 'pending'
        const isActive = index === currentStep
        const isPast = index < currentStep
        const isFuture = index > currentStep

        return (
          <Tooltip key={step.id} title={step.description} placement="right" arrow>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 0.75,
                borderRadius: 1,
                bgcolor: isActive ? 'action.selected' : 'transparent',
                opacity: isFuture ? 0.5 : 1,
                transition: 'all 0.2s'
              }}
            >
              {/* Status icon */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24 }}>
                {getStatusIcon(status, isActive)}
              </Box>

              {/* Step number and type icon */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 50 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: isActive ? 700 : 500,
                    color: isPast ? 'text.secondary' : isActive ? 'primary.main' : 'text.secondary',
                    minWidth: 20
                  }}
                >
                  {index + 1}.
                </Typography>
                <Box sx={{ color: 'text.disabled' }}>
                  {getStepTypeIcon(step)}
                </Box>
              </Box>

              {/* Step name */}
              <Typography
                variant="body2"
                sx={{
                  flex: 1,
                  fontWeight: isActive ? 600 : 400,
                  color: status === 'error' ? 'error.main' : status === 'skipped' ? 'text.disabled' : isActive ? 'text.primary' : isPast ? 'text.secondary' : 'text.secondary',
                  textDecoration: status === 'skipped' ? 'line-through' : 'none'
                }}
              >
                {step.name}
              </Typography>

              {/* Status label for non-pending */}
              {status !== 'pending' && status !== 'running' && (
                <Typography
                  variant="caption"
                  sx={{
                    color: status === 'completed' ? 'success.main' : status === 'error' ? 'error.main' : 'text.disabled',
                    textTransform: 'capitalize'
                  }}
                >
                  {status}
                </Typography>
              )}
            </Box>
          </Tooltip>
        )
      })}
    </Box>
  )
}
