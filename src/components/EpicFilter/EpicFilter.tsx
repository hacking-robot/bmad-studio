import { useState, useEffect } from 'react'
import {
  Button,
  Menu,
  MenuItem,
  Box,
  Typography,
  LinearProgress,
  Divider,
  IconButton,
  Tooltip,
  Popover,
  CircularProgress,
  Alert,
  FormControlLabel,
  Checkbox
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import GitHubIcon from '@mui/icons-material/GitHub'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useStore } from '../../store'
import { useProjectData } from '../../hooks/useProjectData'
import { EPIC_COLORS } from '../../types'

export default function EpicFilter() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [gitAnchor, setGitAnchor] = useState<null | HTMLElement>(null)
  const [infoAnchor, setInfoAnchor] = useState<null | HTMLElement>(null)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [checkingBranch, setCheckingBranch] = useState(false)
  const [branchError, setBranchError] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState(false)
  const [createMode, setCreateMode] = useState(false)
  const [hasUncommittedChanges, setHasUncommittedChanges] = useState(false)
  const open = Boolean(anchorEl)

  const epics = useStore((state) => state.epics)
  const selectedEpicId = useStore((state) => state.selectedEpicId)
  const setSelectedEpicId = useStore((state) => state.setSelectedEpicId)
  const projectPath = useStore((state) => state.projectPath)
  const enableEpicBranches = useStore((state) => state.enableEpicBranches)
  const { loadProjectData } = useProjectData()

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleSelect = (epicId: number | null) => {
    setSelectedEpicId(epicId)
    handleClose()
  }

  const selectedEpic = epics.find((e) => e.id === selectedEpicId)

  // Calculate progress for each epic
  const getEpicProgress = (epicId: number) => {
    const epic = epics.find((e) => e.id === epicId)
    if (!epic || epic.stories.length === 0) return 0
    const doneCount = epic.stories.filter((s) => s.status === 'done').length
    return (doneCount / epic.stories.length) * 100
  }

  // Generate branch name from epic
  const getEpicBranchName = (epic: typeof epics[0]) => {
    const slug = epic.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50)
    return `epic-${epic.id}-${slug}`
  }

  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command)
    setCopiedCommand(command)
    setTimeout(() => setCopiedCommand(null), 2000)
  }

  const handleGitClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setGitAnchor(event.currentTarget)
  }

  const handleGitClose = () => {
    setGitAnchor(null)
    setBranchError(null)
    setActionInProgress(false)
    setCreateMode(false)
    setHasUncommittedChanges(false)
  }

  const handleInfoClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setInfoAnchor(event.currentTarget)
  }

  const handleInfoClose = () => {
    setInfoAnchor(null)
  }

  // Calculate story counts by status for selected epic
  const getStoryCountsByStatus = (epicId: number) => {
    const epic = epics.find((e) => e.id === epicId)
    if (!epic) return {}
    const counts: Record<string, number> = {}
    epic.stories.forEach((s) => {
      counts[s.status] = (counts[s.status] || 0) + 1
    })
    return counts
  }

  // Check if branch exists and for uncommitted changes when popover opens
  useEffect(() => {
    if (!gitAnchor || !selectedEpic || !projectPath) return

    const checkBranch = async () => {
      setCheckingBranch(true)
      setBranchError(null)
      try {
        // Check for uncommitted changes first
        const changesResult = await window.gitAPI.hasChanges(projectPath)
        setHasUncommittedChanges(changesResult.hasChanges)

        if (changesResult.hasChanges) {
          setBranchError('Commit changes before switching branches')
        }

        const branchName = getEpicBranchName(selectedEpic)
        const result = await window.gitAPI.branchExists(projectPath, branchName)
        // Default to create mode if branch doesn't exist
        setCreateMode(!result.exists)
      } catch {
        setBranchError('Failed to check branch status')
      } finally {
        setCheckingBranch(false)
      }
    }

    checkBranch()
  }, [gitAnchor, selectedEpic, projectPath])

  const handleSwitchBranch = async () => {
    if (!selectedEpic || !projectPath) return

    setActionInProgress(true)
    setBranchError(null)

    try {
      const branchName = getEpicBranchName(selectedEpic)
      const result = await window.gitAPI.checkoutBranch(projectPath, branchName)

      if (result.success) {
        handleGitClose()
        // Refresh project data after branch switch
        loadProjectData()
      } else {
        setBranchError(result.error || 'Failed to switch branch')
      }
    } catch {
      setBranchError('Failed to switch branch')
    } finally {
      setActionInProgress(false)
    }
  }

  const handleCreateBranch = async () => {
    if (!selectedEpic || !projectPath) return

    setActionInProgress(true)
    setBranchError(null)

    try {
      const branchName = getEpicBranchName(selectedEpic)
      const result = await window.gitAPI.createBranch(projectPath, branchName)

      if (result.success) {
        handleGitClose()
        // Refresh project data after branch creation
        loadProjectData()
      } else if (result.alreadyExists) {
        // Branch was created between our check and now, uncheck create mode
        setCreateMode(false)
        setBranchError('Branch already exists. Uncheck "Create" to switch instead.')
      } else {
        setBranchError(result.error || 'Failed to create branch')
      }
    } catch {
      setBranchError('Failed to create branch')
    } finally {
      setActionInProgress(false)
    }
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Button
          onClick={handleClick}
          endIcon={<KeyboardArrowDownIcon />}
          sx={{
            textTransform: 'none',
            color: 'text.primary',
            bgcolor: 'action.hover',
            px: 2,
            '&:hover': {
              bgcolor: 'action.selected'
            }
          }}
        >
          {selectedEpic ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: EPIC_COLORS[(selectedEpic.id - 1) % EPIC_COLORS.length]
                }}
              />
              <Typography variant="body2">Epic {selectedEpic.id}</Typography>
            </Box>
          ) : (
            <Typography variant="body2">All Epics</Typography>
          )}
        </Button>

        {selectedEpic && (
          <Tooltip title="Epic info">
            <IconButton
              onClick={handleInfoClick}
              size="small"
              sx={{ color: 'text.secondary' }}
            >
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {selectedEpic && enableEpicBranches && (
          <Tooltip title="Git branch commands">
            <IconButton
              onClick={handleGitClick}
              size="small"
              sx={{ color: 'text.secondary' }}
            >
              <GitHubIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Git Commands Popover */}
      {selectedEpic && (
        <Popover
          open={Boolean(gitAnchor)}
          anchorEl={gitAnchor}
          onClose={handleGitClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'center'
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'center'
          }}
          slotProps={{
            paper: {
              sx: {
                p: 2,
                maxWidth: 400,
                borderRadius: 1.5
              }
            }
          }}
        >
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Git Branch for Epic {selectedEpic.id}
          </Typography>

          {/* Command display */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'action.hover',
              p: 1,
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              mb: 1.5
            }}
          >
            <Typography
              component="code"
              sx={{ flex: 1, fontFamily: 'inherit', fontSize: 'inherit', wordBreak: 'break-all' }}
            >
              git checkout {createMode ? '-b ' : ''}{getEpicBranchName(selectedEpic)}
            </Typography>
            <Tooltip title="Copy command">
              <IconButton
                size="small"
                onClick={() => handleCopyCommand(`git checkout ${createMode ? '-b ' : ''}${getEpicBranchName(selectedEpic)}`)}
                sx={{ flexShrink: 0 }}
              >
                {copiedCommand?.includes(getEpicBranchName(selectedEpic)) ? (
                  <CheckIcon fontSize="small" color="success" />
                ) : (
                  <ContentCopyIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </Box>

          {/* Error message */}
          {branchError && (
            <Alert severity="error" sx={{ mb: 1.5, py: 0.5 }}>
              {branchError}
            </Alert>
          )}

          {/* Create checkbox and action button */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {checkingBranch ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Checking branch...
                </Typography>
              </Box>
            ) : (
              <>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={createMode}
                      onChange={(e) => setCreateMode(e.target.checked)}
                      disabled={hasUncommittedChanges}
                    />
                  }
                  label={<Typography variant="body2">Create (-b)</Typography>}
                  sx={{ mr: 1 }}
                />
                <Button
                  variant="contained"
                  size="small"
                  onClick={createMode ? handleCreateBranch : handleSwitchBranch}
                  disabled={actionInProgress || hasUncommittedChanges}
                  startIcon={actionInProgress ? <CircularProgress size={14} /> : undefined}
                >
                  {createMode ? 'Create & Switch' : 'Switch'}
                </Button>
              </>
            )}
          </Box>
        </Popover>
      )}

      {/* Epic Info Popover */}
      {selectedEpic && (
        <Popover
          open={Boolean(infoAnchor)}
          anchorEl={infoAnchor}
          onClose={handleInfoClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'center'
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'center'
          }}
          slotProps={{
            paper: {
              sx: {
                p: 2,
                maxWidth: 400,
                maxHeight: 500,
                overflow: 'auto',
                borderRadius: 1.5
              }
            }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: EPIC_COLORS[(selectedEpic.id - 1) % EPIC_COLORS.length],
                flexShrink: 0
              }}
            />
            <Typography variant="subtitle1" fontWeight={600}>
              Epic {selectedEpic.id}: {selectedEpic.name}
            </Typography>
          </Box>

          {selectedEpic.goal && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Goal
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: 'text.primary' }}>
                {selectedEpic.goal}
              </Typography>
            </Box>
          )}

          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
              Story Status
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {(() => {
                const counts = getStoryCountsByStatus(selectedEpic.id)
                const statusOrder = ['backlog', 'ready-for-dev', 'in-progress', 'review', 'done']
                return statusOrder.map((status) => {
                  const count = counts[status] || 0
                  if (count === 0) return null
                  const statusColors: Record<string, string> = {
                    'backlog': '#9e9e9e',
                    'ready-for-dev': '#2196f3',
                    'in-progress': '#ff9800',
                    'review': '#9c27b0',
                    'done': '#4caf50'
                  }
                  return (
                    <Box
                      key={status}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        bgcolor: 'action.hover',
                        fontSize: '0.75rem'
                      }}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: statusColors[status] || 'text.disabled'
                        }}
                      />
                      <Typography variant="caption">
                        {status.replace(/-/g, ' ')}: {count}
                      </Typography>
                    </Box>
                  )
                })
              })()}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Total: {selectedEpic.stories.length} stories
            </Typography>
          </Box>

        </Popover>
      )}

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            minWidth: 280,
            maxHeight: 400
          }
        }}
      >
        <MenuItem
          onClick={() => handleSelect(null)}
          selected={selectedEpicId === null}
        >
          <Typography>All Epics</Typography>
        </MenuItem>

        <Divider />

        {epics.map((epic) => {
          const progress = getEpicProgress(epic.id)
          const color = EPIC_COLORS[(epic.id - 1) % EPIC_COLORS.length]

          return (
            <MenuItem
              key={epic.id}
              onClick={() => handleSelect(epic.id)}
              selected={selectedEpicId === epic.id}
              sx={{ flexDirection: 'column', alignItems: 'stretch', py: 1.5 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: color,
                    flexShrink: 0
                  }}
                />
                <Typography variant="body2" sx={{ flex: 1 }}>
                  Epic {epic.id}: {epic.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {epic.stories.filter((s) => s.status === 'done').length}/{epic.stories.length}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 4,
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: color,
                    borderRadius: 2
                  }
                }}
              />
            </MenuItem>
          )
        })}
      </Menu>

    </>
  )
}
