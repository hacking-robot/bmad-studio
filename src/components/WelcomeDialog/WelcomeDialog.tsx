import { useState } from 'react'
import {
  Box,
  Button,
  Typography,
  Paper,
  Stack,
  Collapse,
  Link,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  Chip
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import AddIcon from '@mui/icons-material/Add'
import CloudIcon from '@mui/icons-material/Cloud'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import CloseIcon from '@mui/icons-material/Close'
import { useProjectData } from '../../hooks/useProjectData'
import { useStore } from '../../store'
import logoDark from '../../assets/logo-dark.svg'
import logoLight from '../../assets/logo-light.svg'
import { NewProjectForm } from '../NewProjectDialog'
import { OpenRemoteDialog } from '../RemoteBranchViewer'

export default function WelcomeDialog() {
  const { selectProject, switchToProject } = useProjectData()
  const error = useStore((state) => state.error)
  const themeMode = useStore((state) => state.themeMode)
  const recentProjects = useStore((state) => state.recentProjects)
  const removeRecentProject = useStore((state) => state.removeRecentProject)
  const [showInfo, setShowInfo] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)

  const handleSelectProject = async () => {
    await selectProject()
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        p: 3,
        position: 'relative'
      }}
    >
      {/* Drag region at top for window movement */}
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, WebkitAppRegion: 'drag' }} />
      <Paper
        elevation={0}
        sx={{
          p: 6,
          maxWidth: 640,
          width: '100%',
          textAlign: 'center',
          border: 1,
          borderColor: 'divider'
        }}
      >
        <Stack spacing={3} alignItems="center">
          <Box
            component="img"
            src={themeMode === 'dark' ? logoDark : logoLight}
            alt="BMad Studio"
            sx={{
              width: 80,
              height: 80,
              borderRadius: 3
            }}
          />

          <Box>
            <Typography variant="h4" fontWeight={700} gutterBottom>
              BMad Studio
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Select a project folder to get started.
            </Typography>
          </Box>

          {error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}

          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<FolderOpenIcon />}
              onClick={handleSelectProject}
            >
              Open Project
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<CloudIcon />}
              onClick={() => setRemoteDialogOpen(true)}
            >
              Open Remote
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<AddIcon />}
              onClick={() => setNewProjectOpen(true)}
            >
              New Project
            </Button>
          </Stack>

          {recentProjects.length > 0 && (
            <>
              <Divider sx={{ width: '100%', my: 0 }} />
              <Box sx={{ width: '100%', textAlign: 'left' }}>
                <Typography variant="caption" color="text.secondary" sx={{ px: 1, mb: 0.5, display: 'block' }}>
                  Recent Projects
                </Typography>
                <List dense disablePadding sx={{ maxHeight: 200, overflow: 'auto' }}>
                  {recentProjects.map((project) => (
                    <ListItemButton
                      key={project.path}
                      onClick={() => switchToProject(project)}
                      onMouseEnter={() => setHoveredItem(project.path)}
                      onMouseLeave={() => setHoveredItem(null)}
                      sx={{ borderRadius: 1, py: 0.5 }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {project.isRemote && <CloudIcon sx={{ fontSize: 14, color: 'primary.main' }} />}
                            {project.name}
                            {project.isRemote && (
                              <Chip label="Remote" size="small" variant="outlined" color="info" sx={{ height: 18, fontSize: '0.6rem', ml: 0.5 }} />
                            )}
                          </Box>
                        }
                        secondary={project.isRemote ? project.remoteUrl : project.path}
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                        secondaryTypographyProps={{
                          variant: 'caption',
                          noWrap: true,
                          sx: { overflow: 'hidden', textOverflow: 'ellipsis' }
                        }}
                      />
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeRecentProject(project.path)
                        }}
                        sx={{
                          opacity: hoveredItem === project.path ? 1 : 0,
                          transition: 'opacity 0.2s',
                          ml: 1,
                          '&:hover': {
                            bgcolor: 'error.main',
                            color: 'error.contrastText'
                          }
                        }}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            </>
          )}

          <NewProjectForm open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
          <OpenRemoteDialog open={remoteDialogOpen} onClose={() => setRemoteDialogOpen(false)} />

          <Divider sx={{ width: '100%', my: 1 }} />

          {/* What is BMAD section */}
          <Box sx={{ width: '100%' }}>
            <Button
              onClick={() => setShowInfo(!showInfo)}
              endIcon={showInfo ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{
                textTransform: 'none',
                color: 'text.secondary',
                '&:hover': {
                  bgcolor: 'action.hover'
                }
              }}
            >
              What is BMAD?
            </Button>

            <Collapse in={showInfo}>
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  textAlign: 'left'
                }}
              >
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  <strong>BMAD</strong> (Breakthrough Method of Agile AI-Driven Development) is an AI-powered
                  framework that uses specialized agents to guide you through software development.
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Each agent has a specific role: <strong>Analyst</strong> (Mary) handles research,{' '}
                  <strong>PM</strong> (John) creates requirements, <strong>Architect</strong> (Winston)
                  designs systems, <strong>SM</strong> (Bob) manages stories, and <strong>DEV</strong> (Amelia)
                  implements features.
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  BMad Studio visualizes your project's progress as stories move through the development
                  lifecycle—from backlog to done.
                </Typography>
                <Link
                  href="https://docs.bmad-method.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: '0.875rem'
                  }}
                >
                  Learn more about BMAD
                  <OpenInNewIcon sx={{ fontSize: 16 }} />
                </Link>
              </Box>
            </Collapse>
          </Box>
        </Stack>
      </Paper>
    </Box>
  )
}
