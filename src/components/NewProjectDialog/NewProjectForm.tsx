import { useState, useCallback, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Stack,
  TextField,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  ToggleButtonGroup,
  ToggleButton,
  ListItemText
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import GitHubIcon from '@mui/icons-material/GitHub'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import { useStore } from '../../store'

const ADDON_MODULES = [
  { id: 'bmb', label: 'BMad Builder', description: 'Create custom agents and workflows' },
  { id: 'cis', label: 'Creative Intelligence', description: 'Brainstorming and ideation agents' },
  { id: 'tea', label: 'Test Architect', description: 'Test strategy and automation' }
]

interface NewProjectFormProps {
  open: boolean
  onClose: () => void
}

export default function NewProjectForm({ open, onClose }: NewProjectFormProps) {
  const { startProjectWizard, projectPath } = useStore()
  // Preselect parent folder of the currently opened project
  const defaultParent = projectPath ? projectPath.replace(/\/[^/]+$/, '') : null
  const [parentPath, setParentPath] = useState<string | null>(defaultParent)
  const [projectName, setProjectName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [primaryType, setPrimaryType] = useState<'bmm' | 'gds' | 'tools'>('bmm')
  const [addonModules, setAddonModules] = useState<string[]>([])
  const [developerType, setDeveloperType] = useState<'ai' | 'human'>('ai')
  const [outputFolder, setOutputFolderLocal] = useState('_bmad-output')
  const [customModules, setCustomModules] = useState<{ code: string; name?: string; path: string; source?: 'local' | 'github'; repo?: string }[]>([])
  const [customModuleError, setCustomModuleError] = useState<string | null>(null)
  const [githubInput, setGithubInput] = useState('')
  const [githubLoading, setGithubLoading] = useState(false)
  const [githubStatus, setGithubStatus] = useState('')

  // When dialog opens, preselect parent of current project
  useEffect(() => {
    if (open && defaultParent) {
      setParentPath(defaultParent)
    }
  }, [open, defaultParent])

  const reset = useCallback(() => {
    setParentPath(defaultParent)
    setProjectName('')
    setError(null)
    setCreating(false)
    setPrimaryType('bmm')
    setAddonModules([])
    setDeveloperType('ai')
    setOutputFolderLocal('_bmad-output')
    setCustomModules([])
    setCustomModuleError(null)
    setGithubInput('')
    setGithubLoading(false)
    setGithubStatus('')
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const handlePickParent = useCallback(async () => {
    const result = await window.wizardAPI.selectDirectoryAny()
    if (result?.path) {
      setParentPath(result.path)
      setError(null)
    }
  }, [])

  const checkCodeConflict = useCallback((code: string) => {
    const reserved = primaryType === 'tools' ? ['core'] : [primaryType, 'core']
    const allCodes = [...addonModules, ...reserved, ...customModules.map(m => m.code)]
    return allCodes.includes(code)
  }, [primaryType, addonModules, customModules])

  // Remove custom modules that now conflict when primary type or addon selection changes
  useEffect(() => {
    const reserved = primaryType === 'tools' ? ['core'] : [primaryType, 'core']
    const builtinCodes = new Set([...addonModules, ...reserved])
    setCustomModules(prev => {
      const filtered = prev.filter(m => !builtinCodes.has(m.code))
      return filtered.length === prev.length ? prev : filtered
    })
  }, [primaryType, addonModules])

  const handleBrowseLocalModule = useCallback(async () => {
    setCustomModuleError(null)
    const result = await window.wizardAPI.selectDirectoryAny()
    if (!result?.path) return

    if (customModules.some(m => m.path === result.path)) {
      setCustomModuleError('This module directory is already added')
      return
    }

    const validation = await window.wizardAPI.validateCustomModule(result.path)
    if (!validation.valid) {
      setCustomModuleError(validation.error || 'Invalid custom module')
      return
    }

    if (checkCodeConflict(validation.code!)) {
      setCustomModuleError(`Module code "${validation.code}" conflicts with an existing module`)
      return
    }

    setCustomModules(prev => [...prev, { code: validation.code!, name: validation.name, path: result.path, source: 'local' }])
  }, [customModules, checkCodeConflict])

  const handleAddGithubModule = useCallback(async () => {
    const input = githubInput.trim()
    if (!input) return

    setCustomModuleError(null)
    setGithubLoading(true)
    setGithubStatus('Verifying module and cloning repository...')

    try {
      // Check for duplicate repo input
      if (customModules.some(m => m.repo === input || m.repo === input.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, ''))) {
        setCustomModuleError('This repository is already added')
        return
      }

      const validation = await window.wizardAPI.validateCustomModule(input)
      if (!validation.valid) {
        setCustomModuleError(validation.error || 'Invalid module')
        return
      }

      // Check for duplicate path (in case of different input formats pointing to same repo)
      if (customModules.some(m => m.path === validation.path)) {
        setCustomModuleError('This module is already added')
        return
      }

      if (checkCodeConflict(validation.code!)) {
        setCustomModuleError(`Module code "${validation.code}" conflicts with an existing module`)
        return
      }

      setCustomModules(prev => [...prev, {
        code: validation.code!,
        name: validation.name,
        path: validation.path!,
        source: validation.source,
        repo: validation.repo
      }])
      setGithubInput('')
    } finally {
      setGithubLoading(false)
      setGithubStatus('')
    }
  }, [githubInput, customModules, checkCodeConflict])

  const handleRemoveCustomModule = useCallback((path: string) => {
    setCustomModules(prev => prev.filter(m => m.path !== path))
    setCustomModuleError(null)
  }, [])

  const handleToggleAddon = useCallback((moduleId: string) => {
    setAddonModules(prev =>
      prev.includes(moduleId)
        ? prev.filter(m => m !== moduleId)
        : [...prev, moduleId]
    )
  }, [])

  const handleCreate = useCallback(async () => {
    if (!parentPath || !projectName.trim()) return

    const name = projectName.trim()
    if (/[/\\:]/.test(name) || name === '.' || name === '..') {
      setError('Invalid project name')
      return
    }

    setCreating(true)
    setError(null)

    const result = await window.wizardAPI.createProjectDirectory(parentPath, name)
    if (!result.success || !result.path) {
      setError(result.error || 'Failed to create project folder')
      setCreating(false)
      return
    }

    // Build final module list: primary type plus add-ons
    // For tools-only, modules are just the addons (no bmm/gds prefix)
    // Custom modules with known official codes go into modules list (not custom paths)
    const officialCodes = new Set(['bmm', 'gds', 'bmb', 'cis', 'tea'])
    const knownCustomModules = customModules.filter(m => officialCodes.has(m.code)).map(m => m.code)
    const trueCustomPaths = customModules.filter(m => !officialCodes.has(m.code)).map(m => m.path)

    const modules = primaryType === 'tools'
      ? [...addonModules, ...knownCustomModules]
      : [primaryType, ...addonModules, ...knownCustomModules]

    const customPaths = trueCustomPaths
    startProjectWizard(result.path, outputFolder, developerType, modules, customPaths.length ? customPaths : undefined)
    setCreating(false)
    reset()
    onClose()
  }, [parentPath, projectName, outputFolder, developerType, primaryType, addonModules, customModules, startProjectWizard, reset, onClose])

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      <DialogTitle>
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
            <AddIcon sx={{ color: 'white' }} />
          </Box>
          <Typography variant="h6" fontWeight={600}>
            New Project
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Location
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FolderOpenIcon />}
              onClick={handlePickParent}
              fullWidth
              sx={{ justifyContent: 'flex-start', textTransform: 'none', fontFamily: 'monospace', fontSize: '0.8rem' }}
            >
              {parentPath || 'Select parent folder...'}
            </Button>
          </Box>

          <TextField
            label="Project Name"
            size="small"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="my-awesome-project"
            fullWidth
            autoFocus
            disabled={!parentPath}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
            helperText={parentPath && projectName.trim()
              ? `Will create: ${parentPath}/${projectName.trim()}`
              : 'Choose a location first, then enter a name for your project'
            }
          />

          {/* Primary project type selector */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Project Type
            </Typography>
            <ToggleButtonGroup
              value={primaryType}
              exclusive
              onChange={(_, value) => { if (value) setPrimaryType(value) }}
              fullWidth
              size="small"
            >
              <ToggleButton value="bmm" sx={{ textTransform: 'none' }}>
                Agile
              </ToggleButton>
              <ToggleButton value="gds" sx={{ textTransform: 'none' }}>
                Game Dev
              </ToggleButton>
              <ToggleButton value="tools" sx={{ textTransform: 'none' }}>
                Tools Only
              </ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {primaryType === 'bmm'
                ? 'Full-stack software development with PRD, Architecture, and Epics'
                : primaryType === 'gds'
                  ? 'Game development with Game Brief, GDD, Game Architecture, and Epics'
                  : 'Install BMAD add-on modules only (no story board). Select at least one module below.'
              }
            </Typography>
          </Box>

          {/* Add-on modules */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Add-on Modules (Optional)
            </Typography>
            {ADDON_MODULES.map((mod) => (
              <FormControlLabel
                key={mod.id}
                control={
                  <Checkbox
                    size="small"
                    checked={addonModules.includes(mod.id)}
                    onChange={() => handleToggleAddon(mod.id)}
                  />
                }
                label={
                  <Typography variant="body2">
                    {mod.label} <Typography component="span" variant="caption" color="text.secondary">— {mod.description}</Typography>
                  </Typography>
                }
                sx={{ display: 'flex', ml: 0 }}
              />
            ))}
          </Box>

          {/* Custom modules */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Custom Modules
            </Typography>
            {customModules.map((mod) => (
              <Stack key={mod.path} direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Typography variant="body2" sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {mod.name || mod.code} <Typography component="span" variant="caption" color="text.secondary">
                    ({mod.code}) {mod.source === 'github' && mod.repo ? `— ${mod.repo}` : ''}
                  </Typography>
                </Typography>
                <IconButton size="small" onClick={() => handleRemoveCustomModule(mod.path)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: customModules.length ? 0.5 : 0 }}>
              <TextField
                size="small"
                placeholder="owner/repo or GitHub URL"
                value={githubInput}
                onChange={(e) => { setGithubInput(e.target.value); setCustomModuleError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddGithubModule() }}
                disabled={githubLoading}
                sx={{ flex: 1 }}
                InputProps={{
                  startAdornment: <GitHubIcon sx={{ mr: 1, fontSize: 18, color: 'text.secondary' }} />
                }}
              />
              <Button
                size="small"
                variant="outlined"
                onClick={handleAddGithubModule}
                disabled={!githubInput.trim() || githubLoading}
                sx={{ textTransform: 'none', minWidth: 'auto', px: 2 }}
              >
                {githubLoading ? <CircularProgress size={18} /> : 'Add'}
              </Button>
            </Stack>
            {githubStatus && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {githubStatus}
              </Typography>
            )}
            <Button
              size="small"
              startIcon={<FolderOpenIcon />}
              onClick={handleBrowseLocalModule}
              sx={{ textTransform: 'none', mt: 0.5 }}
            >
              Browse Local...
            </Button>
            {customModuleError && (
              <Alert severity="error" sx={{ py: 0, mt: 1 }}>
                {customModuleError}
              </Alert>
            )}
          </Box>

          {primaryType !== 'tools' && (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <FormControl size="small" fullWidth>
              <InputLabel>Development Mode</InputLabel>
              <Select
                value={developerType}
                label="Development Mode"
                onChange={(e) => setDeveloperType(e.target.value as 'ai' | 'human')}
                renderValue={(value) => value === 'ai' ? 'AI Driven Development (Prototyping)' : 'Manual Development (Production)'}
              >
                <MenuItem value="ai">
                  <ListItemText primary="AI Driven Development" secondary="Recommended for prototyping" />
                </MenuItem>
                <MenuItem value="human">
                  <ListItemText primary="Manual Development" secondary="Recommended for production" />
                </MenuItem>
              </Select>
            </FormControl>
            <Tooltip
              title={
                <Box sx={{ p: 0.5 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>AI Driven Development (Prototyping)</Typography>
                  <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                    AI agents autonomously implement stories, create branches, write code, run tests, and update story files. The full cycle and epic cycle automation workflows are available. Best for prototyping and rapid iteration where speed is prioritized.
                  </Typography>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Manual Development (Production)</Typography>
                  <Typography variant="caption" display="block">
                    You implement each story yourself using the story file as your spec. Workflows guide you through creating branches, writing code, and submitting for review. The code review workflow verifies your implementation against the spec and updates the story status. This mode modifies the installed BMAD workflows to support a human-driven development process. Best for production code where quality and control are prioritized.
                  </Typography>
                </Box>
              }
              arrow
              placement="right"
            >
              <InfoOutlinedIcon
                sx={{
                  fontSize: 18,
                  color: 'text.secondary',
                  cursor: 'help',
                  flexShrink: 0,
                  '&:hover': { color: 'primary.main' }
                }}
              />
            </Tooltip>
          </Stack>
          )}

          <TextField
            label="Output Folder"
            size="small"
            value={outputFolder}
            onChange={(e) => setOutputFolderLocal(e.target.value)}
            placeholder="_bmad-output"
            fullWidth
            helperText="Folder name for BMAD output files (default: _bmad-output)"
          />

          {error && (
            <Alert severity="error" sx={{ py: 0 }}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button variant="text" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={!parentPath || !projectName.trim() || creating || (primaryType === 'tools' && addonModules.length === 0 && customModules.length === 0)}
        >
          {creating ? 'Creating...' : 'Create & Start Wizard'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
