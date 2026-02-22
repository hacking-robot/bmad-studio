import { useMemo, useEffect, useCallback, useRef } from 'react'
import { ThemeProvider, CssBaseline, Box, CircularProgress, IconButton, Tooltip } from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useStore } from './store'
import { lightTheme, darkTheme } from './theme'
import { AI_TOOLS } from './types'
import Header from './components/Header/Header'
import Board from './components/Board/Board'
import { Dashboard } from './components/Dashboard'
import { hasBoardModule } from './utils/projectTypes'
import StoryDialog from './components/StoryDialog/StoryDialog'
import WelcomeDialog from './components/WelcomeDialog/WelcomeDialog'
import NewProjectDialog from './components/NewProjectDialog'
import AgentPanel from './components/AgentPanel/AgentPanel'
import CommandPalette from './components/CommandPalette'
import KeyboardShortcuts from './components/KeyboardShortcuts'
import HelpPanel from './components/HelpPanel'
import StatusBar from './components/StatusBar'
import { AgentChat } from './components/AgentChat'
import StatusHistoryPanel from './components/StatusHistoryPanel/StatusHistoryPanel'
import { GitDiffPanel } from './components/GitDiffDialog'
import { FullCycleDialog, FullCycleOrchestrator, EpicCycleDialog, EpicCycleOrchestrator } from './components/FullCycleDialog'
import GlobalChatHandler from './components/GlobalChatHandler'
import { ProjectWizard } from './components/ProjectWizard'
import ProjectWorkflowsDialog from './components/ProjectWorkflowsDialog/ProjectWorkflowsDialog'
import IncompatibleVersionDialog from './components/IncompatibleVersionDialog'
import { EnvCheckDialog } from './components/EnvCheckDialog'

const AGENT_PANEL_WIDTH = 500

export default function App() {
  const hasHydrated = useStore((state) => state._hasHydrated)
  const themeMode = useStore((state) => state.themeMode)
  const projectPath = useStore((state) => state.projectPath)
  const enableAgents = useStore((state) => state.enableAgents)
  const agentPanelOpen = useStore((state) => state.agentPanelOpen)
  const helpPanelOpen = useStore((state) => state.helpPanelOpen)
  const helpPanelTab = useStore((state) => state.helpPanelTab)
  const setHelpPanelOpen = useStore((state) => state.setHelpPanelOpen)
  const viewMode = useStore((state) => state.viewMode)
  const toggleViewMode = useStore((state) => state.toggleViewMode)
  const aiTool = useStore((state) => state.aiTool)
  const wizardActive = useStore((state) => state.projectWizard.isActive)
  const envCheckResults = useStore((state) => state.envCheckResults)
  const setEnvCheckDialogOpen = useStore((state) => state.setEnvCheckDialogOpen)
  const setEnvCheckResults = useStore((state) => state.setEnvCheckResults)
  const setEnvCheckLoading = useStore((state) => state.setEnvCheckLoading)
  const disableEnvCheck = useStore((state) => state.disableEnvCheck)
  const setUpdateStatus = useStore((state) => state.setUpdateStatus)
  const setUpdateVersion = useStore((state) => state.setUpdateVersion)
  const setUpdateDownloadPercent = useStore((state) => state.setUpdateDownloadPercent)
  const hasConfiguredProfile = useStore((state) => state.hasConfiguredProfile)
  const setProfileDialogOpen = useStore((state) => state.setProfileDialogOpen)
  const bmadScanResult = useStore((state) => state.bmadScanResult)
  const projectType = useStore((state) => state.projectType)
  const chatSidebarWidth = useStore((state) => state.chatSidebarWidth)
  const setChatSidebarWidth = useStore((state) => state.setChatSidebarWidth)

  // Determine if this project has a board module (bmm or gds)
  const hasBrd = bmadScanResult?.modules ? hasBoardModule(bmadScanResult.modules) : projectType !== 'dashboard'

  // Listen for auto-updater status (must be at app level so events aren't missed)
  useEffect(() => {
    const cleanup = window.updaterAPI.onUpdateStatus((event) => {
      const status = event.status === 'dev-mode' ? 'idle' : event.status as 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date'
      setUpdateStatus(status)
      if (event.version) setUpdateVersion(event.version as string)
      if (event.percent !== undefined) setUpdateDownloadPercent(event.percent)
    })
    return cleanup
  }, [setUpdateStatus, setUpdateVersion, setUpdateDownloadPercent])

  // Agent features available for tools with headless CLI support
  const selectedToolInfo = AI_TOOLS.find(t => t.id === aiTool)
  const toolSupportsHeadless = selectedToolInfo?.cli.supportsHeadless ?? false
  const showAgentPanel = agentPanelOpen && enableAgents && (viewMode === 'board' || viewMode === 'dashboard') && toolSupportsHeadless
  const showChatView = viewMode === 'chat' && toolSupportsHeadless
  // Keyboard shortcut for view toggle (Cmd+Shift+A)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        toggleViewMode()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleViewMode])

  // Run environment check in background; only show dialog if something fails
  useEffect(() => {
    if (hasHydrated && projectPath && envCheckResults === null && !disableEnvCheck) {
      setEnvCheckLoading(true)
      window.cliAPI.checkEnvironment().then((result) => {
        setEnvCheckResults(result.items)
        setEnvCheckLoading(false)
        const hasIssues = result.items.some((i: { status: string }) => i.status === 'error' || i.status === 'warning')
        if (hasIssues) {
          setEnvCheckDialogOpen(true)
        }
      }).catch(() => {
        setEnvCheckLoading(false)
      })
    }
  }, [hasHydrated, projectPath, envCheckResults, disableEnvCheck, setEnvCheckDialogOpen, setEnvCheckResults, setEnvCheckLoading])

  // Open profile dialog on first launch once a project is loaded
  useEffect(() => {
    if (hasHydrated && projectPath && !wizardActive && !hasConfiguredProfile) {
      setProfileDialogOpen(true)
    }
  }, [hasHydrated, projectPath, wizardActive, hasConfiguredProfile, setProfileDialogOpen])

  // Listen for custom event to open help panel
  useEffect(() => {
    const handleOpen = () => setHelpPanelOpen(true)
    window.addEventListener('open-help-panel', handleOpen)
    return () => window.removeEventListener('open-help-panel', handleOpen)
  }, [setHelpPanelOpen])

  // Chat sidebar resize
  const isResizing = useRef(false)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = chatSidebarWidth ?? window.innerWidth * 0.9

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = Math.max(400, Math.min(startWidth + (e.clientX - startX), window.innerWidth - 50))
      setChatSidebarWidth(newWidth)
    }

    const onMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [chatSidebarWidth, setChatSidebarWidth])

  const theme = useMemo(
    () => (themeMode === 'dark' ? darkTheme : lightTheme),
    [themeMode]
  )

  // Show loading while hydrating persisted state
  if (!hasHydrated) {
    return (
      <ThemeProvider theme={lightTheme}>
        <CssBaseline />
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'background.default',
            position: 'relative'
          }}
        >
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, WebkitAppRegion: 'drag' }} />
          <CircularProgress />
        </Box>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CommandPalette />
      <KeyboardShortcuts />
      <NewProjectDialog />
      <IncompatibleVersionDialog />
      <EnvCheckDialog />
      <HelpPanel
        open={helpPanelOpen}
        onClose={() => setHelpPanelOpen(false)}
        initialTab={helpPanelTab}
      />
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
          overflow: 'hidden'
        }}
      >
        {wizardActive ? (
          <GlobalChatHandler>
            <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              <ProjectWizard />
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <AgentChat />
              </Box>
            </Box>
          </GlobalChatHandler>
        ) : !projectPath ? (
          <WelcomeDialog />
        ) : (
          <GlobalChatHandler>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                overflow: 'hidden',
                position: 'relative',
                transition: 'margin-right 225ms cubic-bezier(0, 0, 0.2, 1)',
                marginRight: showAgentPanel ? `${AGENT_PANEL_WIDTH}px` : 0
              }}
            >
              <Header />
              {/* Main content */}
              <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
                {/* Main view - Board or Dashboard */}
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                  }}
                >
                  {hasBrd ? <Board /> : <Dashboard />}
                  <StatusBar />
                </Box>

                {/* Toggle button when chat is closed - only for Claude Code */}
                {!showChatView && toolSupportsHeadless && (
                  <Tooltip title="Open agents chat (⌘⇧A)" placement="right">
                    <IconButton
                      onClick={toggleViewMode}
                      sx={{
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        bgcolor: 'background.paper',
                        border: 1,
                        borderColor: 'divider',
                        borderLeft: 0,
                        borderRadius: '0 8px 8px 0',
                        width: 32,
                        height: 64,
                        zIndex: 5,
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <ChevronRightIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>

              {/* Backdrop to close chat sidebar on click outside */}
              {showChatView && (
                <Box
                  onClick={toggleViewMode}
                  sx={{
                    position: 'absolute',
                    top: 44,
                    left: 0,
                    right: 0,
                    bottom: 28,
                    bgcolor: 'rgba(0, 0, 0, 0.3)',
                    zIndex: 1201,
                    cursor: 'pointer'
                  }}
                />
              )}

              {/* Chat sidebar - slides over from left, overlaps subheader */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 44,
                  left: 0,
                  bottom: 28,
                  width: chatSidebarWidth ?? '90%',
                  maxWidth: chatSidebarWidth ? undefined : 1400,
                  transform: showChatView ? 'translateX(0)' : 'translateX(-100%)',
                  transition: isResizing.current ? 'none' : 'transform 225ms cubic-bezier(0, 0, 0.2, 1)',
                  bgcolor: 'background.paper',
                  borderRight: 1,
                  borderTop: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  boxShadow: showChatView ? 8 : 0,
                  zIndex: 1202
                }}
              >
                <AgentChat />
                {/* Resize handle on right edge */}
                {showChatView && (
                  <Box
                    onMouseDown={handleResizeStart}
                    sx={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      cursor: 'col-resize',
                      zIndex: 1203,
                      '&:hover': { bgcolor: 'primary.main', opacity: 0.5 }
                    }}
                  />
                )}
                {/* Close button on right edge of sidebar */}
                {showChatView && (
                  <Tooltip title="Close chat (⌘⇧A)" placement="right">
                    <IconButton
                      onClick={toggleViewMode}
                      sx={{
                        position: 'absolute',
                        right: -32,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        bgcolor: 'background.paper',
                        border: 1,
                        borderColor: 'divider',
                        borderLeft: 0,
                        borderRadius: '0 8px 8px 0',
                        width: 32,
                        height: 64,
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <ChevronLeftIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>
            {enableAgents && !showChatView && toolSupportsHeadless && <AgentPanel />}
            <GitDiffPanel />
            {hasBrd && (
              <>
                <StoryDialog />
                <StatusHistoryPanel />
                <FullCycleDialog />
                <FullCycleOrchestrator />
                <EpicCycleDialog />
                <EpicCycleOrchestrator />
              </>
            )}
            <ProjectWorkflowsDialog />
          </GlobalChatHandler>
        )}
      </Box>
    </ThemeProvider>
  )
}
