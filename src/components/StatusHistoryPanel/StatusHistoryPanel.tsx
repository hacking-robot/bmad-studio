import { useState, useEffect } from 'react'
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
  Tooltip
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import HistoryIcon from '@mui/icons-material/History'
import PersonIcon from '@mui/icons-material/Person'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import FilterListIcon from '@mui/icons-material/FilterList'
import { useStore } from '../../store'
import { STATUS_COLUMNS, StoryStatus } from '../../types'
import type { StatusChangeEntry, StatusChangeSource } from '../../types'

// Get status color from STATUS_COLUMNS
function getStatusColor(status: StoryStatus): string {
  const column = STATUS_COLUMNS.find(c => c.status === status)
  return column?.color || '#9e9e9e'
}

// Get status label from STATUS_COLUMNS
function getStatusLabel(status: StoryStatus): string {
  const column = STATUS_COLUMNS.find(c => c.status === status)
  return column?.label || status
}

// Format timestamp to readable date/time
function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (isToday) {
    return `Today at ${timeStr}`
  } else if (isYesterday) {
    return `Yesterday at ${timeStr}`
  } else {
    return `${date.toLocaleDateString()} at ${timeStr}`
  }
}

// Single status change entry
function StatusChangeRow({ entry, onStoryClick }: { entry: StatusChangeEntry; onStoryClick?: (storyId: string) => void }) {
  const isUser = entry.source === 'user'

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        py: 1.5,
        px: 2,
        borderBottom: 1,
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
        '&:last-child': { borderBottom: 0 }
      }}
    >
      {/* Story title row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 24 }}>
          {isUser ? (
            <Tooltip title="Changed by you">
              <PersonIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            </Tooltip>
          ) : (
            <Tooltip title="Changed externally (AI/file edit)">
              <SmartToyIcon sx={{ fontSize: 16, color: 'warning.main' }} />
            </Tooltip>
          )}
        </Box>
        <Typography
          variant="body2"
          fontWeight={500}
          sx={{
            flex: 1,
            cursor: onStoryClick ? 'pointer' : 'default',
            '&:hover': onStoryClick ? { textDecoration: 'underline' } : {}
          }}
          onClick={() => onStoryClick?.(entry.storyId)}
        >
          {entry.epicId !== undefined && entry.storyNumber !== undefined && (
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
              {entry.epicId}.{entry.storyNumber}{' '}
            </Box>
          )}
          {entry.storyTitle}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(entry.timestamp)}
        </Typography>
      </Box>

      {/* Status change row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 4 }}>
        <Chip
          label={getStatusLabel(entry.oldStatus)}
          size="small"
          sx={{
            bgcolor: getStatusColor(entry.oldStatus),
            color: 'white',
            fontSize: '0.7rem',
            height: 20,
            fontWeight: 500
          }}
        />
        <ArrowForwardIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
        <Chip
          label={getStatusLabel(entry.newStatus)}
          size="small"
          sx={{
            bgcolor: getStatusColor(entry.newStatus),
            color: 'white',
            fontSize: '0.7rem',
            height: 20,
            fontWeight: 500
          }}
        />
      </Box>
    </Box>
  )
}

export default function StatusHistoryPanel() {
  const globalStatusHistory = useStore((state) => state.globalStatusHistory)
  const statusHistoryPanelOpen = useStore((state) => state.statusHistoryPanelOpen)
  const setStatusHistoryPanelOpen = useStore((state) => state.setStatusHistoryPanelOpen)
  const markStatusHistoryViewed = useStore((state) => state.markStatusHistoryViewed)
  const setSelectedStory = useStore((state) => state.setSelectedStory)
  const stories = useStore((state) => state.stories)

  const [sourceFilter, setSourceFilter] = useState<StatusChangeSource | 'all'>('all')

  // Mark all entries as viewed when panel opens
  useEffect(() => {
    if (statusHistoryPanelOpen) {
      markStatusHistoryViewed()
    }
  }, [statusHistoryPanelOpen, markStatusHistoryViewed])

  const handleClose = () => {
    setStatusHistoryPanelOpen(false)
  }

  const handleSourceFilterChange = (_event: React.MouseEvent<HTMLElement>, newFilter: StatusChangeSource | 'all' | null) => {
    if (newFilter !== null) {
      setSourceFilter(newFilter)
    }
  }

  const handleStoryClick = (storyId: string) => {
    const story = stories.find(s => s.id === storyId)
    if (story) {
      setSelectedStory(story)
      setStatusHistoryPanelOpen(false)
    }
  }

  // Filter history based on source
  const filteredHistory = sourceFilter === 'all'
    ? globalStatusHistory
    : globalStatusHistory.filter(entry => entry.source === sourceFilter)

  // Count by source
  const userCount = globalStatusHistory.filter(e => e.source === 'user').length
  const externalCount = globalStatusHistory.filter(e => e.source === 'external').length

  return (
    <Drawer
      anchor="right"
      open={statusHistoryPanelOpen}
      onClose={handleClose}
      PaperProps={{
        sx: {
          width: 400,
          maxWidth: '100vw'
        }
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 2,
          borderBottom: 1,
          borderColor: 'divider'
        }}
      >
        <HistoryIcon color="primary" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          Status History
        </Typography>
        <Chip
          label={globalStatusHistory.length}
          size="small"
          color="primary"
          variant="outlined"
        />
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Filter bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          bgcolor: 'action.hover'
        }}
      >
        <FilterListIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary">
          Filter:
        </Typography>
        <ToggleButtonGroup
          value={sourceFilter}
          exclusive
          onChange={handleSourceFilterChange}
          size="small"
          sx={{ flex: 1 }}
        >
          <ToggleButton value="all" sx={{ py: 0.25, px: 1, fontSize: '0.7rem' }}>
            All ({globalStatusHistory.length})
          </ToggleButton>
          <ToggleButton value="user" sx={{ py: 0.25, px: 1, fontSize: '0.7rem' }}>
            <PersonIcon sx={{ fontSize: 14, mr: 0.5 }} />
            You ({userCount})
          </ToggleButton>
          <ToggleButton value="external" sx={{ py: 0.25, px: 1, fontSize: '0.7rem' }}>
            <SmartToyIcon sx={{ fontSize: 14, mr: 0.5 }} />
            External ({externalCount})
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      {/* History list */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {filteredHistory.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <HistoryIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">
              {globalStatusHistory.length === 0
                ? 'No status changes recorded yet'
                : 'No changes match the current filter'}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {globalStatusHistory.length === 0
                ? 'Drag stories between columns or wait for external changes'
                : 'Try changing the filter above'}
            </Typography>
          </Box>
        ) : (
          filteredHistory.map((entry) => (
            <StatusChangeRow
              key={entry.id}
              entry={entry}
              onStoryClick={handleStoryClick}
            />
          ))
        )}
      </Box>
    </Drawer>
  )
}
