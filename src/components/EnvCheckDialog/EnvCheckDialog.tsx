import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import ErrorIcon from '@mui/icons-material/Error'
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { useStore } from '../../store'
import type { EnvCheckItem } from '../../../electron/preload'

const REQUIRED_IDS = ['claude', 'git']
const OPTIONAL_IDS = ['context7', 'web-search', 'web-reader', 'ts-lsp']

const INSTALL_COMMANDS: Record<string, { brew: string; alt?: string }> = {
  claude: { brew: 'brew install --cask claude-code', alt: 'npm install -g @anthropic-ai/claude-code' },
  git: { brew: 'brew install git' },
  node: { brew: 'brew install node' }
}

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

function InstallHint({ id }: { id: string }) {
  const cmds = INSTALL_COMMANDS[id]
  if (!cmds) return null

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <Box sx={{ mt: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography
          component="code"
          sx={{ fontSize: 11, bgcolor: 'action.hover', px: 0.75, py: 0.25, borderRadius: 0.5, fontFamily: 'monospace' }}
        >
          {cmds.brew}
        </Typography>
        <Tooltip title="Copy">
          <IconButton size="small" onClick={() => copyToClipboard(cmds.brew)} sx={{ p: 0.25 }}>
            <ContentCopyIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Tooltip>
      </Box>
      {cmds.alt && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          <Typography variant="caption" color="text.secondary">or</Typography>
          <Typography
            component="code"
            sx={{ fontSize: 11, bgcolor: 'action.hover', px: 0.75, py: 0.25, borderRadius: 0.5, fontFamily: 'monospace' }}
          >
            {cmds.alt}
          </Typography>
          <Tooltip title="Copy">
            <IconButton size="small" onClick={() => copyToClipboard(cmds.alt!)} sx={{ p: 0.25 }}>
              <ContentCopyIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  )
}

function ItemList({ items }: { items: EnvCheckItem[] }) {
  return (
    <List dense disablePadding>
      {items.map((item) => (
        <ListItem key={item.id} sx={{ px: 0, alignItems: 'flex-start' }}>
          <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
            <StatusIcon status={item.status} />
          </ListItemIcon>
          <ListItemText
            primary={item.label}
            secondary={
              <>
                {item.version ? `v${item.version}` : item.detail}
                {(item.status === 'error' || item.status === 'warning') && (
                  <InstallHint id={item.id} />
                )}
              </>
            }
            primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
            secondaryTypographyProps={{ variant: 'caption', component: 'div' }}
          />
        </ListItem>
      ))}
    </List>
  )
}

export default function EnvCheckDialog() {
  const open = useStore((state) => state.envCheckDialogOpen)
  const results = useStore((state) => state.envCheckResults)
  const loading = useStore((state) => state.envCheckLoading)
  const setOpen = useStore((state) => state.setEnvCheckDialogOpen)
  const setProjectPath = useStore((state) => state.setProjectPath)
  const setProjectType = useStore((state) => state.setProjectType)

  const items = results || []
  const requiredItems = items.filter((i) => !OPTIONAL_IDS.includes(i.id))
  const optionalItems = items.filter((i) => OPTIONAL_IDS.includes(i.id))
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
        Prerequisites
      </DialogTitle>
      <DialogContent>
        {loading && items.length === 0 ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3, justifyContent: 'center' }}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">
              Checking prerequisites...
            </Typography>
          </Box>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
              Required
            </Typography>
            <ItemList items={requiredItems} />
            {optionalItems.length > 0 && (
              <>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mt: 2, mb: 0.5, display: 'block' }}>
                  Optional (Claude Code plugins)
                </Typography>
                <ItemList items={optionalItems} />
              </>
            )}
          </>
        )}
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
        <Button onClick={handleClose} variant={hasRequiredMissing ? 'contained' : 'text'} disabled={loading}>
          {hasRequiredMissing ? 'Close Project' : 'Close'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
