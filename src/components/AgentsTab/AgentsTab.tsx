import { Box, Typography, List, ListItem, ListItemButton, ListItemText, Chip, IconButton, Paper } from '@mui/material'
import StopIcon from '@mui/icons-material/Stop'
import TerminalIcon from '@mui/icons-material/Terminal'
import { useStore } from '../../store'

function formatUptime(startTime: number): string {
  const seconds = Math.floor((Date.now() - startTime) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export default function AgentsTab() {
  const agents = useStore((state) => state.agents)
  const setActiveAgent = useStore((state) => state.setActiveAgent)
  const setAgentPanelOpen = useStore((state) => state.setAgentPanelOpen)
  const removeAgent = useStore((state) => state.removeAgent)

  const agentList = Object.values(agents)

  const handleViewAgent = (agentId: string) => {
    setActiveAgent(agentId)
    setAgentPanelOpen(true)
  }

  const handleKillAgent = async (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await window.agentAPI.killAgent(agentId)
    removeAgent(agentId)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'success'
      case 'completed':
        return 'default'
      case 'error':
        return 'error'
      default:
        return 'default'
    }
  }

  if (agentList.length === 0) {
    return (
      <Box
        sx={{
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          color: 'text.secondary'
        }}
      >
        <TerminalIcon sx={{ fontSize: 48, opacity: 0.5 }} />
        <Typography textAlign="center">
          No agents working.
          <br />
          Start an agent from a story card.
        </Typography>
      </Box>
    )
  }

  return (
    <Paper elevation={0} sx={{ bgcolor: 'transparent' }}>
      <List disablePadding>
        {agentList.map((agent) => (
          <ListItem
            key={agent.id}
            disablePadding
            secondaryAction={
              agent.status === 'running' && (
                <IconButton
                  edge="end"
                  color="error"
                  size="small"
                  onClick={(e) => handleKillAgent(agent.id, e)}
                  title="Stop agent"
                >
                  <StopIcon fontSize="small" />
                </IconButton>
              )
            }
            sx={{
              borderBottom: 1,
              borderColor: 'divider'
            }}
          >
            <ListItemButton onClick={() => handleViewAgent(agent.id)}>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {agent.storyTitle}
                    </Typography>
                    <Chip
                      label={agent.status}
                      size="small"
                      color={getStatusColor(agent.status) as 'success' | 'default' | 'error'}
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  </Box>
                }
                secondary={
                  <Box component="span" sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {agent.storyId}
                    </Typography>
                    {agent.command && (
                      <Typography variant="caption" color="text.secondary">
                        {agent.command}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {formatUptime(agent.startTime)}
                    </Typography>
                  </Box>
                }
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Paper>
  )
}
