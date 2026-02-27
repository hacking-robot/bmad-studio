import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import ErrorIcon from '@mui/icons-material/Error'
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest'
import { useStore } from '../../store'
import type { EnvCheckItem } from '../../../electron/preload'

const REQUIRED_IDS = ['claude', 'git']

function StatusIcon({ status }: { status: EnvCheckItem['status'] }) {
  switch (status) {
    case 'checking':
      return <CircularProgress size={20} />
    case 'ok':
      return <CheckCircleIcon sx={{ color: 'success.main' }} />
    case 'warning':
      return <WarningIcon sx={{ color: 'warning.main' }} />
    case 'error':
      return <ErrorIcon sx={{ color: 'error.main' }} />
  }
}

export default function EnvCheckDialog() {
  const open = useStore((state) => state.envCheckDialogOpen)
  const results = useStore((state) => state.envCheckResults)
  const setOpen = useStore((state) => state.setEnvCheckDialogOpen)
  const setProjectPath = useStore((state) => state.setProjectPath)
  const setProjectType = useStore((state) => state.setProjectType)

  const items = results || []
  const hasRequiredMissing = items.some((i) => REQUIRED_IDS.includes(i.id) && i.status === 'error')
  const hasWarnings = items.some((i) => i.status === 'warning')
  const hasErrors = items.some((i) => i.status === 'error')
  const issueCount = items.filter((i) => i.status === 'warning' || i.status === 'error').length

  const handleClose = () => {
    if (hasRequiredMissing) {
      // Critical requirement missing — close the project
      setProjectType(null)
      setProjectPath(null)
    }
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onClose={hasRequiredMissing ? undefined : handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SettingsSuggestIcon color="primary" />
        Environment Check
      </DialogTitle>
      <DialogContent>
        <List dense disablePadding>
          {items.map((item) => (
            <ListItem key={item.id} sx={{ px: 0 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <StatusIcon status={item.status} />
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                secondary={item.version ? `v${item.version}` : item.detail}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </ListItem>
          ))}
        </List>
        {hasRequiredMissing && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Claude CLI and Git are required. Install them and reopen the project.
          </Alert>
        )}
        {!hasRequiredMissing && (hasErrors || hasWarnings) && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {issueCount} optional {issueCount === 1 ? 'item needs' : 'items need'} attention
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} variant={hasRequiredMissing ? 'contained' : 'text'}>
          {hasRequiredMissing ? 'Close Project' : 'Close'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
