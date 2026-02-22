import { useState, memo } from 'react'
import { Box, Typography, Paper, Chip, IconButton, Tooltip, Popover } from '@mui/material'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { Story, StoryStatus } from '../../types'
import type { AgentDefinition } from '../../types/flow'
import StoryCard from '../StoryCard/StoryCard'
import { useWorkflow } from '../../hooks/useWorkflow'

interface ColumnProps {
  status: StoryStatus
  label: string
  color: string
  stories: Story[]
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  disableDrag?: boolean
  lockedStoryIds?: Set<string>
  workingTeammatesByBranch?: Record<string, AgentDefinition>
}

function Column({
  status,
  label,
  color,
  stories,
  isCollapsed = false,
  onToggleCollapse,
  disableDrag = false,
  lockedStoryIds = new Set(),
  workingTeammatesByBranch = {}
}: ColumnProps) {
  const [infoAnchor, setInfoAnchor] = useState<HTMLButtonElement | null>(null)
  const { getStatus, getPrimaryNextStep, getAgentName } = useWorkflow()

  // Make column droppable
  const { setNodeRef, isOver } = useDroppable({
    id: status
  })

  // Get status info from flow.json
  const statusDef = getStatus(status)
  const primaryStep = getPrimaryNextStep(status)
  const info = {
    description: statusDef?.description || '',
    agent: primaryStep ? getAgentName(primaryStep.agentId) : '-',
    nextStep: primaryStep?.description || 'No next step defined'
  }

  // Collapsed view - thin vertical bar
  if (isCollapsed) {
    return (
      <Paper
        elevation={0}
        onClick={onToggleCollapse}
        sx={{
          width: 48,
          flexShrink: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          bgcolor: 'background.default',
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            bgcolor: 'action.hover'
          }
        }}
      >
        {/* Collapsed Header */}
        <Box
          sx={{
            py: 1.5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1
          }}
        >
          <ChevronRightIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: color
            }}
          />
          <Chip
            label={stories.length}
            size="small"
            sx={{
              height: 20,
              minWidth: 24,
              bgcolor: 'action.hover',
              fontWeight: 600,
              fontSize: '0.7rem',
              '& .MuiChip-label': { px: 0.75 }
            }}
          />
        </Box>

        {/* Rotated Label */}
        <Typography
          variant="caption"
          fontWeight={600}
          sx={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            transform: 'rotate(180deg)',
            color: 'text.secondary',
            mt: 1,
            letterSpacing: '0.05em'
          }}
        >
          {label}
        </Typography>
      </Paper>
    )
  }

  // Expanded view
  return (
    <Paper
      elevation={0}
      sx={{
        width: 300,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        transition: 'width 0.2s ease'
      }}
    >
      {/* Column Header */}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}
      >
        <Tooltip title="Collapse column">
          <IconButton
            size="small"
            onClick={onToggleCollapse}
            sx={{
              p: 0.25,
              color: 'text.secondary',
              '&:hover': { color: 'text.primary' }
            }}
          >
            <ChevronLeftIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            bgcolor: color
          }}
        />
        <Typography
          variant="subtitle2"
          fontWeight={600}
          sx={{ flex: 1, color: 'text.primary' }}
        >
          {label}
        </Typography>
        <Tooltip title="What's this?">
          <IconButton
            size="small"
            onClick={(e) => setInfoAnchor(e.currentTarget)}
            sx={{
              p: 0.25,
              color: 'text.disabled',
              '&:hover': { color: 'text.secondary' }
            }}
          >
            <InfoOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Chip
          label={stories.length}
          size="small"
          sx={{
            height: 22,
            minWidth: 28,
            bgcolor: 'action.hover',
            fontWeight: 600,
            fontSize: '0.75rem'
          }}
        />
      </Box>

      {/* Info Popover */}
      <Popover
        open={Boolean(infoAnchor)}
        anchorEl={infoAnchor}
        onClose={() => setInfoAnchor(null)}
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
              maxWidth: 280,
              borderRadius: 1.5
            }
          }
        }}
      >
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {info.description}
        </Typography>
        {info.agent !== '-' && (
          <Typography variant="caption" color="primary.main" sx={{ display: 'block', mb: 1 }}>
            Agent: {info.agent}
          </Typography>
        )}
        <Box
          sx={{
            bgcolor: 'action.hover',
            p: 1,
            borderRadius: 1,
            mt: 1
          }}
        >
          <Typography variant="caption" fontWeight={500}>
            Next: {info.nextStep}
          </Typography>
        </Box>
      </Popover>

      {/* Stories List - Droppable area */}
      <Box
        ref={setNodeRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          p: 1.5,
          bgcolor: isOver ? 'action.hover' : 'transparent',
          transition: 'background-color 0.2s ease',
          border: isOver ? 2 : 0,
          borderColor: isOver ? 'primary.main' : 'transparent',
          borderStyle: 'dashed',
          borderRadius: 1,
          m: isOver ? 0.5 : 0,
          '&::-webkit-scrollbar': {
            width: 6
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: 'transparent'
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: 'transparent',
            borderRadius: 3,
            transition: 'background-color 0.2s'
          },
          '&:hover::-webkit-scrollbar-thumb': {
            bgcolor: 'action.disabled'
          },
          '&:hover::-webkit-scrollbar-thumb:hover': {
            bgcolor: 'action.active'
          }
        }}
      >
        <SortableContext items={stories.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              minHeight: isOver ? 100 : 0
            }}
          >
            {stories.length === 0 ? (
              <Box
                sx={{
                  py: 4,
                  textAlign: 'center'
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  {isOver ? 'Drop here' : 'No stories'}
                </Typography>
              </Box>
            ) : (
              stories.map((story) => {
                const isLocked = lockedStoryIds.has(story.id)
                return (
                  <StoryCard
                    key={story.id}
                    story={story}
                    disableDrag={disableDrag || isLocked}
                    isLocked={isLocked}
                    workingTeammate={workingTeammatesByBranch[story.id]}
                  />
                )
              })
            )}
          </Box>
        </SortableContext>
      </Box>
    </Paper>
  )
}

export default memo(Column)
