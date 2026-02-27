import { useState, useEffect, useRef } from 'react'
import { Box, Typography, Paper, Stack, Chip, Divider, Alert, IconButton, Tooltip, Snackbar, Badge } from '@mui/material'
import PersonIcon from '@mui/icons-material/Person'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { useStore } from '../../store'
import { AI_TOOLS, AITool } from '../../types'
import { useWorkflow } from '../../hooks/useWorkflow'
import { transformCommand } from '../../utils/commandTransform'

// Check if tool uses Claude CLI syntax
function usesClaudeSyntax(aiTool: AITool): boolean {
  return aiTool === 'claude-code' || aiTool === 'custom-endpoint'
}

export default function AgentsTab() {
  const aiTool = useStore((state) => state.aiTool)
  const scrollToAgent = useStore((state) => state.helpPanelScrollToAgent)
  const clearHelpPanelScrollToAgent = useStore((state) => state.clearHelpPanelScrollToAgent)
  const chatThreads = useStore((state) => state.chatThreads)
  const selectedTool = AI_TOOLS.find((t) => t.id === aiTool) || AI_TOOLS[0]
  const { agents } = useWorkflow()
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const agentRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Scroll to specific agent when requested
  useEffect(() => {
    if (scrollToAgent && agentRefs.current[scrollToAgent]) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        agentRefs.current[scrollToAgent]?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
        clearHelpPanelScrollToAgent()
      }, 100)
    }
  }, [scrollToAgent, clearHelpPanelScrollToAgent])

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setSnackbarOpen(true)
  }

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Commands shown for <strong>{selectedTool.name}</strong>. Agent invocations use{' '}
        <code style={{ fontWeight: 600 }}>{usesClaudeSyntax(aiTool) ? `/bmad-agent-...` : `${selectedTool.agentPrefix}agent`}</code> syntax.
        Change your tool in Settings.
      </Alert>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        BMAD uses specialized agents, each with a distinct role in the development process.
        Work with these agents in your AI coding assistant to guide your project.
      </Typography>

      <Stack spacing={2}>
        {agents.map((agent) => (
          <Paper
            key={agent.id}
            ref={(el) => { agentRefs.current[agent.id] = el }}
            variant="outlined"
            sx={{
              p: 2,
              borderLeft: 4,
              borderLeftColor: agent.color
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <PersonIcon sx={{ color: agent.color }} />
              <Typography variant="subtitle1" fontWeight={600}>
                {agent.role}
              </Typography>
              <Badge
                badgeContent={chatThreads[agent.id]?.unreadCount || 0}
                color="error"
                invisible={!chatThreads[agent.id]?.unreadCount}
                sx={{
                  '& .MuiBadge-badge': {
                    fontSize: '0.65rem',
                    height: 16,
                    minWidth: 16
                  }
                }}
              >
                <Chip
                  label={agent.name}
                  size="small"
                  sx={{
                    bgcolor: agent.color,
                    color: 'white',
                    fontWeight: 500,
                    height: 22
                  }}
                />
              </Badge>
              {chatThreads[agent.id]?.isTyping && (
                <Chip
                  label="Working..."
                  size="small"
                  sx={{
                    bgcolor: 'success.main',
                    color: 'white',
                    fontWeight: 500,
                    height: 20,
                    fontSize: '0.7rem',
                    animation: 'pulse 1.5s ease-in-out infinite',
                    '@keyframes pulse': {
                      '0%, 100%': { opacity: 1 },
                      '50%': { opacity: 0.6 }
                    }
                  }}
                />
              )}
              {agent.commands[0] && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <Chip
                    label={transformCommand(agent.commands[0], aiTool)}
                    size="small"
                    variant="outlined"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      height: 22,
                      borderColor: agent.color,
                      color: agent.color
                    }}
                  />
                  <Tooltip title="Copy">
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(transformCommand(agent.commands[0], aiTool))}
                      sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: agent.color } }}
                    >
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>

            <Typography variant="body2" sx={{ mb: 1.5 }}>
              {agent.description}
            </Typography>

            <Typography variant="caption" fontWeight={600} color="text.secondary">
              When to use:
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {agent.whenToUse}
            </Typography>

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Example prompts:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2, mb: 1.5 }}>
              {agent.examplePrompts.map((prompt, i) => (
                <Typography
                  key={i}
                  component="li"
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    color: 'text.secondary',
                    mb: 0.5
                  }}
                >
                  "{prompt}"
                </Typography>
              ))}
            </Box>

            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Commands:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {agent.commands.map((cmd) => (
                <Box key={cmd} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <Chip
                    label={transformCommand(cmd, aiTool)}
                    size="small"
                    variant="outlined"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      height: 24
                    }}
                  />
                  <Tooltip title="Copy">
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(transformCommand(cmd, aiTool))}
                      sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
                    >
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          </Paper>
        ))}
      </Stack>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
        message="Copied to clipboard"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  )
}
