import { useState } from 'react'
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Tooltip,
  Badge,
  Chip,
  Popover,
  Collapse,
} from '@mui/material'
import logoDark from '../../assets/logo-dark.svg'
import logoLight from '../../assets/logo-light.svg'
import TerminalIcon from '@mui/icons-material/Terminal'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import SportsEsportsIcon from '@mui/icons-material/SportsEsports'
import HistoryIcon from '@mui/icons-material/History'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import CircularProgress from '@mui/material/CircularProgress'
import DescriptionIcon from '@mui/icons-material/Description'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import SearchBar from '../SearchBar/SearchBar'
import EpicFilter from '../EpicFilter/EpicFilter'
import SettingsMenu from '../SettingsMenu'
import ProjectSwitcher from '../ProjectSwitcher'
import ArtifactViewer from '../HelpPanel/ArtifactViewer'
import { useStore } from '../../store'
import { AI_TOOLS } from '../../types'
import { hasBoardModule } from '../../utils/projectTypes'
import { useDocuments, getArtifactTypeLabel, getArtifactTypeColor, DocumentFile } from '../../hooks/useDocuments'

export default function Header() {
  const agents = useStore((state) => state.agents)
  const agentPanelOpen = useStore((state) => state.agentPanelOpen)
  const toggleAgentPanel = useStore((state) => state.toggleAgentPanel)
  const enableAgents = useStore((state) => state.enableAgents)
  const toggleEnableAgents = useStore((state) => state.toggleEnableAgents)
  const setHelpPanelOpen = useStore((state) => state.setHelpPanelOpen)
  const statusHistoryPanelOpen = useStore((state) => state.statusHistoryPanelOpen)
  const setStatusHistoryPanelOpen = useStore((state) => state.setStatusHistoryPanelOpen)
  const getUnreadStatusHistoryCount = useStore((state) => state.getUnreadStatusHistoryCount)
  const projectType = useStore((state) => state.projectType)
  const themeMode = useStore((state) => state.themeMode)
  const viewMode = useStore((state) => state.viewMode)
  const chatThreads = useStore((state) => state.chatThreads)
  const aiTool = useStore((state) => state.aiTool)
  const selectedEpicId = useStore((state) => state.selectedEpicId)
  const stories = useStore((state) => state.stories)
  const epicCycle = useStore((state) => state.epicCycle)
  const setEpicCycleDialogOpen = useStore((state) => state.setEpicCycleDialogOpen)
  const fullCycle = useStore((state) => state.fullCycle)
  const setFullCycleDialogOpen = useStore((state) => state.setFullCycleDialogOpen)
  const setFullCycleMinimized = useStore((state) => state.setFullCycleMinimized)
  const setProjectWorkflowsDialogOpen = useStore((state) => state.setProjectWorkflowsDialogOpen)
  const scannedWorkflowConfig = useStore((state) => state.scannedWorkflowConfig)
  const developerMode = useStore((state) => state.developerMode)
  const bmadScanResult = useStore((state) => state.bmadScanResult)
  const { folders, allFiles, getModuleLabel } = useDocuments()
  const [docsAnchor, setDocsAnchor] = useState<null | HTMLElement>(null)
  const [selectedArtifact, setSelectedArtifact] = useState<DocumentFile | null>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())

  // Count chat agents currently running (isTyping)
  const runningChatAgents = Object.values(chatThreads).filter(
    (thread) => thread?.isTyping
  ).length


  // Run Epic button visibility
  const selectedToolInfo = AI_TOOLS.find(t => t.id === aiTool)
  const toolSupportsHeadless = selectedToolInfo?.cli.supportsHeadless ?? false
  const backlogCount = selectedEpicId !== null
    ? stories.filter((s) => s.epicId === selectedEpicId && s.status === 'backlog').length
    : 0
  const showRunEpic = selectedEpicId !== null && toolSupportsHeadless && viewMode === 'board' && developerMode !== 'human'

  const hasBrd = bmadScanResult?.modules ? hasBoardModule(bmadScanResult.modules) : projectType !== 'dashboard'
  const isGameProject = projectType === 'gds'
  const logoSrc = themeMode === 'dark' ? logoDark : logoLight

  const runningAgentsCount = enableAgents
    ? Object.values(agents).filter((a) => a.status === 'running').length
    : 0

  const handleLogoClick = (e: React.MouseEvent) => {
    // Triple-click to toggle hidden agents feature
    if (e.detail === 3) {
      toggleEnableAgents()
    }
  }

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        WebkitAppRegion: 'drag',
        '& button, & input, & select, & [role="button"], & [role="combobox"], & .MuiSelect-select, & .MuiAutocomplete-root, & .MuiInputBase-root, & .MuiChip-root, & .MuiIconButton-root': {
          WebkitAppRegion: 'no-drag'
        }
      }}
    >
      {/* Top bar - Identity & Navigation */}
      <Toolbar
        variant="dense"
        sx={{
          minHeight: 44,
          gap: 2,
          position: 'relative',
          pl: { xs: 2, sm: 10 },
        }}
      >
        <Box
          onClick={handleLogoClick}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'default', userSelect: 'none', WebkitAppRegion: 'no-drag' }}
        >
          <Box
            component="img"
            src={logoSrc}
            alt="BMad Studio"
            sx={{ width: 28, height: 28, borderRadius: 1 }}
          />
          <Typography
            variant="body2"
            color="text.secondary"
            fontWeight={500}
            sx={{ whiteSpace: 'nowrap' }}
          >
            BMad Studio
          </Typography>
          {isGameProject && (
            <Chip
              icon={<SportsEsportsIcon sx={{ fontSize: 14 }} />}
              label="Game"
              size="small"
              sx={{
                ml: 0.5,
                height: 20,
                bgcolor: '#8B5CF6',
                color: 'white',
                fontWeight: 600,
                fontSize: '0.65rem',
                '& .MuiChip-icon': { color: 'white' }
              }}
            />
          )}
          {runningChatAgents > 0 && (
            <Chip
              label={`${runningChatAgents} agent${runningChatAgents > 1 ? 's' : ''} working`}
              size="small"
              sx={{
                ml: 0.5,
                height: 20,
                bgcolor: 'success.main',
                color: 'white',
                fontWeight: 500,
                fontSize: '0.65rem',
                animation: 'pulse 1.5s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.6 }
                }
              }}
            />
          )}
        </Box>

        <Box sx={{ flexGrow: 1 }} />
        <ProjectSwitcher />
        <Box sx={{ flexGrow: 1 }} />

        {scannedWorkflowConfig?.projectWorkflows && toolSupportsHeadless && (
          <Tooltip title="Project Workflows">
            <IconButton
              onClick={() => setProjectWorkflowsDialogOpen(true)}
              size="small"
              sx={{ color: 'text.secondary' }}
            >
              <AccountTreeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Documents">
          <IconButton
            onClick={(e) => setDocsAnchor(e.currentTarget)}
            size="small"
            sx={{ color: 'text.secondary' }}
          >
            <Badge badgeContent={allFiles.length} color="primary" invisible={allFiles.length === 0}>
              <FolderOpenIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>
        {!hasBrd && enableAgents && (
          <Tooltip title={agentPanelOpen ? 'Hide Agents' : 'Show Agents'}>
            <IconButton
              onClick={toggleAgentPanel}
              size="small"
              sx={{ color: agentPanelOpen ? 'primary.main' : 'text.secondary' }}
            >
              <Badge badgeContent={runningAgentsCount} color="success" invisible={runningAgentsCount === 0}>
                <TerminalIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>
        )}
        {!hasBrd && (
          <Tooltip title="BMAD Guide (F1)">
            <IconButton
              onClick={() => setHelpPanelOpen(true)}
              size="small"
              sx={{ color: 'text.secondary' }}
            >
              <HelpOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <SettingsMenu />
      </Toolbar>

      {/* Bottom bar - Board Tools (board projects only) */}
      {hasBrd && (viewMode === 'board' || viewMode === 'chat') && (
        <Toolbar
          variant="dense"
          sx={{
            minHeight: 38,
            gap: 1.5,
            pl: { xs: 2, sm: 2 },
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          {/* Filters: Search + Epic */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SearchBar />
            <EpicFilter />
            {showRunEpic && !epicCycle.isRunning && (
              <Tooltip title={backlogCount > 0 ? `Run Epic (${backlogCount} backlog)` : 'Epic Cycle'}>
                <IconButton
                  onClick={() => setEpicCycleDialogOpen(true)}
                  size="small"
                  sx={{ color: 'text.secondary' }}
                >
                  <RocketLaunchIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {epicCycle.isRunning && (() => {
              const currentStoryId = epicCycle.storyQueue[epicCycle.currentStoryIndex]
              const currentStory = currentStoryId ? stories.find(s => s.id === currentStoryId) : null
              const completedCount = epicCycle.storyStatuses.filter(s => s === 'completed').length
              const totalCount = epicCycle.storyQueue.length
              // Get agent activity from whichever chatThread is currently typing
              const activeThread = Object.values(chatThreads).find(t => t?.isTyping)
              const agentActivity = activeThread?.thinkingActivity
              const stepInfo = fullCycle.isRunning ? fullCycle.stepName : 'Preparing...'
              return (
                <Tooltip title={`Epic Cycle: ${currentStory?.title || currentStoryId || '...'} — ${stepInfo}${agentActivity ? ` (${agentActivity})` : ''}`}>
                  <Chip
                    size="small"
                    icon={<CircularProgress size={12} color="inherit" />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <RocketLaunchIcon sx={{ fontSize: 12 }} />
                        <Typography variant="caption" sx={{ fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {currentStory ? `${currentStory.epicId}.${currentStory.storyNumber}` : '...'}: {stepInfo}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.7 }}>
                          {completedCount + 1}/{totalCount}
                        </Typography>
                      </Box>
                    }
                    onClick={() => setEpicCycleDialogOpen(true)}
                    color="primary"
                    sx={{
                      cursor: 'pointer',
                      height: 24,
                      '& .MuiChip-icon': { ml: 0.5 },
                      '& .MuiChip-label': { px: 0.5 },
                      animation: 'pulse 1.5s ease-in-out infinite',
                      '@keyframes pulse': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.75 }
                      }
                    }}
                  />
                </Tooltip>
              )
            })()}
            {/* Full Cycle Progress Indicator (when minimized, standalone only) */}
            {!epicCycle.isRunning && fullCycle.isRunning && fullCycle.minimized && (
              <Tooltip title={`Full Cycle: ${fullCycle.stepName} (${fullCycle.currentStep + 1}/${fullCycle.totalSteps})`}>
                <Chip
                  size="small"
                  icon={<CircularProgress size={12} color="inherit" />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <RocketLaunchIcon sx={{ fontSize: 12 }} />
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {fullCycle.currentStep + 1}/{fullCycle.totalSteps}
                      </Typography>
                    </Box>
                  }
                  onClick={() => {
                    setFullCycleMinimized(false)
                    setFullCycleDialogOpen(true)
                  }}
                  color="primary"
                  sx={{
                    cursor: 'pointer',
                    height: 24,
                    '& .MuiChip-icon': { ml: 0.5 },
                    '& .MuiChip-label': { px: 0.5 }
                  }}
                />
              </Tooltip>
            )}
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {/* Panel toggles & actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {enableAgents && (
              <Tooltip title={agentPanelOpen ? 'Hide Agents' : 'Show Agents'}>
                <IconButton
                  onClick={toggleAgentPanel}
                  size="small"
                  sx={{ color: agentPanelOpen ? 'primary.main' : 'text.secondary' }}
                >
                  <Badge badgeContent={runningAgentsCount} color="success" invisible={runningAgentsCount === 0}>
                    <TerminalIcon fontSize="small" />
                  </Badge>
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Status History">
              <IconButton
                onClick={() => setStatusHistoryPanelOpen(!statusHistoryPanelOpen)}
                size="small"
                sx={{ color: statusHistoryPanelOpen ? 'primary.main' : 'text.secondary' }}
              >
                <Badge
                  badgeContent={getUnreadStatusHistoryCount()}
                  color="primary"
                  invisible={getUnreadStatusHistoryCount() === 0}
                  max={99}
                >
                  <HistoryIcon fontSize="small" />
                </Badge>
              </IconButton>
            </Tooltip>
            <Tooltip title="BMAD Guide (F1)">
              <IconButton
                onClick={() => setHelpPanelOpen(true)}
                size="small"
                sx={{ color: 'text.secondary' }}
              >
                <HelpOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      )}

      {/* Documents Popover */}
      <Popover
        open={Boolean(docsAnchor)}
        anchorEl={docsAnchor}
        onClose={() => setDocsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: { p: 2, width: 380, maxHeight: 500, overflow: 'auto', borderRadius: 1.5, WebkitAppRegion: 'no-drag' }
          }
        }}
      >
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
          Documents
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {folders.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1, textAlign: 'center' }}>
              No documents found
            </Typography>
          )}
          {folders.map((folder) => {
            const isCollapsed = collapsedFolders.has(folder.id)
            const toggleCollapse = () => {
              setCollapsedFolders(prev => {
                const next = new Set(prev)
                if (next.has(folder.id)) next.delete(folder.id)
                else next.add(folder.id)
                return next
              })
            }
            const moduleLabel = getModuleLabel(folder.module)
            return (
              <Box key={folder.id}>
                {/* Folder header */}
                <Box
                  onClick={toggleCollapse}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    cursor: 'pointer',
                    py: 0.25,
                    '&:hover': { opacity: 0.8 }
                  }}
                >
                  {isCollapsed
                    ? <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    : <ExpandLessIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  }
                  <Typography variant="caption" fontWeight={600} sx={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                    {folder.label}
                  </Typography>
                  {moduleLabel && (
                    <Chip
                      label={moduleLabel}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.6rem',
                        fontWeight: 600,
                        bgcolor: 'action.selected',
                      }}
                    />
                  )}
                </Box>
                {/* File list */}
                <Collapse in={!isCollapsed}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, ml: 1 }}>
                    {folder.files.map((file) => (
                      <Box
                        key={file.path}
                        onClick={() => { setSelectedArtifact(file); setDocsAnchor(null) }}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          p: 0.5,
                          pl: 1,
                          borderRadius: 0.5,
                          cursor: 'pointer',
                          '&:hover': { bgcolor: 'action.selected' }
                        }}
                      >
                        <DescriptionIcon sx={{ fontSize: 14, color: getArtifactTypeColor(file.type) }} />
                        <Typography variant="body2" sx={{ flex: 1, fontSize: '0.8rem' }}>
                          {file.displayName}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.6rem',
                            px: 0.5,
                            py: 0.125,
                            borderRadius: 0.5,
                            bgcolor: getArtifactTypeColor(file.type),
                            color: 'white',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {getArtifactTypeLabel(file.type)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Collapse>
              </Box>
            )
          })}
        </Box>
      </Popover>

      {/* Artifact Viewer Dialog */}
      <ArtifactViewer
        artifact={selectedArtifact}
        onClose={() => setSelectedArtifact(null)}
      />
    </AppBar>
  )
}
