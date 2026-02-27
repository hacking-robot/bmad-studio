import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert
} from '@mui/material'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { useStore } from '../store'

export default function IncompatibleVersionDialog() {
  const bmadVersionError = useStore((state) => state.bmadVersionError)
  const setProjectPath = useStore((state) => state.setProjectPath)
  const setProjectType = useStore((state) => state.setProjectType)
  const setBmadScanResult = useStore((state) => state.setBmadScanResult)
  const setScannedWorkflowConfig = useStore((state) => state.setScannedWorkflowConfig)

  const handleClose = () => {
    setBmadScanResult(null)
    setScannedWorkflowConfig(null)
    setProjectType(null)
    setProjectPath(null)
  }

  return (
    <Dialog
      open={!!bmadVersionError}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ErrorOutlineIcon color="error" />
        Incompatible BMAD Version
      </DialogTitle>
      <DialogContent>
        <Alert severity="error" sx={{ mb: 2 }}>
          {bmadVersionError}
        </Alert>
        <Typography variant="body2" color="text.secondary">
          Please upgrade the BMAD installation in this project to v6.0.0 or later, then try opening it again.
          You can upgrade by running the BMAD install command in your project directory.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} variant="contained">
          Close Project
        </Button>
      </DialogActions>
    </Dialog>
  )
}
