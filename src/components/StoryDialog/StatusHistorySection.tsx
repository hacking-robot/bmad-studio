import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
  Chip
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import HistoryIcon from '@mui/icons-material/History'
import PersonIcon from '@mui/icons-material/Person'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { useStore } from '../../store'
import { STATUS_COLUMNS, StoryStatus } from '../../types'
import type { StatusChangeEntry } from '../../types'

interface StatusHistorySectionProps {
  storyId: string
}

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
function StatusChangeRow({ entry }: { entry: StatusChangeEntry }) {
  const isUser = entry.source === 'user'

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1,
        px: 1.5,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-child': { borderBottom: 0 }
      }}
    >
      {/* Source indicator */}
      <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 28 }}>
        {isUser ? (
          <PersonIcon sx={{ fontSize: 18, color: 'primary.main' }} titleAccess="You" />
        ) : (
          <SmartToyIcon sx={{ fontSize: 18, color: 'warning.main' }} titleAccess="External" />
        )}
      </Box>

      {/* Status change */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
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

      {/* Timestamp */}
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100, textAlign: 'right' }}>
        {formatDateTime(entry.timestamp)}
      </Typography>
    </Box>
  )
}

export default function StatusHistorySection({ storyId }: StatusHistorySectionProps) {
  const getStatusHistoryForStory = useStore((state) => state.getStatusHistoryForStory)
  const history = getStatusHistoryForStory(storyId)

  // Don't render if no history
  if (history.length === 0) {
    return null
  }

  // Count user vs external changes
  const userChanges = history.filter(e => e.source === 'user').length
  const externalChanges = history.filter(e => e.source === 'external').length

  return (
    <Accordion elevation={0} disableGutters>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ px: 3, bgcolor: 'action.hover' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6">Status History</Typography>
          <Chip
            label={`${history.length} change${history.length !== 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.75rem', height: 22 }}
          />
          {userChanges > 0 && (
            <Chip
              icon={<PersonIcon sx={{ fontSize: '14px !important' }} />}
              label={userChanges}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 20 }}
            />
          )}
          {externalChanges > 0 && (
            <Chip
              icon={<SmartToyIcon sx={{ fontSize: '14px !important' }} />}
              label={externalChanges}
              size="small"
              color="warning"
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 20 }}
            />
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
          {history.map((entry) => (
            <StatusChangeRow key={entry.id} entry={entry} />
          ))}
        </Box>
      </AccordionDetails>
    </Accordion>
  )
}
