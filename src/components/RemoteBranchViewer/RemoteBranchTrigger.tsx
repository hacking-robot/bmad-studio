import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Box, Typography, Tooltip, CircularProgress, IconButton, Chip, Divider } from '@mui/material'
import CloudIcon from '@mui/icons-material/Cloud'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import RefreshIcon from '@mui/icons-material/Refresh'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import SearchableDropdown, { SearchableDropdownItem } from '../common/SearchableDropdown'
import { useStore } from '../../store'
import { useProjectData } from '../../hooks/useProjectData'

/**
 * Standalone remote branch viewer trigger for the status bar.
 * Allows viewing board data from remote branches in read-only mode,
 * independent of the local git branch switcher.
 */
export default function RemoteBranchTrigger() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [remoteBranches, setRemoteBranches] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)

  const projectPath = useStore((state) => state.projectPath)
  const currentBranch = useStore((state) => state.currentBranch)
  const remoteViewingBranch = useStore((state) => state.remoteViewingBranch)
  const setRemoteViewingBranch = useStore((state) => state.setRemoteViewingBranch)
  const isRemoteProject = useStore((state) => state.isRemoteProject)
  const { loadProjectData } = useProjectData()

  const open = Boolean(anchorEl)

  const loadRemoteBranches = useCallback(async (doFetch = false) => {
    if (!projectPath) return
    setLoading(true)
    try {
      if (doFetch) {
        await window.gitAPI.fetch(projectPath)
      }
      const result = await window.gitAPI.listRemoteBranches(projectPath)
      if (result.branches) {
        setRemoteBranches(result.branches)
      }
      setFetched(true)
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  // Auto-load branches when a standalone remote project is opened
  useEffect(() => {
    if (isRemoteProject && projectPath && !fetched) {
      loadRemoteBranches(false)
    }
  }, [isRemoteProject, projectPath, fetched, loadRemoteBranches])

  const handleClick = () => {
    if (open) {
      setAnchorEl(null)
    } else if (triggerRef.current) {
      setAnchorEl(triggerRef.current)
      if (!fetched) {
        loadRemoteBranches(false)
      }
    }
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation()
    loadRemoteBranches(true)
  }

  const handleRemoteBranchSelect = (branchName: string) => {
    setRemoteViewingBranch(branchName)
    handleClose()
    loadProjectData()
  }

  const handleExitRemoteView = () => {
    setRemoteViewingBranch(null)
    handleClose()
    loadProjectData()
  }

  // Build dropdown items
  const items: SearchableDropdownItem[] = useMemo(() => {
    const result: SearchableDropdownItem[] = []

    // "Exit Remote View" only for attached mode (local project viewing a remote branch)
    // Not shown for standalone remote projects — there's no local project to return to
    if (remoteViewingBranch && !isRemoteProject) {
      result.push({
        id: '__exit_remote__',
        label: 'Exit Remote View',
        customRender: (
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
            <CloudOffIcon sx={{ fontSize: 16, color: 'warning.main' }} />
            <Typography variant="body2" sx={{ flex: 1, color: 'warning.main', fontWeight: 500 }}>
              Exit Remote View
            </Typography>
          </Box>
        )
      })
    }

    result.push({
      id: '__header__',
      label: 'Remote Branches',
      customRender: (
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
          <Divider sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            Remote Branches
          </Typography>
          <Tooltip title="Fetch & refresh remote branches">
            <IconButton
              size="small"
              onClick={handleRefresh}
              disabled={loading}
              sx={{ p: 0.25 }}
            >
              {loading ? <CircularProgress size={12} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      )
    })

    for (const branch of remoteBranches) {
      result.push({
        id: branch,
        label: branch,
        customRender: (
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
            <CloudIcon sx={{ fontSize: 14, color: 'info.main' }} />
            <Typography
              variant="body2"
              sx={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: remoteViewingBranch === branch ? 600 : 400
              }}
            >
              {branch}
            </Typography>
            {remoteViewingBranch === branch && (
              <Chip
                label="viewing"
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.6rem',
                  bgcolor: 'info.main',
                  color: 'info.contrastText'
                }}
              />
            )}
          </Box>
        )
      })
    }

    return result
  }, [remoteBranches, remoteViewingBranch, isRemoteProject, loading])

  // Don't render when no project is open
  if (!projectPath || !currentBranch) {
    return null
  }

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
      <CloudIcon sx={{ fontSize: 14, color: (remoteViewingBranch || isRemoteProject) ? 'info.main' : 'text.secondary' }} />
      {remoteViewingBranch ? (
        <Typography
          variant="caption"
          color="info.main"
          sx={{
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {remoteViewingBranch}
        </Typography>
      ) : isRemoteProject ? (
        <Typography
          variant="caption"
          color="info.main"
          sx={{ whiteSpace: 'nowrap' }}
        >
          Select branch...
        </Typography>
      ) : null}
      <KeyboardArrowUpIcon
        sx={{
          fontSize: 14,
          color: 'text.disabled',
          transition: 'transform 0.2s',
          transform: open ? 'rotate(180deg)' : 'none'
        }}
      />

      <SearchableDropdown
        items={items}
        selectedId={remoteViewingBranch || ''}
        onSelect={(id) => {
          if (id === '__exit_remote__') {
            handleExitRemoteView()
          } else if (id === '__header__') {
            // No-op for header
          } else {
            handleRemoteBranchSelect(id)
          }
        }}
        placeholder="Search remote branches..."
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        loading={loading && remoteBranches.length === 0}
        emptyMessage="No remote branches found. Click refresh to fetch."
      />
    </Box>
  )
}
