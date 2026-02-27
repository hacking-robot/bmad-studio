import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Box, Typography, Tooltip, CircularProgress, IconButton, Chip } from '@mui/material'
import ForkRightIcon from '@mui/icons-material/ForkRight'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import MergeIcon from '@mui/icons-material/Merge'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight'
import SearchableDropdown, { SearchableDropdownItem } from '../common/SearchableDropdown'
import { useStore } from '../../store'
import { useProjectData } from '../../hooks/useProjectData'

// Parse epic ID from branch name (e.g., "epic-1-core-features" -> "1")
function parseEpicFromBranch(branch: string): string | null {
  const match = branch.match(/^epic-(\d+)-/)
  return match ? match[1] : null
}

interface BranchMergeStatus {
  [branch: string]: {
    merged: boolean
    loading: boolean
  }
}

export default function BranchSwitcher() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mergeStatus, setMergeStatus] = useState<BranchMergeStatus>({})
  const [epicMergeStatus, setEpicMergeStatus] = useState<BranchMergeStatus>({})
  const [mergingBranch, setMergingBranch] = useState<string | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const projectPath = useStore((state) => state.projectPath)
  const currentBranch = useStore((state) => state.currentBranch)
  const setCurrentBranch = useStore((state) => state.setCurrentBranch)
  const setUnmergedStoryBranches = useStore((state) => state.setUnmergedStoryBranches)
  const epics = useStore((state) => state.epics)
  const stories = useStore((state) => state.stories)
  const baseBranch = useStore((state) => state.baseBranch)
  const allowDirectEpicMerge = useStore((state) => state.allowDirectEpicMerge)
  const enableEpicBranches = useStore((state) => state.enableEpicBranches)
  const disableGitBranching = useStore((state) => state.disableGitBranching)
  const { loadProjectData } = useProjectData()

  // Whether current branch is the base branch
  const isOnBaseBranch = currentBranch === baseBranch

  const open = Boolean(anchorEl)

  // Detect if current branch is an epic branch
  const currentEpicId = useMemo(() => {
    return currentBranch ? parseEpicFromBranch(currentBranch) : null
  }, [currentBranch])


  // Load branches when dropdown opens
  const loadBranches = useCallback(async () => {
    if (!projectPath) return

    setLoading(true)
    try {
      const result = await window.gitAPI.listBranches(projectPath)
      if (result.error) {
        setError(result.error)
        setBranches([])
      } else {
        setBranches(result.branches)
        setError(null)
      }
    } catch {
      setError('Failed to load branches')
      setBranches([])
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  // Load merge status for story branches when on an epic branch
  const loadMergeStatus = useCallback(async (branchList: string[], epicId: string, updateStore = false) => {
    if (!projectPath || !currentBranch) {
      if (updateStore) setUnmergedStoryBranches([])
      return
    }

    // Only consider branches that match actual stories (not just any branch starting with epicId-)
    const storyPrefixes = stories
      .filter(s => String(s.epicId) === epicId)
      .map(s => s.id)

    const storyBranches = branchList.filter(branch =>
      storyPrefixes.some(prefix => branch === prefix || branch.startsWith(`${prefix}-`))
    )

    // Initialize loading state for all story branches
    setMergeStatus(prev => {
      const newStatus = { ...prev }
      for (const branch of storyBranches) {
        if (!newStatus[branch]) {
          newStatus[branch] = { merged: false, loading: true }
        }
      }
      return newStatus
    })

    // Check merge status for each story branch and track unmerged ones
    const unmerged: string[] = []
    for (const branch of storyBranches) {
      try {
        const result = await window.gitAPI.isBranchMerged(projectPath, branch, currentBranch)
        setMergeStatus(prev => ({
          ...prev,
          [branch]: { merged: result.merged, loading: false }
        }))
        if (!result.merged) {
          unmerged.push(branch)
        }
      } catch {
        setMergeStatus(prev => ({
          ...prev,
          [branch]: { merged: false, loading: false }
        }))
        unmerged.push(branch) // Assume unmerged on error
      }
    }

    // Update store with unmerged branches (for read-only mode)
    if (updateStore) {
      setUnmergedStoryBranches(unmerged)
    }
  }, [projectPath, currentBranch, setUnmergedStoryBranches, stories])

  // Load merge status for epic branches when on base branch
  const loadEpicMergeStatus = useCallback(async (branchList: string[]) => {
    if (!projectPath || !isOnBaseBranch) return

    // Find epic branches from the list
    const epicBranches = branchList.filter(branch => /^epic-\d+-/.test(branch))

    if (epicBranches.length === 0) return

    // Initialize loading state for all epic branches
    setEpicMergeStatus(prev => {
      const newStatus = { ...prev }
      for (const branch of epicBranches) {
        if (!newStatus[branch]) {
          newStatus[branch] = { merged: false, loading: true }
        }
      }
      return newStatus
    })

    // Check merge status for each epic branch against base
    for (const branch of epicBranches) {
      try {
        const result = await window.gitAPI.isBranchMerged(projectPath, branch, baseBranch)
        setEpicMergeStatus(prev => ({
          ...prev,
          [branch]: { merged: result.merged, loading: false }
        }))
      } catch {
        setEpicMergeStatus(prev => ({
          ...prev,
          [branch]: { merged: false, loading: false }
        }))
      }
    }
  }, [projectPath, isOnBaseBranch, baseBranch])

  // Load merge status for all story branches when on base branch with epic branches disabled
  const loadStoryMergeStatusForBase = useCallback(async (branchList: string[]) => {
    if (!projectPath || !isOnBaseBranch || enableEpicBranches) return

    // Find all story branches (matching pattern N-N or N-N-*)
    const storyBranches = branchList.filter(branch => /^\d+-\d+/.test(branch))

    if (storyBranches.length === 0) return

    // Initialize loading state for all story branches
    setMergeStatus(prev => {
      const newStatus = { ...prev }
      for (const branch of storyBranches) {
        if (!newStatus[branch]) {
          newStatus[branch] = { merged: false, loading: true }
        }
      }
      return newStatus
    })

    // Check merge status for each story branch against base
    for (const branch of storyBranches) {
      try {
        const result = await window.gitAPI.isBranchMerged(projectPath, branch, baseBranch)
        setMergeStatus(prev => ({
          ...prev,
          [branch]: { merged: result.merged, loading: false }
        }))
      } catch {
        setMergeStatus(prev => ({
          ...prev,
          [branch]: { merged: false, loading: false }
        }))
      }
    }
  }, [projectPath, isOnBaseBranch, enableEpicBranches, baseBranch])

  // Load branches when dropdown opens
  useEffect(() => {
    if (open) {
      loadBranches()
    }
  }, [open, loadBranches])

  // Load merge status when we have branches and are on an epic (for dropdown display)
  useEffect(() => {
    if (open && branches.length > 0 && currentEpicId) {
      loadMergeStatus(branches, currentEpicId, false)
    }
  }, [open, branches, currentEpicId, loadMergeStatus])

  // Load epic merge status when on base branch (for dropdown display)
  useEffect(() => {
    if (open && branches.length > 0 && isOnBaseBranch) {
      loadEpicMergeStatus(branches)
    }
  }, [open, branches, isOnBaseBranch, loadEpicMergeStatus])

  // Load story merge status when on base branch with epic branches disabled (for dropdown display)
  useEffect(() => {
    if (open && branches.length > 0 && isOnBaseBranch && !enableEpicBranches) {
      loadStoryMergeStatusForBase(branches)
    }
  }, [open, branches, isOnBaseBranch, enableEpicBranches, loadStoryMergeStatusForBase])

  // Check merge status when switching to an epic branch (for read-only mode)
  useEffect(() => {
    const checkEpicMergeStatus = async () => {
      if (!projectPath || !currentEpicId || !currentBranch) {
        setUnmergedStoryBranches([])
        return
      }

      // Fetch all branches to check merge status
      const result = await window.gitAPI.listBranches(projectPath)

      if (result.error || result.branches.length === 0) {
        // No branches or error - mark as checked with no unmerged
        setUnmergedStoryBranches([])
        return
      }

      loadMergeStatus(result.branches, currentEpicId, true)
    }

    checkEpicMergeStatus()
  }, [projectPath, currentBranch, currentEpicId, loadMergeStatus, setUnmergedStoryBranches])

  // Filter branches to only show relevant ones (epics, stories, base branch)
  const filteredBranches = useMemo(() => {
    // Build set of valid branch prefixes
    const epicPrefixes = epics.map(e => `epic-${e.id}-`)
    const storyPrefixes = stories.map(s => s.id)

    return branches.filter(branch => {
      // Always show base branch
      if (branch === baseBranch) return true

      // Show epic branches only if enabled
      if (epicPrefixes.some(prefix => branch.startsWith(prefix))) {
        return enableEpicBranches
      }

      // Show story branches
      if (storyPrefixes.some(prefix => branch === prefix || branch.startsWith(`${prefix}-`))) return true

      return false
    })
  }, [branches, epics, stories, baseBranch, enableEpicBranches])

  // Group branches into tree structure: main, then epics with their stories nested
  const groupedBranches = useMemo(() => {
    type BranchItem = {
      id: string
      label: string
      isEpicBranch: boolean
      isStoryBranch: boolean
      epicId: string | null
      mergeStatus: { merged: boolean; loading: boolean } | null
      mergeTarget: 'epic' | 'base' | null
    }

    const result: BranchItem[] = []

    // Separate branches by type
    const mainBranches: string[] = []
    const epicBranchMap: Map<string, { epicBranch: string; storyBranches: string[] }> = new Map()

    for (const branch of filteredBranches) {
      if (branch === baseBranch) {
        mainBranches.push(branch)
        continue
      }

      // Check if it's an epic branch
      const epicMatch = branch.match(/^epic-(\d+)-/)
      if (epicMatch) {
        const epicId = epicMatch[1]
        if (!epicBranchMap.has(epicId)) {
          epicBranchMap.set(epicId, { epicBranch: branch, storyBranches: [] })
        } else {
          epicBranchMap.get(epicId)!.epicBranch = branch
        }
        continue
      }

      // Check if it's a story branch
      const storyMatch = branch.match(/^(\d+)-\d+/)
      if (storyMatch) {
        const epicId = storyMatch[1]
        if (!epicBranchMap.has(epicId)) {
          epicBranchMap.set(epicId, { epicBranch: '', storyBranches: [branch] })
        } else {
          epicBranchMap.get(epicId)!.storyBranches.push(branch)
        }
      }
    }

    // Add main branches first
    for (const branch of mainBranches) {
      result.push({
        id: branch,
        label: branch,
        isEpicBranch: false,
        isStoryBranch: false,
        epicId: null,
        mergeStatus: null,
        mergeTarget: null
      })
    }

    // Sort epic IDs numerically
    const sortedEpicIds = Array.from(epicBranchMap.keys()).sort((a, b) => parseInt(a) - parseInt(b))

    // Add epics with their story branches
    for (const epicId of sortedEpicIds) {
      const { epicBranch, storyBranches } = epicBranchMap.get(epicId)!

      // Add epic branch if it exists
      if (epicBranch) {
        // Show merge status for epic branches when on base branch
        const showEpicMergeStatus = isOnBaseBranch
        result.push({
          id: epicBranch,
          label: epicBranch,
          isEpicBranch: true,
          isStoryBranch: false,
          epicId,
          mergeStatus: showEpicMergeStatus ? (epicMergeStatus[epicBranch] || { merged: false, loading: true }) : null,
          mergeTarget: showEpicMergeStatus ? 'base' : null
        })
      }

      // Sort story branches naturally
      storyBranches.sort((a, b) => {
        const aMatch = a.match(/^(\d+)-(\d+)/)
        const bMatch = b.match(/^(\d+)-(\d+)/)
        if (aMatch && bMatch) {
          return parseInt(aMatch[2]) - parseInt(bMatch[2])
        }
        return a.localeCompare(b)
      })

      // Add story branches (indented under epic)
      // Show merge status if we're on this epic's branch, OR if on base branch with epic branches disabled
      const showMergeStatus = currentEpicId === epicId || (isOnBaseBranch && !enableEpicBranches)
      // Determine merge target: if on base branch (epic branches disabled), merge to base; otherwise merge to epic
      const storyMergeTarget = isOnBaseBranch && !enableEpicBranches ? 'base' : (currentEpicId === epicId ? 'epic' : null)
      for (const branch of storyBranches) {
        result.push({
          id: branch,
          label: branch,
          isEpicBranch: false,
          isStoryBranch: true,
          epicId,
          mergeStatus: showMergeStatus ? (mergeStatus[branch] || { merged: false, loading: true }) : null,
          mergeTarget: storyMergeTarget
        })
      }
    }

    return result
  }, [filteredBranches, currentEpicId, mergeStatus, baseBranch, isOnBaseBranch, epicMergeStatus, enableEpicBranches])

  const handleClick = () => {
    if (!projectPath || !currentBranch) return

    if (open) {
      setAnchorEl(null)
    } else if (triggerRef.current) {
      setAnchorEl(triggerRef.current)
    }
  }

  const handleClose = () => {
    setAnchorEl(null)
    setError(null)
  }

  const handleBranchSelect = async (branchName: string) => {
    if (!projectPath || branchName === currentBranch) {
      handleClose()
      return
    }

    setCheckoutLoading(true)
    setError(null)

    try {
      const result = await window.gitAPI.checkoutBranch(projectPath, branchName)
      if (result.error) {
        setError(result.error)
        // Keep dropdown open to show error
        return
      }

      // Update current branch
      setCurrentBranch(branchName)
      handleClose()

      // Refresh project data after branch switch
      loadProjectData()
    } catch {
      setError('Failed to switch branches')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleMergeBranch = async (branchToMerge: string, e: React.MouseEvent) => {
    e.stopPropagation() // Don't trigger branch selection
    if (!projectPath || mergingBranch) return

    setMergingBranch(branchToMerge)
    setError(null)

    // Determine if this is an epic branch merge
    const isEpicMerge = /^epic-\d+-/.test(branchToMerge)

    try {
      const result = await window.gitAPI.mergeBranch(projectPath, branchToMerge)
      if (!result.success) {
        setError(result.error || 'Merge failed')
        return
      }

      // Update the appropriate merge status based on branch type
      if (isEpicMerge) {
        setEpicMergeStatus(prev => ({
          ...prev,
          [branchToMerge]: { merged: true, loading: false }
        }))
      } else {
        setMergeStatus(prev => ({
          ...prev,
          [branchToMerge]: { merged: true, loading: false }
        }))

        // Update store to remove this branch from unmerged list (only for story branches)
        const currentUnmerged = useStore.getState().unmergedStoryBranches
        setUnmergedStoryBranches(currentUnmerged.filter(b => b !== branchToMerge))
      }

      // Refresh project data after merge
      loadProjectData()
    } catch {
      setError('Failed to merge branch')
    } finally {
      setMergingBranch(null)
    }
  }

  // Don't render if not in a git repo or if git branching is disabled
  if (!projectPath || !currentBranch || disableGitBranching) {
    return null
  }

  // Convert branches to dropdown items with custom rendering
  const branchItems: SearchableDropdownItem[] = groupedBranches.map((branch) => {
    // Epic branch - show with tree icon and merge status when on base branch
    if (branch.isEpicBranch) {
      return {
        id: branch.id,
        label: branch.label,
        customRender: (
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
            <AccountTreeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            <Typography
              variant="body2"
              sx={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: branch.id === currentBranch ? 600 : 400
              }}
            >
              {branch.label}
            </Typography>
            {/* Show merge status when on base branch */}
            {branch.mergeStatus && (
              branch.mergeStatus.loading ? (
                <CircularProgress size={14} sx={{ color: 'text.disabled' }} />
              ) : branch.mergeStatus.merged ? (
                <Tooltip title="Merged into base branch">
                  <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                </Tooltip>
              ) : allowDirectEpicMerge ? (
                <Tooltip title="Merge into base branch">
                  <IconButton
                    size="small"
                    onClick={(e) => handleMergeBranch(branch.id, e)}
                    disabled={mergingBranch !== null}
                    sx={{
                      p: 0.25,
                      '&:hover': { bgcolor: 'action.hover' }
                    }}
                  >
                    {mergingBranch === branch.id ? (
                      <CircularProgress size={14} sx={{ color: 'primary.main' }} />
                    ) : (
                      <MergeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                    )}
                  </IconButton>
                </Tooltip>
              ) : (
                <Tooltip title="Not merged (use PR to merge)">
                  <Chip
                    label="unmerged"
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.65rem',
                      bgcolor: 'warning.main',
                      color: 'warning.contrastText'
                    }}
                  />
                </Tooltip>
              )
            )}
          </Box>
        )
      }
    }

    // Story branch - show indented with merge status (if on parent epic)
    if (branch.isStoryBranch) {
      return {
        id: branch.id,
        label: branch.label,
        customRender: (
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 0.5 }}>
            <SubdirectoryArrowRightIcon sx={{ fontSize: 14, color: 'text.disabled', ml: 1 }} />
            <Typography
              variant="body2"
              sx={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: branch.id === currentBranch ? 600 : 400
              }}
            >
              {branch.label}
            </Typography>
            {/* Show merge status when on the parent epic or on base branch with epic branches disabled */}
            {branch.mergeStatus && (
              branch.mergeStatus.loading ? (
                <CircularProgress size={14} sx={{ color: 'text.disabled' }} />
              ) : branch.mergeStatus.merged ? (
                <Tooltip title={branch.mergeTarget === 'base' ? "Merged into base branch" : "Merged into epic"}>
                  <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                </Tooltip>
              ) : (
                <Tooltip title={branch.mergeTarget === 'base' ? "Merge into base branch" : "Merge into epic"}>
                  <IconButton
                    size="small"
                    onClick={(e) => handleMergeBranch(branch.id, e)}
                    disabled={mergingBranch !== null}
                    sx={{
                      p: 0.25,
                      '&:hover': { bgcolor: 'action.hover' }
                    }}
                  >
                    {mergingBranch === branch.id ? (
                      <CircularProgress size={14} sx={{ color: 'primary.main' }} />
                    ) : (
                      <MergeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                    )}
                  </IconButton>
                </Tooltip>
              )
            )}
          </Box>
        )
      }
    }

    // Base branch or other branches - no custom render
    return {
      id: branch.id,
      label: branch.label
    }
  })

  return (
    <Box
      ref={triggerRef}
      onClick={handleClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        cursor: 'pointer',
        px: 0.5,
        py: 0.25,
        borderRadius: 0.5,
        '&:hover': {
          bgcolor: 'action.hover'
        }
      }}
    >
        {checkoutLoading ? (
          <CircularProgress size={12} sx={{ color: 'text.secondary' }} />
        ) : (
          <ForkRightIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {currentBranch}
        </Typography>
        {currentEpicId && (
          <Chip
            label={`Epic ${currentEpicId}`}
            size="small"
            sx={{
              height: 16,
              fontSize: '0.65rem',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '& .MuiChip-label': { px: 0.75, py: 0 }
            }}
          />
        )}
        <KeyboardArrowUpIcon
          sx={{
            fontSize: 14,
            color: 'text.disabled',
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'none'
          }}
        />

        <SearchableDropdown
          items={branchItems}
          selectedId={currentBranch}
          onSelect={handleBranchSelect}
          placeholder="Search branches..."
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          loading={loading}
          emptyMessage={error || "No branches found"}
        />
      </Box>
  )
}
