import { Box, Typography, Chip, Tooltip } from '@mui/material'
import CircularProgress from '@mui/material/CircularProgress'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import TerminalIcon from '@mui/icons-material/Terminal'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'
import { WizardStep, WizardStepStatus, WizardPhase } from '../../types/projectWizard'
import { PHASE_LABELS } from '../../data/wizardSteps'

interface WizardStepperProps {
  steps: WizardStep[]
  currentStep: number
  stepStatuses: WizardStepStatus[]
  stepCounts?: Record<string, number>
  stepNames?: Record<string, string[]>
  activeSubStep?: { commandRef: string; current: number }
  stepWarnings?: Set<number>
  onStartStep?: (stepIndex: number) => void
  onGoToStep?: (stepIndex: number) => void
}

function getStatusIcon(status: WizardStepStatus, isActive: boolean) {
  if (isActive && status === 'active') {
    return <CircularProgress size={20} color="primary" />
  }

  switch (status) {
    case 'completed':
      return <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />
    case 'error':
      return <ErrorIcon sx={{ fontSize: 20, color: 'error.main' }} />
    case 'skipped':
      return <SkipNextIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
    case 'active':
      return <CircularProgress size={20} color="primary" />
    case 'pending':
    default:
      return <RadioButtonUncheckedIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
  }
}

function getStepTypeIcon(step: WizardStep) {
  return step.type === 'system'
    ? <TerminalIcon sx={{ fontSize: 14 }} />
    : <SmartToyIcon sx={{ fontSize: 14 }} />
}

function getPhaseColor(phase: WizardPhase): string {
  switch (phase) {
    case 'install': return '#6366F1'
    case 'analysis': return '#8B5CF6'
    case 'planning': return '#3B82F6'
    case 'solutioning': return '#10B981'
    case 'implementation': return '#F59E0B'
    default: return '#6B7280'
  }
}

export default function WizardStepper({ steps, currentStep, stepStatuses, stepCounts, stepNames, activeSubStep, stepWarnings, onStartStep, onGoToStep }: WizardStepperProps) {
  let lastPhase: WizardPhase | null = null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, py: 1 }}>
      {steps.map((step, index) => {
        const status = stepStatuses[index] || 'pending'
        const isActive = index === currentStep
        const isPast = status === 'completed' || status === 'skipped'
        const isFuture = index > currentStep && status === 'pending'
        const showPhaseHeader = step.phase !== lastPhase
        lastPhase = step.phase

        // Step count info
        const stepCount = step.commandRef && stepCounts ? (stepCounts[step.commandRef] || 0) : 0
        const isActiveSubStep = isActive && status === 'active' && activeSubStep && step.commandRef === activeSubStep.commandRef

        return (
          <Box key={step.id}>
            {/* Phase header */}
            {showPhaseHeader && (
              <Box sx={{ px: 1.5, pt: index === 0 ? 0 : 1.5, pb: 0.5 }}>
                <Chip
                  label={PHASE_LABELS[step.phase] || step.phase}
                  size="small"
                  sx={{
                    bgcolor: getPhaseColor(step.phase),
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '0.7rem',
                    height: 22
                  }}
                />
              </Box>
            )}

            {/* Step row */}
            <Box
              onClick={() => {
                if (isActive && status === 'pending' && onStartStep) {
                  onStartStep(index)
                } else if ((isPast || isActive) && index > 0 && onGoToStep) {
                  onGoToStep(index)
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.75,
                borderRadius: 1,
                bgcolor: isActive ? 'action.selected' : 'transparent',
                opacity: isFuture ? 0.5 : 1,
                transition: 'all 0.2s',
                cursor: (isActive && status === 'pending') || ((isPast || isActive) && index > 0) ? 'pointer' : 'default',
                '&:hover': (isActive && status === 'pending') || ((isPast || isActive) && index > 0) ? { bgcolor: 'action.hover' } : {}
              }}
            >
              {/* Status icon */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, flexShrink: 0 }}>
                {getStatusIcon(status, isActive)}
              </Box>

              {/* Step type icon */}
              <Box sx={{ color: 'text.disabled', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                {getStepTypeIcon(step)}
              </Box>

              {/* Step name + agent */}
              <Box sx={{ flex: 1, overflow: 'hidden' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: isActive ? 600 : 400,
                      color: status === 'error' ? 'error.main' : status === 'skipped' ? 'text.disabled' : isActive ? 'text.primary' : isPast ? 'text.secondary' : 'text.secondary',
                      textDecoration: status === 'skipped' ? 'line-through' : 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: step.agentName ? 1.3 : 1.5
                    }}
                  >
                    {step.name}
                  </Typography>
                  {stepWarnings?.has(index) && (
                    <Tooltip title="Output appears to be an unfilled template" arrow>
                      <ReportProblemOutlinedIcon sx={{ fontSize: 14, color: 'error.main', flexShrink: 0 }} />
                    </Tooltip>
                  )}
                  {(step.tooltip || step.subSteps?.length || (step.commandRef && stepNames?.[step.commandRef]?.length)) && (
                    <Tooltip
                      title={
                        <Box>
                          {step.tooltip && <Box sx={{ mb: (step.commandRef && stepNames?.[step.commandRef]?.length) || step.subSteps?.length ? 0.75 : 0 }}>{step.tooltip}</Box>}
                          {step.commandRef && stepNames?.[step.commandRef]?.length ? (
                            <Box component="ol" sx={{ m: 0, pl: 2.5, '& li': { py: 0.125 } }}>
                              {stepNames[step.commandRef].map((name, i) => {
                                const isCurrent = isActiveSubStep && activeSubStep && i + 1 === activeSubStep.current
                                const isDone = isActiveSubStep && activeSubStep && i + 1 < activeSubStep.current
                                return (
                                  <Box
                                    component="li"
                                    key={i}
                                    sx={{
                                      fontWeight: isCurrent ? 700 : 400,
                                      opacity: isDone ? 0.5 : 1,
                                      color: isCurrent ? 'primary.light' : 'inherit'
                                    }}
                                  >
                                    {name}
                                  </Box>
                                )
                              })}
                            </Box>
                          ) : step.subSteps?.length ? (
                            <Box component="ul" sx={{ m: 0, pl: 2, '& li': { py: 0.125 } }}>
                              {step.subSteps.map((sub, i) => {
                                // Map activeSubStep progress proportionally onto static subSteps
                                const totalSteps = step.commandRef && stepCounts ? (stepCounts[step.commandRef] || 0) : 0
                                const mappedIndex = isActiveSubStep && activeSubStep && totalSteps > 0
                                  ? Math.floor((activeSubStep.current - 1) / totalSteps * step.subSteps!.length)
                                  : -1
                                const isCurrent = mappedIndex === i
                                const isDone = mappedIndex > i
                                return (
                                  <Box
                                    component="li"
                                    key={i}
                                    sx={{
                                      fontWeight: isCurrent ? 700 : 400,
                                      opacity: isDone ? 0.5 : 1,
                                      color: isCurrent ? 'primary.light' : 'inherit'
                                    }}
                                  >
                                    {sub}
                                  </Box>
                                )
                              })}
                            </Box>
                          ) : null}
                        </Box>
                      }
                      placement="right"
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
                {(step.agentName || stepCount > 0) && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {step.agentName && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: isActive ? 'primary.main' : 'text.disabled',
                          fontStyle: 'italic',
                          lineHeight: 1.2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {step.agentName}
                      </Typography>
                    )}
                    {stepCount > 0 && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: isActiveSubStep ? 'primary.main' : 'text.disabled',
                          fontSize: '0.65rem',
                          lineHeight: 1.2,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {isActiveSubStep
                          ? `Step ${activeSubStep.current} of ${stepCount}`
                          : `${stepCount} steps`}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>

              {/* Required / Optional badge */}
              {step.required && status === 'pending' && (
                <Chip label="Required" size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'warning.light', color: 'warning.contrastText' }} />
              )}
              {!step.required && (status === 'pending' || (isActive && status === 'active')) && (
                <Chip label="Optional" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', borderColor: 'text.disabled', color: 'text.disabled' }} />
              )}

              {/* Status label for completed/error */}
              {status !== 'pending' && status !== 'active' && (
                <Typography
                  variant="caption"
                  sx={{
                    color: status === 'completed' ? 'success.main' : status === 'error' ? 'error.main' : 'text.disabled',
                    textTransform: 'capitalize',
                    flexShrink: 0
                  }}
                >
                  {status}
                </Typography>
              )}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
