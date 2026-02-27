import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, IconButton, LinearProgress, Chip, Tooltip } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import MinimizeIcon from '@mui/icons-material/Minimize'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import StopIcon from '@mui/icons-material/Stop'
import RefreshIcon from '@mui/icons-material/Refresh'
import ChatIcon from '@mui/icons-material/Chat'
import { useStore } from '../../store'
import { useFullCycle } from '../../hooks/useFullCycle'
import FullCycleStepper from './FullCycleStepper'
import FullCycleLog from './FullCycleLog'

export default function FullCycleDialog() {
  const fullCycleDialogOpen = useStore((state) => state.fullCycleDialogOpen)
  const setFullCycleDialogOpen = useStore((state) => state.setFullCycleDialogOpen)
  const setFullCycleMinimized = useStore((state) => state.setFullCycleMinimized)
  const stories = useStore((state) => state.stories)
  const setSelectedChatAgent = useStore((state) => state.setSelectedChatAgent)
  const setViewMode = useStore((state) => state.setViewMode)

  const { fullCycle, steps, cancel, retry } = useFullCycle()

  // Get the current step's agent ID
  const currentStepConfig = steps[fullCycle.currentStep]
  const currentAgentId = currentStepConfig?.agentId

  // Get the story being processed
  const story = fullCycle.storyId ? stories.find((s) => s.id === fullCycle.storyId) : null

  // Calculate progress
  const progress = fullCycle.totalSteps > 0 ? (fullCycle.currentStep / fullCycle.totalSteps) * 100 : 0
  const isComplete = !fullCycle.isRunning && fullCycle.currentStep >= fullCycle.totalSteps && !fullCycle.error
  const hasError = !!fullCycle.error

  const handleClose = () => {
    if (fullCycle.isRunning) {
      // Minimize instead of closing if still running
      setFullCycleMinimized(true)
    }
    setFullCycleDialogOpen(false)
  }

  const handleMinimize = () => {
    setFullCycleMinimized(true)
    setFullCycleDialogOpen(false)
  }

  const handleCancel = () => {
    cancel()
  }

  const handleRetry = () => {
    retry()
  }

  const handleOpenChat = () => {
    if (currentAgentId) {
      setSelectedChatAgent(currentAgentId)
      setViewMode('chat')
      setFullCycleMinimized(true)
      setFullCycleDialogOpen(false)
    }
  }

  // Format duration
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  const elapsedTime = fullCycle.startTime ? Date.now() - fullCycle.startTime : 0

  return (
    <Dialog
      open={fullCycleDialogOpen}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: 500 }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <RocketLaunchIcon color="primary" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" component="span">
            Full Cycle Automation
          </Typography>
          {story && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {story.title}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* Status chip */}
          <Chip
            size="small"
            label={
              isComplete ? 'Complete' :
              hasError ? 'Error' :
              fullCycle.isRunning ? `Step ${fullCycle.currentStep + 1}/${fullCycle.totalSteps}` :
              'Ready'
            }
            color={isComplete ? 'success' : hasError ? 'error' : fullCycle.isRunning ? 'primary' : 'default'}
            sx={{ fontWeight: 600 }}
          />
          {/* Duration */}
          {fullCycle.startTime && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {formatDuration(elapsedTime)}
            </Typography>
          )}
        </Box>
        <IconButton
          onClick={handleMinimize}
          size="small"
          disabled={!fullCycle.isRunning}
          sx={{ ml: 1 }}
        >
          <MinimizeIcon />
        </IconButton>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={progress}
        color={hasError ? 'error' : isComplete ? 'success' : 'primary'}
        sx={{ height: 4 }}
      />

      <DialogContent sx={{ display: 'flex', gap: 2, p: 2 }}>
        {/* Left side - Stepper */}
        <Box
          sx={{
            width: 280,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            pr: 2
          }}
        >
          <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
            Steps
          </Typography>
          <FullCycleStepper
            steps={steps}
            currentStep={fullCycle.currentStep}
            stepStatuses={fullCycle.stepStatuses}
          />
        </Box>

        {/* Right side - Log output */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
            Output
          </Typography>
          <FullCycleLog logs={fullCycle.logs} />

          {/* Error message */}
          {hasError && (
            <Box
              sx={{
                mt: 1.5,
                p: 1.5,
                bgcolor: 'error.main',
                color: 'error.contrastText',
                borderRadius: 1
              }}
            >
              <Typography variant="body2" fontWeight={600}>
                Error: {fullCycle.error}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 2, justifyContent: 'space-between' }}>
        <Box>
          {/* Open Chat button (shown when agent step is running) */}
          {fullCycle.isRunning && fullCycle.stepType === 'agent' && currentAgentId && (
            <Tooltip title={`View ${currentAgentId} chat in sidebar`}>
              <Button
                onClick={handleOpenChat}
                startIcon={<ChatIcon />}
                variant="outlined"
                size="small"
              >
                Open Chat
              </Button>
            </Tooltip>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {/* Retry button (shown on error) */}
          {hasError && (
            <Button
              onClick={handleRetry}
              startIcon={<RefreshIcon />}
              variant="outlined"
            >
              Retry
            </Button>
          )}

          {/* Cancel button (shown while running) */}
          {fullCycle.isRunning && (
            <Button
              onClick={handleCancel}
              startIcon={<StopIcon />}
              color="error"
              variant="outlined"
            >
              Cancel
            </Button>
          )}

          {/* Close button */}
          <Button onClick={handleClose} variant={isComplete ? 'contained' : 'text'}>
            {isComplete ? 'Done' : 'Close'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}
