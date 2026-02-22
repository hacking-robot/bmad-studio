import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Tooltip,
  IconButton,
  Popover,
  Alert,
  Button,
  Chip,
  CircularProgress
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import CallSplitIcon from '@mui/icons-material/CallSplit'
import CommitIcon from '@mui/icons-material/Commit'
import { useStore } from '../../store'

export default function UncommittedChanges() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  const projectPath = useStore((state) => state.projectPath)
  const stories = useStore((state) => state.stories)
  const currentBranch = useStore((state) => state.currentBranch)
  const hasChanges = useStore((state) => state.hasUncommittedChanges)
  const setCurrentBranch = useStore((state) => state.setCurrentBranch)
  const setHasUncommittedChanges = useStore((state) => state.setHasUncommittedChanges)
  const openGitDiffPanel = useStore((state) => state.openGitDiffPanel)

  // Parse branch name to find matching story
  // Branch format: epicId-storyId (e.g., "1-1-6-load-built-in-chips")
  const getStoryFromBranch = useCallback((branchName: string) => {
    // Try to match branch name pattern: epicId-storyId-...
    // The storyId format is like "1-6" which becomes "1-6-..." in branch
    for (const story of stories) {
      const storyBranchPrefix = story.id
      if (branchName === storyBranchPrefix || branchName.startsWith(`${storyBranchPrefix}-`)) {
        return story
      }
    }
    return null
  }, [stories])

  // Check for uncommitted changes
  const checkChanges = useCallback(async () => {
    if (!projectPath) {
      setHasUncommittedChanges(false)
      setCurrentBranch(null)
      return
    }

    try {
      const [changesResult, branchResult] = await Promise.all([
        window.gitAPI.hasChanges(projectPath),
        window.gitAPI.getCurrentBranch(projectPath)
      ])

      setHasUncommittedChanges(changesResult.hasChanges)
      setCurrentBranch(branchResult.branch || null)
    } catch {
      setHasUncommittedChanges(false)
      setCurrentBranch(null)
    }
  }, [projectPath, setCurrentBranch, setHasUncommittedChanges])

  // Poll for changes
  useEffect(() => {
    checkChanges()

    // Re-check every 5 seconds
    const interval = setInterval(checkChanges, 5000)

    return () => clearInterval(interval)
  }, [checkChanges])

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
    setCommitError(null)
  }

  const handleCopy = (command: string) => {
    navigator.clipboard.writeText(command)
    setCopiedCommand(command)
    setTimeout(() => setCopiedCommand(null), 2000)
  }

  // Don't render if no project or no changes
  if (!projectPath || !hasChanges || !currentBranch) {
    return null
  }

  const matchingStory = getStoryFromBranch(currentBranch)
  const branchName = currentBranch

  // Generate commit message based on story context
  const getCommitMessage = () => {
    if (matchingStory) {
      return `feat(${branchName}): update story ${matchingStory.epicId}.${matchingStory.storyNumber}`
    }
    return `chore(${branchName}): update`
  }

  const commitMessage = getCommitMessage()
  const commitCommand = `git add . && git commit -m "${commitMessage}"`

  const handleCommit = async () => {
    if (!projectPath) return

    setCommitting(true)
    setCommitError(null)

    try {
      const result = await window.gitAPI.commit(projectPath, commitMessage)
      if (result.success) {
        // Update store to notify all components
        setHasUncommittedChanges(false)
        handleClose()
      } else {
        setCommitError(result.error || 'Failed to commit')
      }
    } catch {
      setCommitError('Failed to commit changes')
    } finally {
      setCommitting(false)
    }
  }

  return (
    <>
      <Tooltip title="Uncommitted changes - click to view diff or commit">

        <Chip
          size="small"
          icon={<CommitIcon sx={{ fontSize: 14 }} />}
          label="Commit Changes"
          onClick={handleClick}
          color="warning"
          variant="outlined"
          sx={{
            height: 20,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.65rem',
            '& .MuiChip-icon': { ml: 0.5, mr: -0.25 },
            '& .MuiChip-label': { px: 0.5 }
          }}
        />
      </Tooltip>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'center'
        }}
        transformOrigin={{
          vertical: 'bottom',
          horizontal: 'center'
        }}
        slotProps={{
          paper: {
            sx: {
              p: 2,
              maxWidth: 450,
              borderRadius: 1.5
            }
          }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
          <CommitIcon sx={{ fontSize: 18 }} />
          <Typography variant="subtitle2" fontWeight={600}>
            Commit Changes
          </Typography>
        </Box>

        {matchingStory ? (
          <Alert severity="info" sx={{ mb: 1.5, py: 0.5 }}>
            Story {matchingStory.epicId}.{matchingStory.storyNumber}: {matchingStory.title.slice(0, 40)}...
          </Alert>
        ) : (
          <Alert severity="warning" sx={{ mb: 1.5, py: 0.5 }}>
            No matching story found for branch
          </Alert>
        )}

        {commitError && (
          <Alert severity="error" sx={{ mb: 1.5, py: 0.5 }}>
            {commitError}
          </Alert>
        )}

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'action.hover',
            p: 1,
            borderRadius: 1,
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            mb: 1.5
          }}
        >
          <Typography
            component="code"
            sx={{ flex: 1, fontFamily: 'inherit', fontSize: 'inherit', wordBreak: 'break-all' }}
          >
            {commitCommand}
          </Typography>
          <Tooltip title="Copy command">
            <IconButton
              size="small"
              onClick={() => handleCopy(commitCommand)}
              sx={{ flexShrink: 0 }}
            >
              {copiedCommand === commitCommand ? (
                <CheckIcon fontSize="small" color="success" />
              ) : (
                <ContentCopyIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              openGitDiffPanel(branchName)
              handleClose()
            }}
            startIcon={<CallSplitIcon />}
            sx={{ flex: 1 }}
          >
            View Diff
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleCommit}
            disabled={committing}
            startIcon={committing ? <CircularProgress size={14} /> : <CommitIcon />}
            sx={{ flex: 1 }}
          >
            {committing ? 'Committing...' : 'Commit'}
          </Button>
        </Box>
      </Popover>
    </>
  )
}
