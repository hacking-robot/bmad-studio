import { useState, useEffect, useRef } from 'react'
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Radio,
  RadioGroup,
  FormControlLabel,
  Chip,
  Switch,
  Slider,
  CircularProgress,
  TextField,
  Autocomplete
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import SyncIcon from '@mui/icons-material/Sync'
import KeyboardIcon from '@mui/icons-material/Keyboard'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import NotificationsIcon from '@mui/icons-material/Notifications'
import BuildIcon from '@mui/icons-material/Build'
import RateReviewIcon from '@mui/icons-material/RateReview'
import ChatIcon from '@mui/icons-material/Chat'
import PersonIcon from '@mui/icons-material/Person'
import GitIcon from '@mui/icons-material/AccountTree'
import MergeIcon from '@mui/icons-material/Merge'
import RepeatIcon from '@mui/icons-material/Repeat'
import CloseIcon from '@mui/icons-material/Close'
import RefreshIcon from '@mui/icons-material/Refresh'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows'
import SystemUpdateIcon from '@mui/icons-material/SystemUpdate'
import DownloadIcon from '@mui/icons-material/Download'
import InstallDesktopIcon from '@mui/icons-material/InstallDesktop'
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest'
import PaletteIcon from '@mui/icons-material/Palette'
import { useStore } from '../../store'
import { useProjectData } from '../../hooks/useProjectData'
import { AI_TOOLS, AITool, CLIDetectionResult, CLAUDE_MODELS, CustomEndpointConfig } from '../../types'
import { themeList, base24Schemes } from '../../data/themes'

interface SettingsMenuProps {
  compact?: boolean
}

export default function SettingsMenu({ compact = false }: SettingsMenuProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [toolDialogOpen, setToolDialogOpen] = useState(false)
  const [chatSettingsDialogOpen, setChatSettingsDialogOpen] = useState(false)
  const profileDialogOpen = useStore((state) => state.profileDialogOpen)
  const setProfileDialogOpen = useStore((state) => state.setProfileDialogOpen)
  const setHasConfiguredProfile = useStore((state) => state.setHasConfiguredProfile)
  const [themePickerDialogOpen, setThemePickerDialogOpen] = useState(false)
  const [themeSearchQuery, setThemeSearchQuery] = useState('')
  const themeBeforePreview = useRef<{ slug: string } | null>(null)
  const [branchDialogOpen, setBranchDialogOpen] = useState(false)
  const [cliStatus, setCliStatus] = useState<Record<string, CLIDetectionResult>>({})
  const [detectingCli, setDetectingCli] = useState(false)
  const [availableBranches, setAvailableBranches] = useState<string[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const open = Boolean(anchorEl)

  // Auto-update state (from global store, listener in App.tsx)
  const [appVersion, setAppVersion] = useState<string>('')
  const updateStatus = useStore((state) => state.updateStatus)
  const setUpdateStatus = useStore((state) => state.setUpdateStatus)
  const updateVersion = useStore((state) => state.updateVersion)
  const downloadPercent = useStore((state) => state.updateDownloadPercent)

  const aiTool = useStore((state) => state.aiTool)
  const setAITool = useStore((state) => state.setAITool)
  const claudeModel = useStore((state) => state.claudeModel)
  const setClaudeModel = useStore((state) => state.setClaudeModel)
  const customEndpoint = useStore((state) => state.customEndpoint)
  const setCustomEndpoint = useStore((state) => state.setCustomEndpoint)

  // Local state for custom endpoint form
  const [customEndpointForm, setCustomEndpointForm] = useState<CustomEndpointConfig>({
    name: '',
    baseUrl: '',
    apiKey: '',
    modelName: ''
  })
  const notificationsEnabled = useStore((state) => state.notificationsEnabled)
  const setNotificationsEnabled = useStore((state) => state.setNotificationsEnabled)
  const verboseMode = useStore((state) => state.verboseMode)
  const setVerboseMode = useStore((state) => state.setVerboseMode)
  const enableHumanReviewColumn = useStore((state) => state.enableHumanReviewColumn)
  const setEnableHumanReviewColumn = useStore((state) => state.setEnableHumanReviewColumn)
  const maxThreadMessages = useStore((state) => state.maxThreadMessages)
  const setMaxThreadMessages = useStore((state) => state.setMaxThreadMessages)
  const bmadUserName = useStore((state) => state.bmadUserName)
  const setBmadUserName = useStore((state) => state.setBmadUserName)
  const bmadLanguage = useStore((state) => state.bmadLanguage)
  const setBmadLanguage = useStore((state) => state.setBmadLanguage)
  const baseBranch = useStore((state) => state.baseBranch)
  const setBaseBranch = useStore((state) => state.setBaseBranch)
  const allowDirectEpicMerge = useStore((state) => state.allowDirectEpicMerge)
  const setAllowDirectEpicMerge = useStore((state) => state.setAllowDirectEpicMerge)
  const enableEpicBranches = useStore((state) => state.enableEpicBranches)
  const setEnableEpicBranches = useStore((state) => state.setEnableEpicBranches)
  const disableGitBranching = useStore((state) => state.disableGitBranching)
  const setDisableGitBranching = useStore((state) => state.setDisableGitBranching)
  const disableEnvCheck = useStore((state) => state.disableEnvCheck)
  const setDisableEnvCheck = useStore((state) => state.setDisableEnvCheck)
  const fullCycleReviewCount = useStore((state) => state.fullCycleReviewCount)
  const setFullCycleReviewCount = useStore((state) => state.setFullCycleReviewCount)
  const projectPath = useStore((state) => state.projectPath)

  const colorTheme = useStore((state) => state.colorTheme)
  const setColorTheme = useStore((state) => state.setColorTheme)
  const viewMode = useStore((state) => state.viewMode)

  const { loadProjectData } = useProjectData()

  // In non-board mode, auto-enable disableGitBranching
  useEffect(() => {
    if (viewMode !== 'board' && !disableGitBranching) {
      setDisableGitBranching(true)
    }
  }, [viewMode])

  const selectedTool = AI_TOOLS.find((t) => t.id === aiTool) || AI_TOOLS[0]

  // Fetch app version
  useEffect(() => {
    window.updaterAPI.getAppVersion().then(setAppVersion)
  }, [])

  // Detect CLI tools when dialog opens
  useEffect(() => {
    if (toolDialogOpen && Object.keys(cliStatus).length === 0) {
      detectCliTools()
    }
  }, [toolDialogOpen])

  // Sync custom endpoint form with stored config when dialog opens
  useEffect(() => {
    if (toolDialogOpen && customEndpoint) {
      setCustomEndpointForm(customEndpoint)
    }
  }, [toolDialogOpen, customEndpoint])

  // Load branches when branch dialog opens
  useEffect(() => {
    if (branchDialogOpen && projectPath) {
      loadBranches()
    }
  }, [branchDialogOpen, projectPath])

  const loadBranches = async () => {
    if (!projectPath) return
    setLoadingBranches(true)
    try {
      const result = await window.gitAPI.listBranches(projectPath)
      if (result.branches) {
        setAvailableBranches(result.branches)
      }
    } catch (error) {
      console.error('Failed to load branches:', error)
    } finally {
      setLoadingBranches(false)
    }
  }

  const detectCliTools = async () => {
    setDetectingCli(true)
    try {
      const results = await window.cliAPI.detectAllTools()
      setCliStatus(results)
    } catch (error) {
      console.error('Failed to detect CLI tools:', error)
    } finally {
      setDetectingCli(false)
    }
  }

  const refreshCliDetection = async () => {
    setDetectingCli(true)
    try {
      await window.cliAPI.clearCache()
      const results = await window.cliAPI.detectAllTools()
      setCliStatus(results)
    } catch (error) {
      console.error('Failed to refresh CLI detection:', error)
    } finally {
      setDetectingCli(false)
    }
  }

  const handleChatSettingsClick = () => {
    handleClose()
    setChatSettingsDialogOpen(true)
  }

  const handleProfileClick = () => {
    handleClose()
    setProfileDialogOpen(true)
  }

  const handleBranchSettingsClick = () => {
    handleClose()
    setBranchDialogOpen(true)
  }

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleUpdateAction = () => {
    if (updateStatus === 'available') {
      window.updaterAPI.downloadUpdate()
    } else if (updateStatus === 'ready') {
      window.updaterAPI.installUpdate()
    } else if (updateStatus === 'idle' || updateStatus === 'error' || updateStatus === 'up-to-date') {
      setUpdateStatus('checking')
      window.updaterAPI.checkForUpdates()
    }
  }

  const handleThemePickerClick = () => {
    handleClose()
    themeBeforePreview.current = { slug: colorTheme }
    setThemeSearchQuery('')
    setThemePickerDialogOpen(true)
  }

  const handleThemePickerClose = () => {
    // Revert to the saved theme if the user didn't confirm
    if (themeBeforePreview.current) {
      setColorTheme(themeBeforePreview.current.slug)
      themeBeforePreview.current = null
    }
    setThemePickerDialogOpen(false)
  }

  const handleKeyboardShortcuts = () => {
    handleClose()
    window.dispatchEvent(new CustomEvent('open-keyboard-shortcuts'))
  }

  const handleToolSelect = () => {
    handleClose()
    setToolDialogOpen(true)
  }

  const handleToolChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAITool(event.target.value as AITool)
  }

  return (
    <>
      <Tooltip title="Settings">
        <IconButton
          onClick={handleClick}
          size="small"
          sx={{ color: 'text.secondary' }}
        >
          <SettingsIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right'
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right'
        }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 220,
              mt: 1,
              WebkitAppRegion: 'no-drag'
            }
          }
        }}
      >
        <MenuItem onClick={handleThemePickerClick}>
          <ListItemIcon>
            <PaletteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Project Color Theme"
            secondary={base24Schemes[colorTheme]?.name || colorTheme}
            secondaryTypographyProps={{ variant: 'caption' }}
          />
        </MenuItem>
        {!compact && viewMode === 'board' && (
          <MenuItem onClick={() => { loadProjectData(); handleClose() }}>
            <ListItemIcon>
              <SyncIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Refresh Board" />
          </MenuItem>
        )}
        <MenuItem onClick={handleToolSelect}>
          <ListItemIcon>
            <SmartToyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="AI Tool"
            secondary={
              aiTool === 'claude-code'
                ? `${selectedTool.name} (${CLAUDE_MODELS.find(m => m.id === claudeModel)?.name || claudeModel})`
                : aiTool === 'custom-endpoint' && customEndpoint
                  ? `${customEndpoint.name || 'Custom'} (${customEndpoint.modelName})`
                  : selectedTool.name
            }
            secondaryTypographyProps={{ variant: 'caption' }}
          />
        </MenuItem>
        {!compact && (
          <MenuItem onClick={() => setNotificationsEnabled(!notificationsEnabled)}>
            <ListItemIcon>
              <NotificationsIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Notifications"
              secondary="Story status changes"
              secondaryTypographyProps={{ variant: 'caption' }}
            />
            <Switch
              edge="end"
              checked={notificationsEnabled}
              size="small"
            />
          </MenuItem>
        )}
        <MenuItem onClick={() => setVerboseMode(!verboseMode)}>
          <ListItemIcon>
            <BuildIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Verbose Chat"
            secondary="Show tool calls in messages"
            secondaryTypographyProps={{ variant: 'caption' }}
          />
          <Switch
            edge="end"
            checked={verboseMode}
            size="small"
          />
        </MenuItem>
        <MenuItem onClick={handleProfileClick}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="BMAD Profile"
            secondary={bmadUserName || 'Not set'}
            secondaryTypographyProps={{ variant: 'caption' }}
          />
        </MenuItem>
        {!compact && (
          <>
            {viewMode === 'board' && (
              <MenuItem onClick={() => setEnableHumanReviewColumn(!enableHumanReviewColumn)}>
                <ListItemIcon>
                  <RateReviewIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Human Review Column"
                  secondary="Review checklist step"
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                <Switch
                  edge="end"
                  checked={enableHumanReviewColumn}
                  size="small"
                />
              </MenuItem>
            )}
            {viewMode === 'board' && (
              <MenuItem onClick={() => setFullCycleReviewCount(fullCycleReviewCount >= 5 ? 0 : fullCycleReviewCount + 1)}>
                <ListItemIcon>
                  <RepeatIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Full Cycle Reviews"
                  secondary={fullCycleReviewCount === 0 ? 'No reviews' : `${fullCycleReviewCount} review round${fullCycleReviewCount > 1 ? 's' : ''}`}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                <Chip
                  label={fullCycleReviewCount}
                  size="small"
                  color={fullCycleReviewCount === 0 ? 'default' : 'primary'}
                  sx={{ minWidth: 32, ml: 1 }}
                />
              </MenuItem>
            )}
            <MenuItem onClick={handleChatSettingsClick}>
              <ListItemIcon>
                <ChatIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Chat Settings"
                secondary={`Max ${maxThreadMessages} messages`}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </MenuItem>
            {!disableGitBranching && (
              <MenuItem onClick={handleBranchSettingsClick}>
                <ListItemIcon>
                  <GitIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Base Branch"
                  secondary={baseBranch}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </MenuItem>
            )}
            {!disableGitBranching && (
              <MenuItem onClick={() => setAllowDirectEpicMerge(!allowDirectEpicMerge)}>
                <ListItemIcon>
                  <MergeIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Direct Epic Merge"
                  secondary="Merge without PR"
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                <Switch
                  edge="end"
                  checked={allowDirectEpicMerge}
                  size="small"
                />
              </MenuItem>
            )}
            {!disableGitBranching && (
              <MenuItem onClick={() => setEnableEpicBranches(!enableEpicBranches)}>
                <ListItemIcon>
                  <GitIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Enable Epic Branches"
                  secondary="Show epic branch controls"
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                <Switch
                  edge="end"
                  checked={enableEpicBranches}
                  size="small"
                />
              </MenuItem>
            )}
            <MenuItem onClick={() => setDisableEnvCheck(!disableEnvCheck)}>
              <ListItemIcon>
                <SettingsSuggestIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Disable Env Check"
                secondary="Skip startup environment check"
                secondaryTypographyProps={{ variant: 'caption' }}
              />
              <Switch
                edge="end"
                checked={disableEnvCheck}
                size="small"
              />
            </MenuItem>
            {viewMode === 'board' && (
              <MenuItem onClick={() => setDisableGitBranching(!disableGitBranching)}>
                <ListItemIcon>
                  <GitIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Disable Git Branching"
                  secondary="Skip branch creation & merging"
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                <Switch
                  edge="end"
                  checked={disableGitBranching}
                  size="small"
                />
              </MenuItem>
            )}
          </>
        )}
        {!compact && (
          <>
            {appVersion && (
              <MenuItem disabled sx={{ opacity: '0.7 !important' }}>
                <ListItemIcon>
                  <SystemUpdateIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Version"
                  secondary={`v${appVersion}`}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </MenuItem>
            )}
            <MenuItem
              onClick={handleUpdateAction}
              disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
            >
              <ListItemIcon>
                {updateStatus === 'checking' ? (
                  <CircularProgress size={20} />
                ) : updateStatus === 'available' ? (
                  <DownloadIcon fontSize="small" />
                ) : updateStatus === 'downloading' ? (
                  <CircularProgress size={20} variant="determinate" value={downloadPercent} />
                ) : updateStatus === 'ready' ? (
                  <InstallDesktopIcon fontSize="small" color="success" />
                ) : (
                  <SyncIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText
                primary={
                  updateStatus === 'checking' ? 'Checking...'
                    : updateStatus === 'available' ? `Download v${updateVersion}`
                    : updateStatus === 'downloading' ? `Downloading... ${downloadPercent}%`
                    : updateStatus === 'ready' ? `Install v${updateVersion}`
                    : 'Check for Updates'
                }
                secondary={
                  updateStatus === 'error' ? 'Update check failed'
                    : updateStatus === 'up-to-date' ? "You're up to date"
                    : undefined
                }
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </MenuItem>
            <MenuItem onClick={handleKeyboardShortcuts}>
              <ListItemIcon>
                <KeyboardIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Keyboard Shortcuts</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>

      {/* AI Tool Selection Dialog */}
      <Dialog
        open={toolDialogOpen}
        onClose={() => setToolDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Select AI Tool
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Refresh CLI detection">
              <IconButton 
                size="small" 
                onClick={refreshCliDetection}
                disabled={detectingCli}
              >
                {detectingCli ? <CircularProgress size={20} /> : <RefreshIcon />}
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={() => setToolDialogOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select your AI coding assistant. This determines the command syntax shown in the BMAD Guide.
          </Typography>
          <RadioGroup value={aiTool} onChange={handleToolChange}>
            {AI_TOOLS.filter((t) => t.id === 'claude-code').map((tool) => {
              const status = cliStatus[tool.id]
              const isIdeOnly = !tool.cli.supportsHeadless
              const isAvailable = status?.available
              const version = status?.version

              return (
                <Box
                  key={tool.id}
                  sx={{
                    p: 1.5,
                    mb: 1,
                    border: 1,
                    borderColor: aiTool === tool.id ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    cursor: 'pointer',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: 'action.hover'
                    }
                  }}
                  onClick={() => setAITool(tool.id)}
                >
                  <FormControlLabel
                    value={tool.id}
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography fontWeight={500}>{tool.name}</Typography>
                          <Chip
                            label={`${tool.agentPrefix}agent`}
                            size="small"
                            sx={{
                              fontFamily: 'monospace',
                              height: 20,
                              fontSize: '0.7rem'
                            }}
                          />
                          {isIdeOnly ? (
                            <Chip
                              icon={<DesktopWindowsIcon sx={{ fontSize: '0.9rem !important' }} />}
                              label="IDE Only"
                              size="small"
                              color="warning"
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          ) : status ? (
                            isAvailable ? (
                              <Chip
                                icon={<CheckCircleIcon sx={{ fontSize: '0.9rem !important' }} />}
                                label={version ? `v${version}` : 'Available'}
                                size="small"
                                color="success"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.65rem' }}
                              />
                            ) : (
                              <Chip
                                icon={<ErrorIcon sx={{ fontSize: '0.9rem !important' }} />}
                                label="Not Found"
                                size="small"
                                color="error"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.65rem' }}
                              />
                            )
                          ) : detectingCli ? (
                            <CircularProgress size={14} />
                          ) : null}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {tool.description}
                        </Typography>
                        {!isIdeOnly && status && !isAvailable && (
                          <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5 }}>
                            Install {tool.cli.cliCommand} CLI to enable agent chat
                          </Typography>
                        )}
                        {isIdeOnly && (
                          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
                            Use copy-to-clipboard workflow for this IDE
                          </Typography>
                        )}
                      </Box>
                    }
                    sx={{ m: 0, width: '100%' }}
                  />
                </Box>
              )
            })}
          </RadioGroup>

          {/* Model Selection - only for Claude Code */}
          {aiTool === 'claude-code' && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Claude Model
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Select which Claude model to use for agent conversations.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {CLAUDE_MODELS.map((model) => (
                  <Chip
                    key={model.id}
                    label={model.name}
                    onClick={() => setClaudeModel(model.id)}
                    color={claudeModel === model.id ? 'primary' : 'default'}
                    variant={claudeModel === model.id ? 'filled' : 'outlined'}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                {CLAUDE_MODELS.find(m => m.id === claudeModel)?.description}
              </Typography>
            </Box>
          )}

          {/* Custom Endpoint Configuration */}
          {aiTool === 'custom-endpoint' && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Custom Endpoint Configuration
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Configure an Anthropic-compatible API endpoint (e.g., GLM, Kimi).
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Name"
                  placeholder="e.g., Kimi K2, GLM"
                  size="small"
                  value={customEndpointForm.name}
                  onChange={(e) => setCustomEndpointForm(prev => ({ ...prev, name: e.target.value }))}
                  helperText="A friendly name for this endpoint"
                />

                <TextField
                  label="Base URL"
                  placeholder="https://api.moonshot.ai/anthropic/"
                  size="small"
                  value={customEndpointForm.baseUrl}
                  onChange={(e) => setCustomEndpointForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                  helperText="The Anthropic-compatible API endpoint URL"
                />

                <TextField
                  label="API Key"
                  type="password"
                  placeholder="Your API key"
                  size="small"
                  value={customEndpointForm.apiKey}
                  onChange={(e) => setCustomEndpointForm(prev => ({ ...prev, apiKey: e.target.value }))}
                  helperText="API key for authentication"
                />

                <TextField
                  label="Model Name"
                  placeholder="e.g., kimi-k2, glm-4.7"
                  size="small"
                  value={customEndpointForm.modelName}
                  onChange={(e) => setCustomEndpointForm(prev => ({ ...prev, modelName: e.target.value }))}
                  helperText="The model identifier to use"
                />

                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
                  {customEndpoint && (
                    <Chip
                      label="Clear"
                      color="error"
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        setCustomEndpoint(null)
                        setCustomEndpointForm({ name: '', baseUrl: '', apiKey: '', modelName: '' })
                      }}
                      sx={{ cursor: 'pointer' }}
                    />
                  )}
                  <Chip
                    label="Save Configuration"
                    color="primary"
                    variant="filled"
                    size="small"
                    disabled={!customEndpointForm.baseUrl || !customEndpointForm.apiKey || !customEndpointForm.modelName}
                    onClick={() => setCustomEndpoint(customEndpointForm)}
                    sx={{ cursor: 'pointer' }}
                  />
                </Box>

                {customEndpoint && (
                  <Typography variant="caption" color="success.main" sx={{ display: 'block' }}>
                    Configuration saved: {customEndpoint.name || 'Custom'} ({customEndpoint.modelName})
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* BMAD Profile Dialog */}
      <Dialog
        open={profileDialogOpen}
        onClose={() => { setProfileDialogOpen(false); setHasConfiguredProfile(true) }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          BMAD Profile
          <IconButton size="small" onClick={() => { setProfileDialogOpen(false); setHasConfiguredProfile(true) }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Your name and language are written to project config files during installation. Agents use these for personalized greetings and communication.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              label="First Name"
              placeholder="Your first name"
              size="small"
              value={bmadUserName}
              onChange={(e) => setBmadUserName(e.target.value)}
              helperText="Used by BMAD agents for personalized greetings"
            />

            <TextField
              label="Communication Language"
              placeholder="e.g., English, Spanish, Japanese"
              size="small"
              value={bmadLanguage}
              onChange={(e) => setBmadLanguage(e.target.value)}
              helperText="Language agents will use to communicate with you"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setProfileDialogOpen(false); setHasConfiguredProfile(true) }}>
            Done
          </Button>
        </DialogActions>
      </Dialog>

      {/* Chat Settings Dialog */}
      <Dialog
        open={chatSettingsDialogOpen}
        onClose={() => setChatSettingsDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Chat Settings
          <IconButton size="small" onClick={() => setChatSettingsDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Configure the agent chat interface settings.
          </Typography>

          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Max Messages Per Thread
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Older messages will be removed when this limit is reached. Range: 50-500
            </Typography>
            <Box sx={{ px: 1 }}>
              <Slider
                value={maxThreadMessages}
                onChange={(_, value) => setMaxThreadMessages(value as number)}
                min={50}
                max={500}
                step={10}
                marks={[
                  { value: 50, label: '50' },
                  { value: 100, label: '100' },
                  { value: 250, label: '250' },
                  { value: 500, label: '500' }
                ]}
                valueLabelDisplay="auto"
              />
            </Box>
            <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
              Current: <strong>{maxThreadMessages}</strong> messages
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Theme Picker Dialog */}
      <Dialog
        open={themePickerDialogOpen}
        onClose={handleThemePickerClose}
        maxWidth="xs"
        fullWidth
        hideBackdrop
        sx={{ pointerEvents: 'none', '& .MuiDialog-paper': { pointerEvents: 'auto' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Project Color Theme
          <IconButton size="small" onClick={handleThemePickerClose}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            placeholder="Search themes..."
            size="small"
            fullWidth
            value={themeSearchQuery}
            onChange={(e) => setThemeSearchQuery(e.target.value)}
            sx={{ mb: 0.5 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, px: 0.5 }}>
            {themeSearchQuery
              ? `${themeList.filter(t => t.name.toLowerCase().includes(themeSearchQuery.toLowerCase())).length} of ${themeList.length} themes`
              : `${themeList.length} themes`
            }
          </Typography>
          <Box
            sx={{
              maxHeight: 400,
              overflow: 'auto',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1
            }}
          >
            {(['dark', 'light'] as const).map((variant) => {
              const filtered = themeList.filter(
                (t) => t.variant === variant &&
                  t.name.toLowerCase().includes(themeSearchQuery.toLowerCase())
              )
              if (filtered.length === 0) return null
              return (
                <Box key={variant}>
                  <Typography
                    variant="caption"
                    sx={{
                      px: 1.5,
                      py: 0.5,
                      display: 'block',
                      fontWeight: 600,
                      bgcolor: 'background.paper',
                      borderBottom: 1,
                      borderColor: 'divider',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1
                    }}
                  >
                    {variant === 'dark' ? 'Dark Themes' : 'Light Themes'}
                  </Typography>
                  {filtered.map((option) => {
                    const scheme = base24Schemes[option.slug]
                    const p = scheme?.palette
                    const swatchColors = p ? [
                      `#${p.base08}`, `#${p.base0A}`, `#${p.base0B}`, `#${p.base0D}`, `#${p.base0E}`
                    ] : []
                    const isActive = option.slug === colorTheme
                    return (
                      <Box
                        key={option.slug}
                        onClick={() => {
                          setColorTheme(option.slug)
                        }}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 1.5,
                          py: 0.75,
                          cursor: 'pointer',
                          bgcolor: isActive ? 'action.selected' : 'transparent',
                          '&:hover': { bgcolor: 'action.hover' }
                        }}
                      >
                        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                          {swatchColors.map((color, i) => (
                            <Box
                              key={i}
                              sx={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                bgcolor: color,
                                border: 1,
                                borderColor: 'divider'
                              }}
                            />
                          ))}
                        </Box>
                        <Typography variant="body2" noWrap>
                          {option.name}
                        </Typography>
                      </Box>
                    )
                  })}
                </Box>
              )
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleThemePickerClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              themeBeforePreview.current = null
              setThemePickerDialogOpen(false)
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Base Branch Selection Dialog */}
      <Dialog
        open={branchDialogOpen}
        onClose={() => setBranchDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Base Branch
          <IconButton size="small" onClick={() => setBranchDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select your repository's main/base branch. This is used for branch comparisons and story editing restrictions.
          </Typography>
          <Autocomplete
            freeSolo
            options={availableBranches}
            value={baseBranch}
            onChange={(_, newValue) => {
              if (newValue) {
                setBaseBranch(newValue)
              }
            }}
            onInputChange={(_, newValue, reason) => {
              if (reason === 'input' && newValue) {
                setBaseBranch(newValue)
              }
            }}
            loading={loadingBranches}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Branch"
                placeholder="Select or type a branch name"
                size="small"
                slotProps={{
                  input: {
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingBranches ? <CircularProgress size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    )
                  }
                }}
              />
            )}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
