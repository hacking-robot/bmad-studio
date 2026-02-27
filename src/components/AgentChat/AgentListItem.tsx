import { ListItemButton, Box, Typography, Badge } from '@mui/material'
import type { AgentDefinition } from '../../types/flow'

interface AgentListItemProps {
  agent: AgentDefinition
  selected: boolean
  unreadCount: number
  isTyping: boolean
  onClick: () => void
}

export default function AgentListItem({
  agent,
  selected,
  unreadCount,
  isTyping,
  onClick
}: AgentListItemProps) {
  return (
    <ListItemButton
      selected={selected}
      onClick={onClick}
      sx={{
        py: 1.5,
        px: 2,
        gap: 1.5,
        '&.Mui-selected': {
          bgcolor: 'action.selected',
          '&:hover': {
            bgcolor: 'action.selected'
          }
        }
      }}
    >
      {/* Avatar */}
      <Badge
        badgeContent={unreadCount}
        color="error"
        overlap="circular"
        invisible={unreadCount === 0}
        sx={{
          '& .MuiBadge-badge': {
            fontSize: '0.65rem',
            height: 18,
            minWidth: 18
          }
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            bgcolor: selected ? 'primary.main' : 'grey.400',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: '0.75rem',
            flexShrink: 0
          }}
        >
          {agent.avatar}
        </Box>
      </Badge>

      {/* Agent Info */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          fontWeight={selected || unreadCount > 0 ? 600 : 400}
          noWrap
        >
          {agent.name}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ display: 'block' }}
        >
          {isTyping ? (
            <Box
              component="span"
              sx={{ color: 'primary.main', fontStyle: 'italic' }}
            >
              working...
            </Box>
          ) : (
            agent.role
          )}
        </Typography>
      </Box>
    </ListItemButton>
  )
}
