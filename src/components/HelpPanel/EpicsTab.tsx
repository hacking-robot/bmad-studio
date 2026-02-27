import { useState } from 'react'
import { Box, Typography, Paper, Stack, LinearProgress, Chip, Accordion, AccordionSummary, AccordionDetails } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CodeIcon from '@mui/icons-material/Code'
import DescriptionIcon from '@mui/icons-material/Description'
import { useStore } from '../../store'
import { EPIC_COLORS, STATUS_COLUMNS } from '../../types'
import { usePlanningArtifacts, getArtifactTypeColor, PlanningArtifact } from '../../hooks/usePlanningArtifacts'
import ArtifactViewer from './ArtifactViewer'

export default function EpicsTab() {
  const epics = useStore((state) => state.epics)
  const stories = useStore((state) => state.stories)
  const { artifacts } = usePlanningArtifacts()
  const [selectedArtifact, setSelectedArtifact] = useState<PlanningArtifact | null>(null)

  // Calculate progress for each epic
  const getEpicProgress = (epicId: number) => {
    const epic = epics.find((e) => e.id === epicId)
    if (!epic || epic.stories.length === 0) return 0
    const doneCount = epic.stories.filter((s) => s.status === 'done').length
    return (doneCount / epic.stories.length) * 100
  }

  // Get story counts by status for an epic
  const getStoryCountsByStatus = (epicId: number) => {
    const epic = epics.find((e) => e.id === epicId)
    if (!epic) return {}
    const counts: Record<string, number> = {}
    epic.stories.forEach((s) => {
      counts[s.status] = (counts[s.status] || 0) + 1
    })
    return counts
  }

  // Get stories with technical notes for an epic
  const getStoriesWithTechNotes = (epicId: number) => {
    return stories.filter(s => s.epicId === epicId && s.technicalNotes)
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Overview of all epics in your project, including goals, progress, and technical context.
      </Typography>

      {/* Planning Artifacts Section */}
      {artifacts.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <DescriptionIcon sx={{ fontSize: 18 }} />
            Planning Documents ({artifacts.length})
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {artifacts.map((artifact) => (
              <Chip
                key={artifact.path}
                icon={<DescriptionIcon sx={{ fontSize: '14px !important' }} />}
                label={artifact.displayName}
                size="small"
                onClick={() => setSelectedArtifact(artifact)}
                sx={{
                  bgcolor: 'action.hover',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.selected' },
                  '& .MuiChip-icon': { color: getArtifactTypeColor(artifact.type) }
                }}
              />
            ))}
          </Box>
        </Paper>
      )}

      {/* Overall Progress */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
          Overall Progress
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <LinearProgress
            variant="determinate"
            value={stories.length > 0 ? (stories.filter(s => s.status === 'done').length / stories.length) * 100 : 0}
            sx={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              bgcolor: 'action.hover',
              '& .MuiLinearProgress-bar': {
                bgcolor: 'success.main',
                borderRadius: 4
              }
            }}
          />
          <Typography variant="body2" fontWeight={500}>
            {stories.filter(s => s.status === 'done').length}/{stories.length} stories
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {STATUS_COLUMNS.map(({ status, label, color }) => {
            const count = stories.filter(s => s.status === status).length
            if (count === 0) return null
            return (
              <Chip
                key={status}
                label={`${label}: ${count}`}
                size="small"
                sx={{ bgcolor: color, color: 'white', fontWeight: 500 }}
              />
            )
          })}
        </Box>
      </Paper>

      {/* Epics List */}
      <Stack spacing={2}>
        {epics.map((epic) => {
          const progress = getEpicProgress(epic.id)
          const color = EPIC_COLORS[(epic.id - 1) % EPIC_COLORS.length]
          const counts = getStoryCountsByStatus(epic.id)
          const storiesWithTechNotes = getStoriesWithTechNotes(epic.id)
          const doneCount = epic.stories.filter(s => s.status === 'done').length

          return (
            <Paper
              key={epic.id}
              variant="outlined"
              sx={{
                overflow: 'hidden',
                borderLeft: 4,
                borderLeftColor: color
              }}
            >
              {/* Epic Header */}
              <Box sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <Chip
                    label={`Epic ${epic.id}`}
                    size="small"
                    sx={{ bgcolor: color, color: 'white', fontWeight: 600 }}
                  />
                  <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
                    {epic.name}
                  </Typography>
                  {progress === 100 && (
                    <CheckCircleIcon color="success" sx={{ fontSize: 20 }} />
                  )}
                </Box>

                {/* Progress Bar */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{
                      flex: 1,
                      height: 6,
                      borderRadius: 3,
                      bgcolor: 'action.hover',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: color,
                        borderRadius: 3
                      }
                    }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50 }}>
                    {doneCount}/{epic.stories.length}
                  </Typography>
                </Box>

                {/* Status Counts */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {STATUS_COLUMNS.map(({ status, label, color: statusColor }) => {
                    const count = counts[status] || 0
                    if (count === 0) return null
                    return (
                      <Chip
                        key={status}
                        label={`${label}: ${count}`}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.7rem',
                          bgcolor: statusColor,
                          color: 'white'
                        }}
                      />
                    )
                  })}
                </Box>
              </Box>

              {/* Goal Section */}
              {epic.goal && (
                <Accordion elevation={0} disableGutters>
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{ px: 2, bgcolor: 'action.hover', minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}
                  >
                    <Typography variant="caption" fontWeight={600}>Goal</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 2, py: 1.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {epic.goal}
                    </Typography>
                  </AccordionDetails>
                </Accordion>
              )}

              {/* Technical Notes Section */}
              {storiesWithTechNotes.length > 0 && (
                <Accordion elevation={0} disableGutters>
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{ px: 2, bgcolor: 'action.hover', minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CodeIcon sx={{ fontSize: 14, color: 'info.main' }} />
                      <Typography variant="caption" fontWeight={600}>
                        Technical Notes ({storiesWithTechNotes.length} stories)
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 2, py: 1.5 }}>
                    <Stack spacing={1.5}>
                      {storiesWithTechNotes.map((story) => (
                        <Box key={story.id}>
                          <Typography variant="caption" fontWeight={600} color="text.primary">
                            {story.epicId}.{story.storyNumber}: {story.title}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            component="div"
                            sx={{
                              mt: 0.5,
                              whiteSpace: 'pre-wrap',
                              maxHeight: 100,
                              overflow: 'auto'
                            }}
                          >
                            {story.technicalNotes}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              )}
            </Paper>
          )
        })}
      </Stack>

      {epics.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No epics found. Open a BMAD project to see epics.
        </Typography>
      )}

      {/* Artifact Viewer Dialog */}
      <ArtifactViewer
        artifact={selectedArtifact}
        onClose={() => setSelectedArtifact(null)}
      />
    </Box>
  )
}
