import { useState } from 'react'
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Alert, IconButton, Tooltip, Snackbar } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { useStore } from '../../store'
import { AI_TOOLS, AITool } from '../../types'
import { useWorkflow } from '../../hooks/useWorkflow'
import { transformCommand } from '../../utils/commandTransform'

function usesClaudeSyntax(aiTool: AITool): boolean {
  return aiTool === 'claude-code' || aiTool === 'custom-endpoint'
}

export default function CommandsTab() {
  const aiTool = useStore((state) => state.aiTool)
  const selectedTool = AI_TOOLS.find((t) => t.id === aiTool) || AI_TOOLS[0]
  const { agents, getProjectWorkflows, getAgentName } = useWorkflow()
  const [snackbarOpen, setSnackbarOpen] = useState(false)

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setSnackbarOpen(true)
  }

  const projectWorkflows = getProjectWorkflows()
  const hasPhases = Object.keys(projectWorkflows).length > 0

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Commands shown for <strong>{selectedTool.name}</strong>.{' '}
        {usesClaudeSyntax(aiTool)
          ? 'Uses full path slash commands.'
          : 'Commands use * prefix for workflows and ' + selectedTool.agentPrefix + ' for agents.'}
        {' '}Change your tool in Settings.
      </Alert>

      {hasPhases ? (
        // Scan-driven: show commands grouped by project workflow phase
        <>
          {Object.entries(projectWorkflows).map(([phaseId, phase]) => (
            <Box key={phaseId} sx={{ mb: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="h6" fontWeight={600}>
                  {phase.icon} {phase.label}
                </Typography>
                <Chip
                  label={`${phase.workflows.length} commands`}
                  size="small"
                  sx={{ bgcolor: 'primary.main', color: 'white', height: 22, fontSize: '0.75rem' }}
                />
              </Box>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 600, width: '30%' }}>Command</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: '45%' }}>Description</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: '25%' }}>Agent</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {phase.workflows.map((wf) => {
                      const transformed = transformCommand(wf.command, aiTool)
                      return (
                        <TableRow key={wf.command} hover>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography
                                variant="body2"
                                sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'primary.main' }}
                              >
                                {transformed}
                              </Typography>
                              <Tooltip title="Copy">
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(transformed)}
                                  sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{wf.description}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {getAgentName(wf.agentId)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ))}
        </>
      ) : (
        // Fallback: collect all commands from agents, group by agent
        <>
          {agents.map((agent) => (
            <Box key={agent.id} sx={{ mb: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="h6" fontWeight={600}>
                  {agent.role}
                </Typography>
                <Chip
                  label={agent.name}
                  size="small"
                  sx={{ bgcolor: agent.color, color: 'white', height: 22, fontSize: '0.75rem' }}
                />
              </Box>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Command</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {agent.commands.map((cmd) => {
                      const transformed = transformCommand(cmd, aiTool)
                      const isAgent = cmd.includes(':agents:') || cmd.includes('-agent-')
                      return (
                        <TableRow key={cmd} hover>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography
                                variant="body2"
                                sx={{ fontFamily: 'monospace', fontWeight: 600, color: agent.color }}
                              >
                                {transformed}
                              </Typography>
                              <Tooltip title="Copy">
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopy(transformed)}
                                  sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={isAgent ? 'Agent' : 'Workflow'}
                              size="small"
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ))}
        </>
      )}

      {/* Agent Invocations */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          Agent Invocations
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 600, width: '35%' }}>Command</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '30%' }}>Agent</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '35%' }}>Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {agents.map((agent) => {
                const invocationCmd = agent.commands[0]
                if (!invocationCmd) return null
                const transformed = transformCommand(invocationCmd, aiTool)
                return (
                  <TableRow key={agent.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'monospace', fontWeight: 600, color: agent.color }}
                        >
                          {transformed}
                        </Typography>
                        <Tooltip title="Copy">
                          <IconButton
                            size="small"
                            onClick={() => handleCopy(transformed)}
                            sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: agent.color } }}
                          >
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {agent.role} ({agent.name})
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {agent.description}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Pro Tips */}
      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover', mt: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Pro Tips for {selectedTool.name}
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          {agents.length > 0 && (
            <Typography component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Start a session by invoking an agent, e.g.{' '}
              <code>{transformCommand(agents[0].commands[0], aiTool)}</code>
            </Typography>
          )}
          <Typography component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {usesClaudeSyntax(aiTool)
              ? 'Claude CLI uses full path slash commands — these are auto-formatted for your tool.'
              : `Commands starting with * are workflows; ${selectedTool.agentPrefix} prefix invokes agents.`}
          </Typography>
          <Typography component="li" variant="body2" color="text.secondary">
            Switch AI tools in Settings to see commands formatted for a different tool.
          </Typography>
        </Box>
      </Paper>

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
