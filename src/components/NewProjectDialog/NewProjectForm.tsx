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
  ToggleButton
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import AddIcon from '@mui/icons-material/Add'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Tooltip from '@mui/material/Tooltip'
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
  const [primaryType, setPrimaryType] = useState<'bmm' | 'gds'>('bmm')
  const [addonModules, setAddonModules] = useState<string[]>([])
  const [developerType, setDeveloperType] = useState<'ai' | 'human'>('ai')
  const [outputFolder, setOutputFolderLocal] = useState('_bmad-output')

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

    // Build final module list: primary type plus add-ons (GDS doesn't need BMM explicitly)
    const modules = [primaryType, ...addonModules]

    startProjectWizard(result.path, outputFolder, developerType, modules)
    setCreating(false)
    reset()
    onClose()
  }, [parentPath, projectName, outputFolder, developerType, primaryType, addonModules, startProjectWizard, reset, onClose])

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
                Standard Development
              </ToggleButton>
              <ToggleButton value="gds" sx={{ textTransform: 'none' }}>
                Game Development
              </ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {primaryType === 'bmm'
                ? 'Full-stack software development with PRD, Architecture, and Epics'
                : 'Game development with Game Brief, GDD, Game Architecture, and Epics'
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

          <Stack direction="row" alignItems="center" spacing={0.5}>
            <FormControl size="small" fullWidth>
              <InputLabel>Development Mode</InputLabel>
              <Select
                value={developerType}
                label="Development Mode"
                onChange={(e) => setDeveloperType(e.target.value as 'ai' | 'human')}
              >
                <MenuItem value="ai">AI Driven Development</MenuItem>
                <MenuItem value="human">Manual Development</MenuItem>
              </Select>
            </FormControl>
            <Tooltip
              title={
                <Box sx={{ p: 0.5 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>AI Driven Development</Typography>
                  <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                    AI agents implement stories, run tests, and maintain the story file automatically. Best when using AI coding assistants as your primary development workflow.
                  </Typography>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Manual Development</Typography>
                  <Typography variant="caption" display="block">
                    You write the code yourself using the story file as a spec. The code review workflow verifies your work against the spec and updates the story file for you.
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
          disabled={!parentPath || !projectName.trim() || creating}
        >
          {creating ? 'Creating...' : 'Create & Start Wizard'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
