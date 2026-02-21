import { useState, useMemo, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  IconButton, LinearProgress, Chip, Slider, List, ListItem, ListItemIcon,
  ListItemText, Tooltip
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import StopIcon from '@mui/icons-material/Stop'
import RefreshIcon from '@mui/icons-material/Refresh'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import ChatIcon from '@mui/icons-material/Chat'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import CircularProgress from '@mui/material/CircularProgress'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { Alert } from '@mui/material'
import { useStore } from '../../store'
import { useFullCycle } from '../../hooks/useFullCycle'
import FullCycleStepper from './FullCycleStepper'
import FullCycleLog from './FullCycleLog'
import type { EpicStoryStatus } from '../../types/fullCycle'

function getStoryStatusIcon(status: EpicStoryStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />
    case 'error':
      return <ErrorIcon sx={{ fontSize: 20, color: 'error.main' }} />
    case 'running':
      return <CircularProgress size={20} color="primary" />
    case 'pending':
    default:
      return <RadioButtonUncheckedIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
  }
}

export default function EpicCycleDialog() {
  const epicCycleDialogOpen = useStore((state) => state.epicCycleDialogOpen)
  const setEpicCycleDialogOpen = useStore((state) => state.setEpicCycleDialogOpen)
  const epicCycle = useStore((state) => state.epicCycle)
  const startEpicCycle = useStore((state) => state.startEpicCycle)
  const cancelEpicCycle = useStore((state) => state.cancelEpicCycle)
  const resetEpicCycle = useStore((state) => state.resetEpicCycle)
  const retryEpicCycle = useStore((state) => state.retryEpicCycle)
  const selectedEpicId = useStore((state) => state.selectedEpicId)
  const epics = useStore((state) => state.epics)
  const stories = useStore((state) => state.stories)
  const fullCycle = useStore((state) => state.fullCycle)
  const chatThreads = useStore((state) => state.chatThreads)
  const setSelectedChatAgent = useStore((state) => state.setSelectedChatAgent)
  const setViewMode = useStore((state) => state.setViewMode)

  const { steps, cancel: cancelSingleCycle, retry: retrySingleCycle } = useFullCycle()

  const [storyCount, setStoryCount] = useState(0)

  // Current epic info
  const isSetupMode = !epicCycle.isRunning && !epicCycle.error && epicCycle.storyQueue.length === 0

  // Detect stale results from a different epic
  const isDifferentEpic = epicCycle.epicId !== null && epicCycle.epicId !== selectedEpicId
  const isStale = isDifferentEpic && !epicCycle.isRunning
  const isRunningOnDifferentEpic = isDifferentEpic && epicCycle.isRunning

  // Auto-reset when dialog opens with stale (different, non-running) epic results
  useEffect(() => {
    if (epicCycleDialogOpen && isStale) {
      resetEpicCycle()
    }
  }, [epicCycleDialogOpen, isStale, resetEpicCycle])

  // Show the run's epic when viewing results, otherwise show selected epic
  const displayEpicId = !isSetupMode && epicCycle.epicId !== null ? epicCycle.epicId : selectedEpicId
  const epic = epics.find((e) => e.id === displayEpicId)
  const runningEpic = isRunningOnDifferentEpic ? epics.find((e) => e.id === epicCycle.epicId) : null

  // Eligible stories: all non-done stories for the selected epic
  const eligibleStories = useMemo(() => {
    if (selectedEpicId === null) return []
    return stories.filter((s) => s.epicId === selectedEpicId && s.status !== 'done')
  }, [selectedEpicId, stories])
  const isRunning = epicCycle.isRunning
  const isComplete = !epicCycle.isRunning && epicCycle.storyQueue.length > 0 &&
    epicCycle.currentStoryIndex >= epicCycle.storyQueue.length && !epicCycle.error
  const hasError = !!epicCycle.error

  // Reset story count when dialog opens
  const maxStories = eligibleStories.length
  const effectiveCount = Math.min(storyCount || maxStories, maxStories)

  // Stories in the queue (running mode)
  const queueStories = useMemo(() => {
    return epicCycle.storyQueue.map((id) => stories.find((s) => s.id === id)).filter(Boolean)
  }, [epicCycle.storyQueue, stories])

  // Current story being processed
  const currentStory = epicCycle.currentStoryIndex < epicCycle.storyQueue.length
    ? stories.find((s) => s.id === epicCycle.storyQueue[epicCycle.currentStoryIndex])
    : null

  // Get current step's agent for "Open Chat" button
  const currentStepConfig = steps[fullCycle.currentStep]
  const currentAgentId = currentStepConfig?.agentId

  // Progress
  const completedCount = epicCycle.storyStatuses.filter((s) => s === 'completed').length
  const totalCount = epicCycle.storyQueue.length
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const elapsedTime = epicCycle.startTime ? Date.now() - epicCycle.startTime : 0

  // Check if any agent is busy with a chat interaction
  const isAnyAgentBusy = Object.values(chatThreads).some(t => t?.isTyping)

  const handleStart = () => {
    if (!selectedEpicId) return
    if (fullCycle.isRunning || isAnyAgentBusy) return
    const selectedStories = eligibleStories.slice(0, effectiveCount)
    const storyIds = selectedStories.map((s) => s.id)
    startEpicCycle(selectedEpicId, storyIds)
  }

  const handleCancel = async () => {
    // Cancel current single-story cycle first
    if (fullCycle.isRunning) {
      await cancelSingleCycle()
    }
    cancelEpicCycle()
  }

  const handleRetry = () => {
    // Retry the failed single-story step, then resume epic queue
    retrySingleCycle()
    retryEpicCycle()
  }

  const handleNewRun = () => {
    // Reset back to setup mode
    resetEpicCycle()
  }

  const handleClose = () => {
    setEpicCycleDialogOpen(false)
  }

  const handleOpenChat = () => {
    if (currentAgentId) {
      setSelectedChatAgent(currentAgentId)
      setViewMode('chat')
      setEpicCycleDialogOpen(false)
    }
  }

  if (!epicCycleDialogOpen) return null

  return (
    <Dialog
      open={epicCycleDialogOpen}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { minHeight: 550, maxHeight: '85vh' }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <RocketLaunchIcon color="primary" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" component="span">
            Epic Full Cycle
          </Typography>
          {epic && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Epic {epic.id}: {epic.name}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {!isSetupMode && (
            <>
              <Chip
                size="small"
                label={
                  isComplete ? 'Complete' :
                  hasError ? 'Error' :
                  isRunning ? `Story ${epicCycle.currentStoryIndex + 1}/${totalCount}` :
                  'Ready'
                }
                color={isComplete ? 'success' : hasError ? 'error' : isRunning ? 'primary' : 'default'}
                sx={{ fontWeight: 600 }}
              />
              {epicCycle.startTime && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {formatDuration(elapsedTime)}
                </Typography>
              )}
            </>
          )}
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {!isSetupMode && (
        <LinearProgress
          variant="determinate"
          value={progress}
          color={hasError ? 'error' : isComplete ? 'success' : 'primary'}
          sx={{ height: 4 }}
        />
      )}

      <DialogContent sx={{ display: 'flex', gap: 2, p: 2 }}>
        {isSetupMode ? (
          /* ===== SETUP MODE ===== */
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {isRunningOnDifferentEpic && runningEpic && (
              <Alert
                severity="warning"
                icon={<WarningAmberIcon />}
                action={
                  <Button
                    color="warning"
                    size="small"
                    startIcon={<StopIcon />}
                    onClick={handleCancel}
                  >
                    Stop
                  </Button>
                }
              >
                Epic cycle is running on Epic {runningEpic.id}: {runningEpic.name}
              </Alert>
            )}
            {maxStories === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">
                  All stories in this epic are done.
                </Typography>
              </Box>
            ) : (
              <>
                <Box sx={{ px: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Stories to process: {effectiveCount} of {maxStories}
                  </Typography>
                  <Slider
                    value={effectiveCount}
                    onChange={(_, val) => setStoryCount(val as number)}
                    min={1}
                    max={maxStories}
                    step={1}
                    marks={maxStories <= 10 ? true : undefined}
                    valueLabelDisplay="auto"
                    sx={{ mt: 1 }}
                  />
                </Box>
                <Box sx={{ flex: 1, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <List dense disablePadding>
                    {eligibleStories.map((story, index) => {
                      const isIncluded = index < effectiveCount
                      return (
                        <ListItem
                          key={story.id}
                          sx={{
                            opacity: isIncluded ? 1 : 0.35,
                            borderBottom: 1,
                            borderColor: 'divider',
                            py: 0.75
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <Typography variant="caption" fontWeight={600} color="text.secondary">
                              {index + 1}.
                            </Typography>
                          </ListItemIcon>
                          <ListItemText
                            primary={`${story.epicId}-${story.storyNumber} ${story.title}`}
                            secondary={story.id}
                            primaryTypographyProps={{ variant: 'body2', fontWeight: isIncluded ? 500 : 400 }}
                            secondaryTypographyProps={{ variant: 'caption' }}
                          />
                          <Chip label={story.status} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem', mr: 0.5 }} />
                          {isIncluded && (
                            <Chip label="Included" size="small" color="primary" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                          )}
                        </ListItem>
                      )
                    })}
                  </List>
                </Box>
              </>
            )}
          </Box>
        ) : (
          /* ===== RUNNING / COMPLETED / ERROR MODE ===== */
          <>
            {/* Left panel: story queue */}
            <Box
              sx={{
                width: 260,
                flexShrink: 0,
                borderRight: 1,
                borderColor: 'divider',
                pr: 2,
                overflow: 'auto'
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                Story Queue ({completedCount}/{totalCount})
              </Typography>
              <List dense disablePadding>
                {queueStories.map((story, index) => {
                  if (!story) return null
                  const status = epicCycle.storyStatuses[index] || 'pending'
                  const isCurrent = index === epicCycle.currentStoryIndex && isRunning
                  return (
                    <ListItem
                      key={story.id}
                      sx={{
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                        bgcolor: isCurrent ? 'action.selected' : 'transparent',
                        opacity: status === 'pending' ? 0.6 : 1
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {getStoryStatusIcon(status)}
                      </ListItemIcon>
                      <ListItemText
                        primary={`${story.epicId}-${story.storyNumber} ${story.title}`}
                        primaryTypographyProps={{
                          variant: 'body2',
                          fontWeight: isCurrent ? 600 : 400,
                          noWrap: true,
                          color: status === 'error' ? 'error.main' : 'text.primary'
                        }}
                      />
                    </ListItem>
                  )
                })}
              </List>
            </Box>

            {/* Right panel: current story step progress + logs */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {currentStory && isRunning && (
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                  Current: {currentStory.title}
                </Typography>
              )}
              {isComplete && (
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'success.main' }}>
                  All stories completed!
                </Typography>
              )}
              {hasError && !isRunning && (
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'error.main' }}>
                  Stopped: {epicCycle.error}
                </Typography>
              )}

              {/* Step progress for current story (reuse FullCycleStepper) */}
              {(isRunning || hasError) && fullCycle.storyId && (
                <Box sx={{ mb: 1.5, maxHeight: 200, overflow: 'auto', borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                  <FullCycleStepper
                    steps={steps}
                    currentStep={fullCycle.currentStep}
                    stepStatuses={fullCycle.stepStatuses}
                  />
                </Box>
              )}

              {/* Log output */}
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'text.secondary' }}>
                  Output
                </Typography>
                <FullCycleLog logs={fullCycle.logs} />
              </Box>
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 2, justifyContent: 'space-between' }}>
        <Box>
          {isRunning && fullCycle.stepType === 'agent' && currentAgentId && (
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
          {isSetupMode && maxStories > 0 && (
            <Button
              onClick={handleStart}
              startIcon={<PlayArrowIcon />}
              variant="contained"
              color="primary"
              disabled={isRunningOnDifferentEpic || fullCycle.isRunning || isAnyAgentBusy}
            >
              Start ({effectiveCount} {effectiveCount === 1 ? 'story' : 'stories'})
            </Button>
          )}

          {hasError && !isRunning && (
            <>
              <Button
                onClick={handleRetry}
                startIcon={<RefreshIcon />}
                variant="outlined"
              >
                Retry
              </Button>
              <Button
                onClick={handleNewRun}
                startIcon={<RestartAltIcon />}
                variant="outlined"
                color="secondary"
              >
                New Run
              </Button>
            </>
          )}

          {isComplete && (
            <Button
              onClick={handleNewRun}
              startIcon={<RestartAltIcon />}
              variant="outlined"
              color="secondary"
            >
              New Run
            </Button>
          )}

          {isRunning && (
            <Button
              onClick={handleCancel}
              startIcon={<StopIcon />}
              color="error"
              variant="outlined"
            >
              Cancel
            </Button>
          )}

          <Button onClick={handleClose} variant={isComplete ? 'contained' : 'text'}>
            {isComplete ? 'Done' : 'Close'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}
