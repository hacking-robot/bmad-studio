import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  IconButton,
  Box,
  Typography,
  CircularProgress,
  InputAdornment,
  Checkbox,
  FormControlLabel,
  Alert
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CloudIcon from '@mui/icons-material/Cloud'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { useStore } from '../../store'
import { useProjectData } from '../../hooks/useProjectData'

interface OpenRemoteDialogProps {
  open: boolean
  onClose: () => void
}

/** Normalize GitHub URL input — supports `owner/repo` shorthand */
function normalizeGitUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('git@')) {
    return trimmed.endsWith('.git') ? trimmed : `${trimmed}.git`
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    return `https://github.com/${trimmed}.git`
  }
  return trimmed
}

/** Extract a readable project name from a git URL */
function repoNameFromUrl(url: string): string {
  const match = url.match(/\/([^/]+?)(?:\.git)?$/)
  return match ? match[1] : 'remote-project'
}

export default function OpenRemoteDialog({ open, onClose }: OpenRemoteDialogProps) {
  const [urlInput, setUrlInput] = useState('')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [saveToken, setSaveToken] = useState(true)
  const [cloning, setCloning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)

  const setHasGitHubToken = useStore((s) => s.setHasGitHubToken)
  const addRecentProject = useStore((s) => s.addRecentProject)
  const { switchToProject } = useProjectData()

  // Load saved token on open
  useEffect(() => {
    if (!open) return
    window.tokenAPI.loadToken().then((result) => {
      if (result.token) {
        setToken(result.token)
        setHasGitHubToken(true)
      }
    })
  }, [open, setHasGitHubToken])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setUrlInput('')
      setCloning(false)
      setError(null)
      setTokenError(null)
      setShowToken(false)
    }
  }, [open])

  const normalizedUrl = normalizeGitUrl(urlInput)

  const handleOpen = async () => {
    if (!normalizedUrl) return

    setCloning(true)
    setError(null)
    setTokenError(null)

    try {
      // Save token if requested
      if (token && saveToken) {
        await window.tokenAPI.saveToken(token)
        setHasGitHubToken(true)
      }

      // Init repo + fetch refs (no checkout — files read on demand via git show)
      const repoName = repoNameFromUrl(normalizedUrl)
      const cachePath = `${repoName}-${Date.now()}`

      const result = await window.gitAPI.cloneRemote(normalizedUrl, cachePath)
      if (!result.success || !result.path) {
        const err = result.error || 'Failed to fetch repository'
        if (err.includes('Authentication') || err.includes('403') || err.includes('401') || err.includes('could not read Username')) {
          setTokenError('Authentication failed. Add a token for private repos.')
        } else {
          setError(err)
        }
        return
      }

      // Add to recent projects
      const recentProject = {
        path: result.path,
        projectType: 'bmm' as const,
        name: repoName,
        isRemote: true,
        remoteUrl: normalizedUrl,
        remoteCachePath: result.path
      }
      addRecentProject(recentProject)

      // Switch to the project — the effect in useProjectDataEffects will
      // auto-detect the default branch and set remoteViewingBranch
      switchToProject(recentProject)
      onClose()
    } catch {
      setError('Failed to clone repository')
    } finally {
      setCloning(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CloudIcon sx={{ color: 'primary.main' }} />
          Open Remote Project
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Clone a GitHub repository and view its BMAD board in read-only mode. Use the cloud icon in the status bar to switch branches after opening.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="GitHub Repository"
            placeholder="owner/repo or https://github.com/owner/repo"
            size="small"
            fullWidth
            autoFocus
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value)
              setError(null)
              setTokenError(null)
            }}
            helperText="Supports owner/repo shorthand"
          />

          <TextField
            label="GitHub Token (optional)"
            placeholder="github_pat_... or ghp_..."
            size="small"
            fullWidth
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(e) => {
              setToken(e.target.value)
              setTokenError(null)
            }}
            error={!!tokenError}
            helperText={tokenError || 'Required for private repos. Create a fine-grained token at GitHub → Settings → Developer settings → Fine-grained tokens with Contents: Read-only'}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowToken(!showToken)}
                      edge="end"
                    >
                      {showToken ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                )
              }
            }}
          />

          {token && (
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={saveToken}
                  onChange={(e) => setSaveToken(e.target.checked)}
                />
              }
              label={<Typography variant="body2">Save token for future use</Typography>}
              sx={{ mt: -1 }}
            />
          )}

          {error && (
            <Alert severity="error" sx={{ py: 0 }}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleOpen}
          disabled={!urlInput.trim() || cloning}
          startIcon={cloning ? <CircularProgress size={16} color="inherit" /> : <CloudIcon />}
        >
          {cloning ? 'Cloning...' : 'Open'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
