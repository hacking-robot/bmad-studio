import { useMemo, useState, useEffect } from 'react'
import { Box, Typography, Tooltip, IconButton, Chip, CircularProgress } from '@mui/material'
import CircleIcon from '@mui/icons-material/Circle'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import DownloadIcon from '@mui/icons-material/Download'
import InstallDesktopIcon from '@mui/icons-material/InstallDesktop'
import { useStore } from '../../store'
import { STATUS_COLUMNS, StoryStatus } from '../../types'
import BranchSwitcher from '../BranchSwitcher'
import UncommittedChanges from '../UncommittedChanges'

// Status descriptions for tooltips
const statusDescriptions: Record<StoryStatus, string> = {
  backlog: 'Stories not yet ready for development',
  'ready-for-dev': 'Stories ready to implement',
  'in-progress': 'Currently being developed',
  review: 'Code complete, awaiting review',
  'human-review': 'Awaiting human review approval',
  done: 'Implemented and verified',
  optional: 'Nice-to-have features'
}

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
const modKey = isMac ? '⌘' : 'Ctrl'

function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Never'

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)

  if (diffSec < 10) return 'Just now'
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  return date.toLocaleDateString()
}

export default function StatusBar() {
  const [appVersion, setAppVersion] = useState<string>('')

  useEffect(() => {
    window.updaterAPI.getAppVersion().then(setAppVersion)
  }, [])

  const stories = useStore((state) => state.stories)
  const epics = useStore((state) => state.epics)
  const selectedEpicId = useStore((state) => state.selectedEpicId)
  const lastRefreshed = useStore((state) => state.lastRefreshed)
  const isWatching = useStore((state) => state.isWatching)
  const setHelpPanelOpen = useStore((state) => state.setHelpPanelOpen)
  const projectCostTotal = useStore((state) => state.projectCostTotal)
  const developerMode = useStore((state) => state.developerMode)
  const viewMode = useStore((state) => state.viewMode)
  const bmadScanResult = useStore((state) => state.bmadScanResult)

  // Auto-update state from global store
  const updateStatus = useStore((state) => state.updateStatus)
  const updateVersion = useStore((state) => state.updateVersion)
  const updateDownloadPercent = useStore((state) => state.updateDownloadPercent)

  const handleUpdateClick = () => {
    if (updateStatus === 'available') {
      window.updaterAPI.downloadUpdate()
    } else if (updateStatus === 'ready') {
      window.updaterAPI.installUpdate()
    }
  }

  // Count stories by status
  const statusCounts = useMemo(() => {
    const counts: Record<StoryStatus, number> = {
      'backlog': 0,
      'ready-for-dev': 0,
      'in-progress': 0,
      'review': 0,
      'human-review': 0,
      'done': 0,
      'optional': 0
    }

    const filteredStories = selectedEpicId !== null
      ? stories.filter(s => s.epicId === selectedEpicId)
      : stories

    for (const story of filteredStories) {
      counts[story.status]++
    }

    return counts
  }, [stories, selectedEpicId])

  // Get selected epic name
  const selectedEpicName = useMemo(() => {
    if (selectedEpicId === null) return 'All Epics'
    const epic = epics.find(e => e.id === selectedEpicId)
    return epic ? epic.name : 'Unknown Epic'
  }, [epics, selectedEpicId])

  // Format status counts for display (only show non-zero counts for main statuses)
  const statusDisplay = useMemo(() => {
    return STATUS_COLUMNS
      .map(col => ({
        ...col,
        count: statusCounts[col.status]
      }))
      .filter(col => col.count > 0)
  }, [statusCounts])

  return (
    <Box
      sx={{
        height: 28,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        gap: 2,
        flexShrink: 0
      }}
    >
      {/* Left section - File watcher, branch switcher & story counts */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* File watcher status */}
        <Tooltip title={isWatching ? 'Auto-refresh active' : 'Auto-refresh inactive'}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CircleIcon
              sx={{
                fontSize: 8,
                color: isWatching ? 'success.main' : 'text.disabled'
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {isWatching ? 'Watching' : 'Not watching'}
            </Typography>
          </Box>
        </Tooltip>

        {/* Git branch switcher and uncommitted changes */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <BranchSwitcher />
          <UncommittedChanges />
        </Box>

        {/* Developer mode indicator - only shown in board mode */}
        {viewMode === 'board' && (
          <Tooltip title={developerMode === 'human' ? 'Manual Development mode' : 'AI Driven Development mode'}>
            <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help' }}>
              {developerMode === 'human' ? 'Manual Dev' : 'AI Driven'}
            </Typography>
          </Tooltip>
        )}

        {/* BMAD version and modules */}
        {bmadScanResult?.version && (
          <Tooltip title={`BMAD version: ${bmadScanResult.version}${bmadScanResult.modules.length > 0 ? `\nModules: ${bmadScanResult.modules.join(', ')}` : ''}`}>
            <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help', fontFamily: 'monospace', fontSize: '0.65rem' }}>
              BMAD v{bmadScanResult.version}
              {bmadScanResult.modules.length > 0 && (
                <Typography component="span" variant="caption" color="text.disabled" sx={{ fontFamily: 'monospace', fontSize: '0.65rem', ml: 0.5 }}>
                  ({bmadScanResult.modules.join(', ')})
                </Typography>
              )}
            </Typography>
          </Tooltip>
        )}

        {/* Story counts by status - only in board mode */}
        {viewMode === 'board' && statusDisplay.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {statusDisplay.map((col) => (
              <Tooltip
                key={col.status}
                title={`${col.count} ${col.label}: ${statusDescriptions[col.status]}`}
                arrow
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: col.color
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {col.count}
                  </Typography>
                </Box>
              </Tooltip>
            ))}
          </Box>
        )}
      </Box>

      {/* Center section - Current epic (only in board mode) */}
      {viewMode === 'board' && (
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {selectedEpicName}
        </Typography>
      )}

      {/* Right section - Last refreshed & keyboard hint */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* Update available / downloading / ready indicator */}
        {updateStatus === 'available' && (
          <Tooltip title={`Update v${updateVersion} available - click to download`}>
            <Chip
              size="small"
              icon={<DownloadIcon sx={{ fontSize: 14 }} />}
              label={`v${updateVersion}`}
              onClick={handleUpdateClick}
              color="info"
              sx={{
                cursor: 'pointer',
                height: 20,
                fontSize: '0.65rem',
                '& .MuiChip-icon': { fontSize: 14 },
                '& .MuiChip-label': { px: 0.5 }
              }}
            />
          </Tooltip>
        )}
        {updateStatus === 'downloading' && (
          <Tooltip title={`Downloading update... ${updateDownloadPercent}%`}>
            <Chip
              size="small"
              icon={<CircularProgress size={12} variant="determinate" value={updateDownloadPercent} />}
              label={`${updateDownloadPercent}%`}
              color="info"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                '& .MuiChip-icon': { ml: 0.5 },
                '& .MuiChip-label': { px: 0.5 }
              }}
            />
          </Tooltip>
        )}
        {updateStatus === 'ready' && (
          <Tooltip title={`Update v${updateVersion} ready - click to install & restart`}>
            <Chip
              size="small"
              icon={<InstallDesktopIcon sx={{ fontSize: 14 }} />}
              label={`Install v${updateVersion}`}
              onClick={handleUpdateClick}
              color="success"
              sx={{
                cursor: 'pointer',
                height: 20,
                fontSize: '0.65rem',
                '& .MuiChip-icon': { fontSize: 14 },
                '& .MuiChip-label': { px: 0.5 }
              }}
            />
          </Tooltip>
        )}

        {/* Project LLM cost total */}
        {projectCostTotal > 0 && (
          <Tooltip title={`Total LLM cost for this project: $${projectCostTotal.toFixed(4)}`}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'help' }}>
              <AttachMoneyIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {projectCostTotal < 0.01
                  ? projectCostTotal.toFixed(4)
                  : projectCostTotal < 1
                    ? projectCostTotal.toFixed(3)
                    : projectCostTotal.toFixed(2)}
              </Typography>
            </Box>
          </Tooltip>
        )}

        {/* Last refreshed */}
        <Tooltip title="Last data refresh">
          <Typography variant="caption" color="text.secondary">
            {formatRelativeTime(lastRefreshed)}
          </Typography>
        </Tooltip>

        {/* Keyboard shortcut hint */}
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{
            fontFamily: 'monospace',
            cursor: 'pointer',
            '&:hover': { color: 'text.secondary' }
          }}
          onClick={() => window.dispatchEvent(new CustomEvent('open-keyboard-shortcuts'))}
        >
          {modKey}P Command Palette
        </Typography>

        {/* Help button */}
        <Tooltip title="BMAD Guide (F1)">
          <IconButton
            size="small"
            onClick={() => setHelpPanelOpen(true)}
            sx={{
              p: 0.25,
              color: 'text.disabled',
              '&:hover': { color: 'text.secondary' }
            }}
          >
            <HelpOutlineIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* App version */}
        {appVersion && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}
          >
            v{appVersion}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
