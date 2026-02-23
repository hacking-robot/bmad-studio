import { useState, useEffect } from 'react'
import { Card, CardContent, Typography, Box, Chip, Button, CircularProgress, Tooltip, IconButton, Menu, Snackbar } from '@mui/material'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import DescriptionIcon from '@mui/icons-material/Description'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import PersonIcon from '@mui/icons-material/Person'
import GitHubIcon from '@mui/icons-material/GitHub'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import ChecklistIcon from '@mui/icons-material/Checklist'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import GroupsIcon from '@mui/icons-material/Groups'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Story, EPIC_COLORS, AI_TOOLS } from '../../types'
import type { AgentDefinition } from '../../types/flow'
import { useStore } from '../../store'
import { useWorkflow } from '../../hooks/useWorkflow'
import { useFullCycle } from '../../hooks/useFullCycle'
import { transformCommand } from '../../utils/commandTransform'

interface StoryCardProps {
  story: Story
  isDragging?: boolean
  disableDrag?: boolean
  isLocked?: boolean
  workingTeammate?: AgentDefinition
}

export default function StoryCard({ story, isDragging = false, disableDrag = false, isLocked = false, workingTeammate }: StoryCardProps) {
  const setSelectedStory = useStore((state) => state.setSelectedStory)
  const projectPath = useStore((state) => state.projectPath)
  const agents = useStore((state) => state.agents)
  const humanReviewChecklist = useStore((state) => state.humanReviewChecklist)
  const humanReviewStates = useStore((state) => state.humanReviewStates)
  const enableHumanReviewColumn = useStore((state) => state.enableHumanReviewColumn)
  const getEffectiveStatus = useStore((state) => state.getEffectiveStatus)
  const aiTool = useStore((state) => state.aiTool)
  const setViewMode = useStore((state) => state.setViewMode)
  const setSelectedChatAgent = useStore((state) => state.setSelectedChatAgent)
  const setPendingChatMessage = useStore((state) => state.setPendingChatMessage)
  const clearChatThread = useStore((state) => state.clearChatThread)
  const chatThreads = useStore((state) => state.chatThreads)

  const developerMode = useStore((state) => state.developerMode)

  // Check if selected AI tool supports headless CLI operation
  const selectedToolInfo = AI_TOOLS.find(t => t.id === aiTool)
  const toolSupportsHeadless = selectedToolInfo?.cli.supportsHeadless ?? false

  const { getNextSteps, getAgent } = useWorkflow()
  const { fullCycle, start: startFullCycle } = useFullCycle()
  const epicCycle = useStore((state) => state.epicCycle)

  // Get effective status (may be overridden to 'human-review' at app level)
  const effectiveStatus = getEffectiveStatus(story)

  // Human review progress
  const reviewState = humanReviewStates[story.id]
  const checkedCount = reviewState?.checkedItems.length || 0
  const totalItems = humanReviewChecklist.length
  const allApproved = checkedCount === totalItems && totalItems > 0

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('')
  const [branchExists, setBranchExists] = useState(false)
  const [isActivelyWorking, setIsActivelyWorking] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [creatingBranch, setCreatingBranch] = useState(false)

  // Get git state from store (reactive)
  const currentBranch = useStore((state) => state.currentBranch)
  const hasUncommittedChanges = useStore((state) => state.hasUncommittedChanges)
  const setHasUncommittedChanges = useStore((state) => state.setHasUncommittedChanges)
  const setCurrentBranch = useStore((state) => state.setCurrentBranch)
  const bmadInGitignore = useStore((state) => state.bmadInGitignore)
  const enableEpicBranches = useStore((state) => state.enableEpicBranches)
  const baseBranch = useStore((state) => state.baseBranch)
  const disableGitBranching = useStore((state) => state.disableGitBranching)

  // Compute if we're on this story's branch (derived from store state)
  const storyBranchName = story.id
  const isOnStoryBranch = currentBranch === storyBranchName

  // Check if we're on the epic branch (required for creating story branch when epic branches enabled)
  const epicBranchPrefix = `epic-${story.epicId}-`
  const isOnEpicBranch = currentBranch?.startsWith(epicBranchPrefix) || false

  // Check if we're on the base branch (can create story branch from here when epic branches disabled)
  const isOnBaseBranch = currentBranch === baseBranch

  // When bmad is gitignored, branch restrictions are relaxed since data persists across branches
  // These determine if actions are allowed (separate from actual branch state for UI)
  const canExecuteOnAnyBranch = bmadInGitignore || disableGitBranching
  const canExecuteStoryActions = isOnStoryBranch || canExecuteOnAnyBranch
  // When epic branches are disabled, we can create story branches from anywhere (they'll be created from base branch)
  // When epic branches are enabled, must be on the epic branch to create story branches
  const canCreateBranchFromHere = isOnEpicBranch || canExecuteOnAnyBranch || !enableEpicBranches

  // Make card sortable (draggable + reorderable)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isBeingDragged } = useSortable({
    id: story.id,
    disabled: disableDrag
  })
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isBeingDragged ? 1000 : undefined
  }

  // Stop propagation on interactive elements to prevent drag from starting
  const preventDragOnInteractive = (e: React.PointerEvent) => {
    e.stopPropagation()
  }

  // Check if the story's branch exists and has recent activity
  useEffect(() => {
    const checkBranchStatus = async () => {
      if (!projectPath) {
        setBranchExists(false)
        setIsActivelyWorking(false)
        return
      }

      try {
        // Branch name format: epicId-storyId
        const fullBranchName = story.id

        // Check if branch exists
        const existsResult = await window.gitAPI.branchExists(projectPath, fullBranchName)
        setBranchExists(existsResult.exists)

        // If branch exists, check for activity
        if (existsResult.exists) {
          const activityResult = await window.gitAPI.getBranchActivity(projectPath, fullBranchName)
          setIsActivelyWorking(activityResult.isActive)
        } else {
          setIsActivelyWorking(false)
        }
      } catch {
        setBranchExists(false)
        setIsActivelyWorking(false)
      }
    }

    checkBranchStatus()

    // Re-check activity periodically (every 15 seconds) for active stories
    let interval: NodeJS.Timeout | null = null
    if ((story.status === 'in-progress' || story.status === 'review') && projectPath) {
      interval = setInterval(checkBranchStatus, 15000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [projectPath, story.epicId, story.id, story.status])

  const epicColor = EPIC_COLORS[(story.epicId - 1) % EPIC_COLORS.length]
  const nextSteps = getNextSteps(effectiveStatus)
  const runningAgent = Object.values(agents).find((a) => a.storyId === story.id && a.status === 'running')

  const handleClick = () => {
    setSelectedStory(story)
  }

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    setMenuAnchor(e.currentTarget)
  }

  const handleMenuClose = () => {
    setMenuAnchor(null)
  }

  const handleCopySingle = (command: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }
    navigator.clipboard.writeText(command)
    setSnackbarMessage(`Copied: ${command.length > 40 ? command.substring(0, 40) + '...' : command}`)
    setSnackbarOpen(true)
  }

  // Generate branch name: story.id already contains epicId-storyNumber-slug
  const branchName = story.id
  const gitBranchCommand = `git checkout -b "${branchName}"`

  // Git commands for committing (combined add + commit)
  const gitCommitMessageImpl = `feat(${branchName}): implement story ${story.epicId}.${story.storyNumber}`
  const gitCommitMessageComplete = `feat(${branchName}): complete story ${story.epicId}.${story.storyNumber}`
  const gitCommitMessage = effectiveStatus === 'review' ? gitCommitMessageImpl : gitCommitMessageComplete
  const gitCommitCommand = `git add . && git commit -m "${gitCommitMessage}"`

  // Handle commit action
  const handleCommit = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!projectPath) return

    setCommitting(true)
    try {
      const result = await window.gitAPI.commit(projectPath, gitCommitMessage)
      if (result.success) {
        setHasUncommittedChanges(false)
        setSnackbarMessage('Changes committed successfully')
        setSnackbarOpen(true)
        handleMenuClose()
      } else {
        setSnackbarMessage(result.error || 'Failed to commit')
        setSnackbarOpen(true)
      }
    } catch {
      setSnackbarMessage('Failed to commit changes')
      setSnackbarOpen(true)
    } finally {
      setCommitting(false)
    }
  }

  // Handle create branch action
  const handleCreateBranch = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!projectPath) return

    setCreatingBranch(true)
    try {
      // When epic branches are disabled, create from base branch; otherwise create from current branch
      const fromBranch = enableEpicBranches ? undefined : baseBranch
      const result = await window.gitAPI.createBranch(projectPath, branchName, fromBranch)
      if (result.success) {
        setBranchExists(true)
        setCurrentBranch(branchName)
        setSnackbarMessage(`Created and switched to branch: ${branchName}`)
        setSnackbarOpen(true)
        handleMenuClose()
      } else if (result.alreadyExists) {
        // Branch already exists, try to switch to it
        const checkoutResult = await window.gitAPI.checkoutBranch(projectPath, branchName)
        if (checkoutResult.success) {
          setCurrentBranch(branchName)
          setSnackbarMessage(`Switched to existing branch: ${branchName}`)
          setSnackbarOpen(true)
          handleMenuClose()
        } else {
          setSnackbarMessage(checkoutResult.error || 'Failed to switch branch')
          setSnackbarOpen(true)
        }
      } else {
        setSnackbarMessage(result.error || 'Failed to create branch')
        setSnackbarOpen(true)
      }
    } catch {
      setSnackbarMessage('Failed to create branch')
      setSnackbarOpen(true)
    } finally {
      setCreatingBranch(false)
    }
  }

  // Generate git commit command based on command name
  const getAgentGitCommand = (command: string): string => {
    // Remove leading * or / and get just the last part after colon
    const cleanCommand = command.replace(/^[*\/]/, '')
    const actionPart = cleanCommand.includes(':') ? cleanCommand.split(':').pop()! : cleanCommand

    const cmdLower = actionPart.toLowerCase()
    let commitType = 'chore'

    // Determine commit type from command name
    if (cmdLower.includes('implement') || cmdLower.includes('feature') || cmdLower.includes('quick')) {
      commitType = 'feat'
    } else if (cmdLower.includes('review') || cmdLower.includes('fix')) {
      commitType = 'fix'
    } else if (cmdLower.includes('test') || cmdLower.includes('playtest')) {
      commitType = 'test'
    } else if (cmdLower.includes('doc') || cmdLower.includes('prd') || cmdLower.includes('draft') || cmdLower.includes('arch')) {
      commitType = 'docs'
    } else if (cmdLower.includes('ux') || cmdLower.includes('design') || cmdLower.includes('style')) {
      commitType = 'style'
    }

    return `git add . && git commit -m "${commitType}(${branchName}): ${actionPart} story ${story.epicId}.${story.storyNumber}"`
  }

  // Handle sending command to chat interface
  const handleSendToChat = (agentIdParam: string, command: string, e: React.MouseEvent) => {
    e.stopPropagation()
    // Close the menu
    handleMenuClose()
    // Cancel any running process and clear the chat thread for a fresh start
    window.chatAPI.cancelMessage(agentIdParam).catch(() => {})
    clearChatThread(agentIdParam)
    // Switch to chat view
    setViewMode('chat')
    // Select the agent
    setSelectedChatAgent(agentIdParam)
    // Set the pending message (the command with story id and context)
    const fullCommand = `${transformCommand(command, aiTool)} ${story.id}`
    setPendingChatMessage({
      agentId: agentIdParam,
      message: fullCommand,
      storyId: story.id,
      branchName: storyBranchName
    })
  }

  // Handle starting full cycle automation
  const handleStartFullCycle = (e: React.MouseEvent) => {
    e.stopPropagation()
    handleMenuClose()
    startFullCycle(story.id)
  }

  // Full Cycle section visibility (always show when conditions met)
  const showFullCycleSection = toolSupportsHeadless && effectiveStatus !== 'done' && developerMode !== 'human'
  const isFullCycleRunning = fullCycle.isRunning && fullCycle.storyId === story.id

  // Determine why the button is disabled (null = not disabled)
  const isAnyAgentBusy = Object.values(chatThreads).some(t => t?.isTyping)
  const fullCycleBusyReason = fullCycle.isRunning
    ? (isFullCycleRunning ? null : 'Another story full cycle is running')
    : epicCycle.isRunning
      ? 'Epic cycle automation is running'
      : isAnyAgentBusy
        ? 'An agent is currently busy'
        : null

  return (
    <>
      <Card
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        elevation={0}
        sx={{
          border: 1,
          borderColor: isLocked
            ? 'action.disabled'
            : runningAgent ? 'success.main' : isDragging ? 'primary.main' : 'divider',
          position: 'relative',
          cursor: isLocked ? 'default' : isDragging ? 'grabbing' : 'grab',
          userSelect: 'none', // Prevent text selection during drag
          // Hide the original card when being dragged (DragOverlay shows the copy)
          // Locked cards show reduced opacity
          opacity: isLocked ? 0.5 : isBeingDragged ? 0.3 : isDragging ? 0.9 : 1,
          boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.2)' : 'none',
          '&:hover': isLocked ? {} : {
            borderColor: runningAgent ? 'success.main' : 'primary.main',
            transform: isDragging ? 'none' : 'translateY(-2px)',
            boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.2)' : '0 4px 12px rgba(0,0,0,0.1)'
          },
          ...dragStyle,
          // Override transition for non-drag states to keep hover effects smooth
          transition: isBeingDragged ? dragStyle.transition : 'all 0.15s ease',
          touchAction: 'none' // Required for pointer events to work properly on touch devices
        }}
        onClick={handleClick}
      >
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          {/* Header: Epic Badge + Story ID + Quick Actions Menu */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Chip
              label={`Story ${story.epicId}.${story.storyNumber}`}
              size="small"
              icon={isLocked ? <LockOutlinedIcon sx={{ fontSize: '12px !important' }} /> : undefined}
              onPointerDown={preventDragOnInteractive}
              sx={{
                height: 20,
                fontSize: '0.7rem',
                fontWeight: 600,
                bgcolor: epicColor,
                color: 'white',
                '& .MuiChip-label': { px: 1 },
                '& .MuiChip-icon': { color: 'rgba(255,255,255,0.5)', ml: 0.5 }
              }}
            />
            {story.filePath && (
              <Tooltip title="Tasks and Implementation notes available" arrow placement="top">
                <DescriptionIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
              </Tooltip>
            )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1 }}>
                {/* Spinning icon: shows when teammate working OR for in-progress/review with git activity */}
                {(workingTeammate || ((effectiveStatus === 'in-progress' || effectiveStatus === 'review') && (runningAgent || isActivelyWorking))) && (
                  <Tooltip
                    title={workingTeammate ? `${workingTeammate.name} working` : runningAgent ? 'Agent working' : 'Recent git activity'}
                    arrow
                    placement="top"
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <AutorenewIcon
                        sx={{
                          fontSize: 14,
                          color: workingTeammate || runningAgent ? 'success.main' : effectiveStatus === 'review' ? 'info.main' : 'warning.main',
                          animation: 'spin 2s linear infinite',
                          '@keyframes spin': {
                            '0%': { transform: 'rotate(0deg)' },
                            '100%': { transform: 'rotate(360deg)' }
                          }
                        }}
                      />
                      {workingTeammate && (
                        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'success.main', fontWeight: 600 }}>
                          {workingTeammate.name}
                        </Typography>
                      )}
                    </Box>
                  </Tooltip>
                )}
              </Box>

            {/* Quick Actions Menu Button - Three-dot menu */}
            {nextSteps.length > 0 && (
              <IconButton
                size="small"
                onClick={handleMenuOpen}
                onPointerDown={preventDragOnInteractive}
                sx={{
                  p: 0.25,
                  color: 'text.disabled',
                  '&:hover': {
                    color: 'text.primary',
                    bgcolor: 'action.hover'
                  }
                }}
              >
                <AutoAwesomeIcon sx={{ fontSize: 16 }} />
              </IconButton>
            )}
          </Box>

          {/* Story Title */}
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: 'text.primary',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {story.title}
          </Typography>

          {/* User story description */}
          {story.epicDescription && (
            <Box
              sx={{
                mt: 1,
                color: 'text.secondary',
                fontStyle: 'italic',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                lineHeight: 1.3,
                fontSize: '0.75rem',
                '& p': { m: 0 },
                '& ul, & ol': { m: 0, pl: 2 },
                '& code': { fontSize: '0.7rem' }
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{story.epicDescription}</ReactMarkdown>
            </Box>
          )}

          {/* Human Review Progress Badge - only shows for human-review status */}
          {effectiveStatus === 'human-review' && totalItems > 0 && (
            <Tooltip
              title={allApproved ? 'All items approved' : `${checkedCount}/${totalItems} reviewed`}
              arrow
              placement="top"
            >
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  bgcolor: allApproved ? 'success.main' : 'warning.main',
                  color: 'white',
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  fontSize: '0.7rem'
                }}
              >
                {allApproved ? (
                  <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />
                ) : (
                  <>
                    <ChecklistIcon sx={{ fontSize: 14 }} />
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'inherit', lineHeight: 1 }}>
                      {checkedCount}/{totalItems}
                    </Typography>
                  </>
                )}
              </Box>
            </Tooltip>
          )}

          {/* Skipped Human Review Warning - shows on done cards that never went through human review */}
          {enableHumanReviewColumn && story.status === 'done' && !allApproved && (
            <Tooltip
              title="This story was marked done without completing human review checklist"
              arrow
              placement="top"
            >
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  bgcolor: 'warning.main',
                  color: 'white',
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  fontSize: '0.7rem'
                }}
              >
                <WarningAmberIcon sx={{ fontSize: 14 }} />
              </Box>
            </Tooltip>
          )}

        </CardContent>
      </Card>

      {/* Quick Actions Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: { minWidth: 320, maxWidth: 400 }
          }
        }}
      >
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={600}>
            Actions
          </Typography>
        </Box>

        {/* Full Cycle Automation Button - Only for backlog/ready-for-dev with headless support */}
        {showFullCycleSection && (
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'primary.lighter', opacity: fullCycleBusyReason ? 0.6 : 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <RocketLaunchIcon sx={{ fontSize: 18, color: 'primary.main' }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={600} color="primary.main">
                  Full Cycle Automation
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {fullCycleBusyReason
                    ? fullCycleBusyReason
                    : effectiveStatus === 'backlog' || effectiveStatus === 'ready-for-dev'
                      ? 'Create branch, implement, review, and complete'
                      : 'Continue with review and complete remaining steps'}
                </Typography>
              </Box>
              <Tooltip title={fullCycleBusyReason || ''}>
                <span>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleStartFullCycle}
                    disabled={fullCycle.isRunning || !!fullCycleBusyReason}
                    startIcon={isFullCycleRunning ? <CircularProgress size={12} color="inherit" /> : <RocketLaunchIcon />}
                    sx={{ fontSize: '0.7rem', py: 0.5, px: 1.5 }}
                  >
                    {isFullCycleRunning ? 'Running...' : 'Run'}
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Box>
        )}

        {/* Step 1: Git Branch Command - Only for ready-for-dev when branch doesn't exist yet (hidden when git branching disabled) */}
        {!disableGitBranching && effectiveStatus === 'ready-for-dev' && !branchExists && !isOnStoryBranch && (
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Chip label="Step 1" size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600, bgcolor: 'primary.main', color: 'white' }} />
              <GitHubIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>
                Create Branch
              </Typography>
              <Tooltip title={!canCreateBranchFromHere ? `Switch to ${enableEpicBranches ? `epic-${story.epicId}` : baseBranch} branch first` : ''}>
                <span>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleCreateBranch}
                    disabled={creatingBranch || !canCreateBranchFromHere}
                    startIcon={creatingBranch ? <CircularProgress size={12} color="inherit" /> : undefined}
                    sx={{ fontSize: '0.7rem', py: 0.25, px: 1, minWidth: 0 }}
                  >
                    {creatingBranch ? 'Creating...' : 'Create'}
                  </Button>
                </span>
              </Tooltip>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.7rem',
                  color: 'text.primary',
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  px: 1,
                  py: 0.5,
                  borderRadius: 0.5,
                  flex: 1,
                  wordBreak: 'break-all'
                }}
              >
                {gitBranchCommand}
              </Typography>
              <Tooltip title="Copy command">
                <IconButton
                  size="small"
                  onClick={(e) => handleCopySingle(gitBranchCommand, e)}
                  sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                >
                  <ContentCopyIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
            {!canCreateBranchFromHere && (
              <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block' }}>
                Switch to {enableEpicBranches ? `epic-${story.epicId}` : baseBranch} branch first
              </Typography>
            )}
          </Box>
        )}

        {/* Step 1: Git Commit Command - For review (commit implementation) and done (complete) - only when on story branch with uncommitted changes (hidden when git branching disabled) */}
        {!disableGitBranching && (effectiveStatus === 'review' || effectiveStatus === 'done') && canExecuteStoryActions && hasUncommittedChanges && (
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Chip label="Step 1" size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600, bgcolor: 'primary.main', color: 'white' }} />
              <GitHubIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>
                {effectiveStatus === 'review' ? 'Commit Implementation' : 'Commit & Complete'}
              </Typography>
              <Button
                size="small"
                variant="contained"
                onClick={handleCommit}
                disabled={committing}
                startIcon={committing ? <CircularProgress size={12} color="inherit" /> : undefined}
                sx={{ fontSize: '0.7rem', py: 0.25, px: 1, minWidth: 0 }}
              >
                {committing ? 'Committing...' : 'Commit'}
              </Button>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.7rem',
                  color: 'text.primary',
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  px: 1,
                  py: 0.5,
                  borderRadius: 0.5,
                  flex: 1,
                  wordBreak: 'break-all'
                }}
              >
                {gitCommitCommand}
              </Typography>
              <Tooltip title="Copy command">
                <IconButton
                  size="small"
                  onClick={(e) => handleCopySingle(gitCommitCommand, e)}
                  sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                >
                  <ContentCopyIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        )}

        {/* Talk to Agents - show Step 2 only when there's a git step first */}
        {nextSteps.length > 0 && (
          <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.selected' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {!disableGitBranching && ((effectiveStatus === 'ready-for-dev' && !branchExists && !isOnStoryBranch) || ((effectiveStatus === 'review' || effectiveStatus === 'done') && canExecuteStoryActions && hasUncommittedChanges)) && (
                <Chip
                  label="Step 2"
                  size="small"
                  sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600, bgcolor: 'secondary.main', color: 'white' }}
                />
              )}
              <GroupsIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Typography variant="body2" fontWeight={500}>
                {`Talk to Agents (${selectedToolInfo?.name || aiTool})`}
              </Typography>
            </Box>
          </Box>
        )}

        {nextSteps.map((step, index) => {
          const agent = getAgent(step.agentId)
          return (
            <Box
              key={index}
              sx={{ px: 2, py: 1.5, borderBottom: index < nextSteps.length - 1 ? 1 : 0, borderColor: 'divider' }}
            >
              {/* Agent Step Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <PersonIcon sx={{ fontSize: 18, color: agent?.color || 'text.secondary' }} />
                <Typography variant="body2" fontWeight={500}>
                  {step.label}
                </Typography>
                {step.command && toolSupportsHeadless && (() => {
                  const agentThread = chatThreads[step.agentId]
                  const isAgentWorking = agentThread?.isTyping || false
                  // Backlog/ready-for-dev stories can be worked on from epic branch (or base branch when epic branches disabled)
                  // When bmad is gitignored, allow from any branch
                  const canExecuteFromParentBranch = (effectiveStatus === 'backlog' || effectiveStatus === 'ready-for-dev') && (enableEpicBranches ? isOnEpicBranch : isOnBaseBranch)
                  const canExecute = canExecuteStoryActions || canExecuteFromParentBranch || disableGitBranching
                  const isDisabled = !canExecute || isAgentWorking
                  const requiredBranch = enableEpicBranches ? `epic-${story.epicId}` : baseBranch
                  const tooltipTitle = isAgentWorking
                    ? agentThread?.thinkingActivity || 'Working...'
                    : canExecute
                      ? 'Send to chat'
                      : `Switch to branch ${requiredBranch} first`
                  return (
                    <Tooltip title={tooltipTitle}>
                      <span>
                        <IconButton
                          size="small"
                          disabled={isDisabled}
                          onClick={(e) => handleSendToChat(step.agentId, step.command, e)}
                          sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'success.main' } }}
                        >
                          <ChatBubbleOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )
                })()}
                <Box sx={{ flex: 1 }} />
                {step.primary && (
                  <Chip label="Primary" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                )}
                {step.command && canExecuteStoryActions && hasUncommittedChanges && (
                  <Tooltip title={`Copy git commit for ${transformCommand(step.command, aiTool)}`}>
                    <IconButton
                      size="small"
                      onClick={(e) => handleCopySingle(getAgentGitCommand(step.command), e)}
                      sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
                    >
                      <GitHubIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1, ml: 3.25 }}>
                {agent?.role} ({agent?.name})
              </Typography>

              {/* Agent invocation command */}
              {agent?.commands?.[0] && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, ml: 3.25 }}>
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', minWidth: 16 }}>
                    1.
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                      color: agent?.color || 'text.secondary',
                      bgcolor: 'action.hover',
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 0.5,
                      flex: 1,
                      wordBreak: 'break-all'
                    }}
                  >
                    {transformCommand(agent.commands[0], aiTool)}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => handleCopySingle(transformCommand(agent.commands[0], aiTool), e)}
                    sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              )}

              {/* Workflow command */}
              {step.command && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 3.25 }}>
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', minWidth: 16 }}>
                    2.
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                      color: 'primary.main',
                      bgcolor: 'action.hover',
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 0.5,
                      flex: 1,
                      wordBreak: 'break-all'
                    }}
                  >
                    {transformCommand(step.command, aiTool)} {story.id}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => handleCopySingle(`${transformCommand(step.command, aiTool)} ${story.id}`, e)}
                    sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              )}
            </Box>
          )
        })}
      </Menu>

      {/* Copy Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

    </>
  )
}
