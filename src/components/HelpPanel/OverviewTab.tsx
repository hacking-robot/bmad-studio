import { Box, Typography, Link, Paper, Stack, Divider, Chip } from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { useStore } from '../../store'
import { useWorkflow } from '../../hooks/useWorkflow'

export default function OverviewTab() {
  const projectType = useStore((state) => state.projectType)
  const { agents, getProjectWorkflows, getAgentName } = useWorkflow()

  const projectWorkflows = getProjectWorkflows()
  const hasPhases = Object.keys(projectWorkflows).length > 0

  const title = projectType === 'gds' ? 'Game Dev Studio' : projectType === 'dashboard' ? 'BMAD Tools' : 'BMAD Method'
  const description = projectType === 'gds'
    ? 'Game Dev Studio is an AI-powered framework for game development. Specialized agents guide you from concept to playable game, covering design, architecture, implementation, and testing.'
    : projectType === 'dashboard'
      ? 'This project uses BMAD add-on modules with specialized agents and workflows. Use the Dashboard to browse available workflows and chat with agents.'
      : 'BMAD (Breakthrough Method of Agile AI-Driven Development) is an AI-powered framework that uses specialized agents to guide you through software development. Each agent has a specific role, from analysis through implementation.'

  return (
    <Box>
      <Typography variant="body1" sx={{ mb: 3 }}>
        <strong>{title}</strong> - {description}
      </Typography>

      {hasPhases ? (
        // Scan-driven: show phases from project workflow config
        <>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Development Phases
          </Typography>

          <Stack spacing={2} sx={{ mb: 3 }}>
            {Object.entries(projectWorkflows).map(([phaseId, phase], index) => {
              // Derive unique agents involved in this phase
              const agentIds = [...new Set(phase.workflows.map((wf) => wf.agentId))]

              return (
                <Paper
                  key={phaseId}
                  variant="outlined"
                  sx={{ p: 2, borderLeft: 4, borderLeftColor: 'primary.main' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography fontSize="1.2rem">{phase.icon}</Typography>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {index + 1}. {phase.label}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
                    {agentIds.map((id) => (
                      <Chip
                        key={id}
                        label={getAgentName(id)}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ height: 22, fontSize: '0.75rem' }}
                      />
                    ))}
                  </Box>
                  {phase.description && (
                    <Typography variant="body2" color="text.secondary">
                      {phase.description}
                    </Typography>
                  )}
                </Paper>
              )
            })}
          </Stack>
        </>
      ) : (
        // Fallback: show agents as the "phases"
        <>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Agents
          </Typography>

          <Stack spacing={2} sx={{ mb: 3 }}>
            {agents.map((agent, index) => (
              <Paper
                key={agent.id}
                variant="outlined"
                sx={{ p: 2, borderLeft: 4, borderLeftColor: agent.color }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {index + 1}. {agent.role}
                  </Typography>
                  <Chip
                    label={agent.name}
                    size="small"
                    sx={{ bgcolor: agent.color, color: 'white', height: 22, fontSize: '0.75rem' }}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {agent.description}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </>
      )}

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        BMad Studio
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This application visualizes your BMAD project as a story board, showing stories as they progress
        through the development lifecycle. Track your story status, filter by epic, and monitor progress
        across all phases.
      </Typography>

      <Link
        href="https://docs.bmad-method.org"
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          fontWeight: 500
        }}
      >
        Full BMAD Documentation
        <OpenInNewIcon fontSize="small" />
      </Link>
    </Box>
  )
}
