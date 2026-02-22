import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Stack,
  Alert,
  Link
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import { useStore } from '../../store'

export default function NewProjectDialog() {
  const {
    newProjectDialogOpen,
    pendingNewProject,
    setNewProjectDialogOpen,
    setPendingNewProject,
    startProjectWizard
  } = useStore()

  const handleClose = () => {
    setNewProjectDialogOpen(false)
    setPendingNewProject(null)
  }

  const handleStartWizard = () => {
    if (!pendingNewProject) return
    setNewProjectDialogOpen(false)
    startProjectWizard(pendingNewProject.path, pendingNewProject.outputFolder)
    setPendingNewProject(null)
  }

  const projectName = pendingNewProject?.path.split('/').pop() || 'Unknown'
  const projectTypeName = pendingNewProject?.projectType === 'gds' ? 'Game Dev Studio' : 'BMAD Method'

  return (
    <Dialog
      open={newProjectDialogOpen}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2
        }
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1.5,
              bgcolor: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <FolderOpenIcon sx={{ color: 'white' }} />
          </Box>
          <Typography variant="h6" fontWeight={600}>
            New BMAD Project Detected
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2.5}>
          <Alert severity="info" sx={{ mt: 1 }}>
            <Typography variant="body2">
              <strong>{projectName}</strong> appears to be a new {projectTypeName} project
              that hasn't been initialized yet.
            </Typography>
          </Alert>

          <Typography variant="body2" color="text.secondary">
            The Project Wizard will guide you through setting up your BMAD project step by step.
            It will install the BMAD method, then walk you through creating a PRD, architecture,
            and epics using AI agents. Uses standard (BMM) development. For game dev or add-on
            modules, use File &gt; New Project.
          </Typography>

          <Typography variant="caption" color="text.secondary">
            Learn more about{' '}
            <Link
              href="http://docs.bmad-method.org/"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}
            >
              BMAD project structure
              <OpenInNewIcon sx={{ fontSize: 12 }} />
            </Link>
          </Typography>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button
          variant="text"
          onClick={handleClose}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={<RocketLaunchIcon />}
          onClick={handleStartWizard}
        >
          Start Project Wizard
        </Button>
      </DialogActions>
    </Dialog>
  )
}
