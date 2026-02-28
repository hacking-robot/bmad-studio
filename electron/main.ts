import { app, BrowserWindow, ipcMain, dialog, Menu, screen, Notification, nativeImage, net } from 'electron'
import { join, dirname, basename, resolve } from 'path'
import { readFile, readdir, stat, writeFile, mkdir } from 'fs/promises'
import { existsSync, watch, FSWatcher, readdirSync, readFileSync, appendFileSync, mkdirSync } from 'fs'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { spawn as spawnChild, spawnSync, execFile, StdioOptions } from 'child_process'
import { promisify } from 'util'
import { autoUpdater } from 'electron-updater'
import { agentManager } from './agentManager'
import { detectTool, detectAllTools, clearDetectionCache } from './cliToolManager'
import { getAugmentedEnv, findBinary } from './envUtils'
import { scanBmadProject } from './bmadScanner'
import { encryptToken, decryptToken, getAuthenticatedUrl } from './tokenManager'

// Set app name (shows in menu bar on macOS)
app.setName('BMad Studio')

let mainWindow: BrowserWindow | null = null
let watchDebounceTimer: NodeJS.Timeout | null = null

// Settings file path in user data directory
const getSettingsPath = () => join(app.getPath('userData'), 'settings.json')

type ProjectType = 'bmm' | 'gds' | 'dashboard'

interface AgentHistoryEntry {
  id: string
  storyId: string
  storyTitle: string
  command: string
  status: 'running' | 'completed' | 'error' | 'interrupted'
  output: string[]
  startTime: number
  endTime?: number
  exitCode?: number
}

interface RecentProject {
  path: string
  projectType: ProjectType
  name: string
  outputFolder?: string
}

type AITool = 'claude-code' | 'cursor' | 'windsurf' | 'roo-code' | 'aider'
type ClaudeModel = 'sonnet' | 'opus'

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  isMaximized?: boolean
}

// Human Review checklist types
interface HumanReviewChecklistItem {
  id: string
  label: string
  description?: string
}

interface StoryReviewState {
  storyId: string
  checkedItems: string[]
  lastUpdated: number
}

// Status change tracking types
type StoryStatus = 'backlog' | 'ready-for-dev' | 'in-progress' | 'review' | 'human-review' | 'done' | 'optional'
type StatusChangeSource = 'user' | 'external'

interface StatusChangeEntry {
  id: string
  storyId: string
  storyTitle: string
  oldStatus: StoryStatus
  newStatus: StoryStatus
  timestamp: number
  source: StatusChangeSource
}

interface AppSettings {
  themeMode: 'light' | 'dark'
  colorTheme: string
  aiTool: AITool
  claudeModel: ClaudeModel
  projectPath: string | null
  projectType: ProjectType | null
  outputFolder: string
  selectedEpicId: number | null
  collapsedColumnsByEpic: Record<string, string[]>
  agentHistory?: AgentHistoryEntry[]
  recentProjects: RecentProject[]
  windowBounds?: WindowBounds
  storyOrder: Record<string, Record<string, string[]>> // { [epicId]: { [status]: [storyIds...] } }
  verboseMode: boolean
  // Git settings
  baseBranch: 'main' | 'master' | 'develop'
  allowDirectEpicMerge: boolean // Allow merging epic branches to base without PR
  bmadInGitignore: boolean // When true, bmad folders are gitignored so branch restrictions are relaxed
  bmadInGitignoreUserSet: boolean // When true, user has manually set bmadInGitignore (don't auto-detect)
  enableEpicBranches: boolean // When true, show epic branch features
  disableGitBranching: boolean // When true, bypass all branch restrictions and hide branch UI
  fullCycleReviewCount: number // 0-5, how many code review rounds in full cycle
  // Human Review feature
  enableHumanReviewColumn: boolean
  humanReviewChecklist: HumanReviewChecklistItem[]
  humanReviewStates: Record<string, StoryReviewState>
  humanReviewStories: string[] // story IDs in human-review (app-level override)
  // Chat settings
  maxThreadMessages: number
  // Status history
  statusHistoryByStory: Record<string, StatusChangeEntry[]>
  globalStatusHistory: StatusChangeEntry[]
  lastViewedStatusHistoryAt: number
  // GitHub token (encrypted)
  githubTokenEncrypted?: string
}

const defaultSettings: AppSettings = {
  themeMode: 'light',
  colorTheme: 'gruvbox-dark',
  aiTool: 'claude-code',
  claudeModel: 'opus',
  projectPath: null,
  projectType: null,
  outputFolder: '_bmad-output',
  selectedEpicId: null,
  collapsedColumnsByEpic: {},
  agentHistory: [],
  recentProjects: [],
  storyOrder: {},
  verboseMode: false,
  // Git defaults
  baseBranch: 'main',
  allowDirectEpicMerge: false,
  bmadInGitignore: false,
  bmadInGitignoreUserSet: false,
  enableEpicBranches: false,
  disableGitBranching: true,
  fullCycleReviewCount: 1,
  // Human Review defaults
  enableHumanReviewColumn: false,
  humanReviewChecklist: [
    { id: 'approved', label: 'Approved', description: 'Story implementation has been reviewed and approved' }
  ],
  humanReviewStates: {},
  humanReviewStories: [],
  // Chat defaults
  maxThreadMessages: 100,
  // Status history defaults
  statusHistoryByStory: {},
  globalStatusHistory: [],
  lastViewedStatusHistoryAt: 0
}

async function loadSettings(): Promise<AppSettings> {
  const settingsPath = getSettingsPath()
  try {
    if (existsSync(settingsPath)) {
      const content = await readFile(settingsPath, 'utf-8')
      if (content.trim()) {
        const parsed = JSON.parse(content)
        return { ...defaultSettings, ...parsed }
      }
    }
  } catch (error) {
    console.error('Failed to load settings:', error)
    // If settings are corrupted, delete the file and return defaults
    try {
      if (existsSync(settingsPath)) {
        const { unlink } = await import('fs/promises')
        await unlink(settingsPath)
        console.log('Deleted corrupted settings file')
      }
    } catch {
      // Ignore deletion errors
    }
  }
  return defaultSettings
}

async function saveSettings(settings: Partial<AppSettings>): Promise<boolean> {
  try {
    const settingsPath = getSettingsPath()
    const dir = app.getPath('userData')

    // Ensure directory exists
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    // Load existing settings and merge
    const existing = await loadSettings()
    const merged = { ...existing, ...settings }

    await writeFile(settingsPath, JSON.stringify(merged, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save settings:', error)
    return false
  }
}

// Minimum window dimensions for usability
const MIN_WINDOW_WIDTH = 800
const MIN_WINDOW_HEIGHT = 600
const DEFAULT_WINDOW_WIDTH = 1400
const DEFAULT_WINDOW_HEIGHT = 900

// Validate and sanitize window bounds
function getValidWindowBounds(savedBounds?: WindowBounds): { x?: number; y?: number; width: number; height: number } {
  const displays = screen.getAllDisplays()

  // Default bounds (centered on primary display)
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
  const defaultBounds = {
    width: Math.min(DEFAULT_WINDOW_WIDTH, screenWidth),
    height: Math.min(DEFAULT_WINDOW_HEIGHT, screenHeight)
  }

  if (!savedBounds) {
    return defaultBounds
  }

  // Validate dimensions - ensure minimum size
  let width = savedBounds.width
  let height = savedBounds.height

  if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) {
    console.log('Window too small, resetting to defaults')
    return defaultBounds
  }

  // Check if window is visible on any display
  const windowRect = {
    x: savedBounds.x,
    y: savedBounds.y,
    width: width,
    height: height
  }

  // Window is considered visible if at least 100x100 pixels are on screen
  const minVisibleArea = 100
  let isVisible = false

  for (const display of displays) {
    const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = display.bounds

    // Calculate overlap
    const overlapX = Math.max(0, Math.min(windowRect.x + windowRect.width, displayX + displayWidth) - Math.max(windowRect.x, displayX))
    const overlapY = Math.max(0, Math.min(windowRect.y + windowRect.height, displayY + displayHeight) - Math.max(windowRect.y, displayY))

    if (overlapX >= minVisibleArea && overlapY >= minVisibleArea) {
      isVisible = true
      break
    }
  }

  if (!isVisible) {
    console.log('Window off-screen, resetting position')
    return defaultBounds
  }

  return {
    x: savedBounds.x,
    y: savedBounds.y,
    width: width,
    height: height
  }
}

// Debounce timer for saving window bounds
let windowBoundsTimer: NodeJS.Timeout | null = null

// Save window bounds with debounce
function saveWindowBounds() {
  if (!mainWindow) return

  if (windowBoundsTimer) {
    clearTimeout(windowBoundsTimer)
  }

  windowBoundsTimer = setTimeout(async () => {
    if (!mainWindow) return

    const isMaximized = mainWindow.isMaximized()
    const bounds = mainWindow.getBounds()

    // Only save non-maximized bounds (so we restore to the right size when un-maximizing)
    if (!isMaximized) {
      await saveSettings({
        windowBounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          isMaximized: false
        }
      })
    } else {
      // Just update the maximized flag, keep the previous bounds
      const settings = await loadSettings()
      if (settings.windowBounds) {
        await saveSettings({
          windowBounds: {
            ...settings.windowBounds,
            isMaximized: true
          }
        })
      }
    }
  }, 500) // Debounce 500ms
}

async function createWindow() {
  // Load saved window bounds
  const settings = await loadSettings()
  const validBounds = getValidWindowBounds(settings.windowBounds)

  const iconPath = join(__dirname, '..', 'build', 'icon.png')
  const appIcon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined

  mainWindow = new BrowserWindow({
    ...validBounds,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 }
  })

  // Set dock icon on macOS (for dev mode)
  if (process.platform === 'darwin' && appIcon) {
    app.dock?.setIcon(appIcon)
  }

  // Restore maximized state if it was saved
  if (settings.windowBounds?.isMaximized) {
    mainWindow.maximize()
  }

  // Listen for window bounds changes
  mainWindow.on('resize', saveWindowBounds)
  mainWindow.on('move', saveWindowBounds)
  mainWindow.on('maximize', saveWindowBounds)
  mainWindow.on('unmaximize', saveWindowBounds)

  // Set main window for agent manager
  agentManager.setMainWindow(mainWindow)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    agentManager.setMainWindow(null)
    mainWindow = null
  })
}

function createMenu() {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.setZoomFactor(1)
              mainWindow.webContents.send('zoom-changed', 100)
            }
          }
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              const currentFactor = mainWindow.webContents.getZoomFactor()
              const newLevel = Math.min(200, Math.round(currentFactor * 100) + 10)
              mainWindow.webContents.setZoomFactor(newLevel / 100)
              mainWindow.webContents.send('zoom-changed', newLevel)
            }
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              const currentFactor = mainWindow.webContents.getZoomFactor()
              const newLevel = Math.max(50, Math.round(currentFactor * 100) - 10)
              mainWindow.webContents.setZoomFactor(newLevel / 100)
              mainWindow.webContents.send('zoom-changed', newLevel)
            }
          }
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const }
            ]
          : [{ role: 'close' as const }])
      ]
    },
    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: isMac ? 'Cmd+/' : 'Ctrl+/',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('show-keyboard-shortcuts')
            }
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// Auto-updater setup
function setupAutoUpdater() {
  // Skip in dev mode
  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('[AutoUpdater] Skipping in dev mode')
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  const sendStatus = (data: { status: string; [key: string]: unknown }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', data)
    }
  }

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    sendStatus({ status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    sendStatus({ status: 'up-to-date' })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({ status: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus({ status: 'ready', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message)
    sendStatus({ status: 'error', message: err.message })
  })

  // Check for updates 5 seconds after startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[AutoUpdater] Initial check failed:', err.message)
    })
  }, 5000)

  // Re-check every hour
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[AutoUpdater] Periodic check failed:', err.message)
    })
  }, 60 * 60 * 1000)
}

// Auto-updater IPC handlers
ipcMain.handle('updater-check', async () => {
  if (process.env.VITE_DEV_SERVER_URL) {
    return { status: 'dev-mode' }
  }
  try {
    await autoUpdater.checkForUpdates()
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Check failed' }
  }
})

ipcMain.handle('updater-download', async () => {
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Download failed' }
  }
})

ipcMain.handle('updater-install', () => {
  autoUpdater.quitAndInstall()
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

app.whenReady().then(() => {
  createWindow()
  createMenu()
  setupAutoUpdater()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Read BMAD config to discover the output folder name
async function readBmadOutputFolder(projectPath: string): Promise<string> {
  try {
    const configPath = join(projectPath, '_bmad', '_memory', 'config.yaml')
    if (!existsSync(configPath)) return '_bmad-output'
    const content = await readFile(configPath, 'utf-8')
    const config = parseYaml(content)
    if (config?.output_folder) {
      // Strip {project-root}/ prefix if present
      const folder = String(config.output_folder).replace(/^\{project-root\}\//, '')
      if (folder) return folder
    }
  } catch {
    // Fall back to default
  }
  return '_bmad-output'
}

// IPC Handlers for file operations

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select BMAD Project Folder'
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const projectPath = result.filePaths[0]

  // Discover the actual output folder name from BMAD config
  let outputFolder = await readBmadOutputFolder(projectPath)
  let bmadOutputPath = join(projectPath, outputFolder)

  // Check if output directory exists - if not, scan for BMAD output folders
  // (handles custom output folder names when config.yaml is missing or unreadable)
  if (!existsSync(bmadOutputPath)) {
    try {
      const entries = await readdir(projectPath)
      for (const entry of entries) {
        if (entry === '_bmad' || entry === 'node_modules' || entry === '.git') continue
        const candidatePath = join(projectPath, entry)
        const stats2 = await stat(candidatePath)
        if (stats2.isDirectory()) {
          // Check for wizard state file (interrupted install) or BMAD output structure (completed install)
          const hasWizardState = existsSync(join(candidatePath, '.bmad-studio-wizard.json'))
          const hasBmadStructure = existsSync(join(candidatePath, 'implementation-artifacts'))
            || existsSync(join(candidatePath, 'planning-artifacts'))
          if (hasWizardState || hasBmadStructure) {
            outputFolder = entry
            bmadOutputPath = candidatePath
            break
          }
        }
      }
    } catch {
      // Ignore scan errors
    }
  }

  // Check if output directory exists - if not, it's a new project for the wizard
  if (!existsSync(bmadOutputPath)) {
    // Still detect project type from _bmad/ modules if they exist
    const bmadPathCheck = join(projectPath, '_bmad')
    const hasGds = existsSync(join(bmadPathCheck, 'gds'))
    const hasBmm = existsSync(join(bmadPathCheck, 'bmm'))
    const detectedType: ProjectType = hasGds ? 'gds' : hasBmm ? 'bmm' : 'dashboard'
    const bmadInstalled = existsSync(bmadPathCheck)
    return { path: projectPath, projectType: detectedType, isNewProject: true, outputFolder, bmadInstalled }
  }

  // Check for required files
  const sprintStatusPath = join(bmadOutputPath, 'implementation-artifacts', 'sprint-status.yaml')
  const bmmEpicsPath = join(bmadOutputPath, 'planning-artifacts', 'epics.md')
  const planningArtifactsPath = join(bmadOutputPath, 'planning-artifacts')

  const hasSprintStatus = existsSync(sprintStatusPath)
  let hasBmmEpics = existsSync(bmmEpicsPath)

  // Also check for sharded epic files (epic-1.md, epic-2.md, etc.)
  if (!hasBmmEpics && existsSync(planningArtifactsPath)) {
    try {
      const planningFiles = readdirSync(planningArtifactsPath)
      hasBmmEpics = planningFiles.some(f => /^epic-\d+\.md$/.test(f))
    } catch { /* ignore */ }
  }

  // Detect project type: GDS > BMM > Dashboard (tools-only, no board module)
  const bmadPath = join(projectPath, '_bmad')
  const hasGdsModule = existsSync(join(bmadPath, 'gds'))
  const hasBmmModule = existsSync(join(bmadPath, 'bmm'))
  let projectType: ProjectType = hasGdsModule ? 'gds' : hasBmmModule ? 'bmm' : 'dashboard'

  // Dashboard projects only need _bmad/ to exist — no sprint-status/epics required
  if (projectType === 'dashboard') {
    const isNewProject = !existsSync(bmadPath)
    return { path: projectPath, projectType: isNewProject ? 'bmm' as ProjectType : projectType, isNewProject, outputFolder, bmadInstalled: existsSync(bmadPath) }
  }

  // Check if this is a new/empty project (board projects need sprint-status and epics)
  const isNewProject = !hasSprintStatus || !hasBmmEpics

  return { path: projectPath, projectType, isNewProject, outputFolder, bmadInstalled: existsSync(bmadPath) }
})

ipcMain.handle('read-file', async (_, filePath: string) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    return { content }
  } catch (error) {
    return { error: `Failed to read file: ${filePath}` }
  }
})

ipcMain.handle('list-directory', async (_, dirPath: string) => {
  try {
    const entries = await readdir(dirPath)
    const files: string[] = []
    const dirs: string[] = []

    for (const entry of entries) {
      const fullPath = join(dirPath, entry)
      const stats = await stat(fullPath)
      if (stats.isFile()) {
        files.push(entry)
      } else if (stats.isDirectory()) {
        dirs.push(entry)
      }
    }

    return { files, dirs }
  } catch (error) {
    return { error: `Failed to list directory: ${dirPath}` }
  }
})

// Settings IPC handlers
ipcMain.handle('get-settings', async () => {
  return await loadSettings()
})

ipcMain.handle('save-settings', async (_, settings: Partial<AppSettings>) => {
  return await saveSettings(settings)
})

ipcMain.handle('set-zoom', async (_, level: number) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const clamped = Math.max(50, Math.min(200, level))
    mainWindow.webContents.setZoomFactor(clamped / 100)
  }
})

// File watching for auto-refresh
let fileWatchers: FSWatcher[] = []

function startWatching(projectPath: string, _projectType: ProjectType, outputFolder: string = '_bmad-output') {
  // Stop any existing watchers
  stopWatching()

  // Watch the entire output folder so documents refresh for all project types (including dashboard)
  const watchPaths: string[] = [
    join(projectPath, outputFolder)
  ]

  for (const watchPath of watchPaths) {
    if (!existsSync(watchPath)) {
      console.log('Watch path does not exist:', watchPath)
      continue
    }

    try {
      const watcher = watch(watchPath, { recursive: true }, (_eventType, filename) => {
        // Only care about .yaml and .md files
        if (!filename || (!filename.endsWith('.yaml') && !filename.endsWith('.md'))) {
          return
        }

        // Debounce to avoid multiple rapid refreshes
        if (watchDebounceTimer) {
          clearTimeout(watchDebounceTimer)
        }

        watchDebounceTimer = setTimeout(() => {
          console.log('File changed:', filename)
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('files-changed')
          }
        }, 500)
      })

      fileWatchers.push(watcher)
      console.log('Started watching:', watchPath)
    } catch (error) {
      console.error('Failed to start file watcher:', error)
    }
  }
}

function stopWatching() {
  if (watchDebounceTimer) {
    clearTimeout(watchDebounceTimer)
    watchDebounceTimer = null
  }

  for (const watcher of fileWatchers) {
    watcher.close()
  }
  if (fileWatchers.length > 0) {
    console.log('Stopped file watchers')
  }
  fileWatchers = []
}

ipcMain.handle('start-watching', async (_, projectPath: string, projectType: ProjectType, outputFolder?: string) => {
  startWatching(projectPath, projectType, outputFolder || '_bmad-output')
  return true
})

ipcMain.handle('stop-watching', async () => {
  stopWatching()
  return true
})

// Clean up watcher and agents when app closes
app.on('before-quit', () => {
  stopWatching()
  agentManager.killAll()
})

// Agent IPC handlers
ipcMain.handle('spawn-agent', async (_, options: {
  storyId: string
  storyTitle: string
  projectPath: string
  initialPrompt: string
}) => {
  console.log('spawn-agent IPC called:', options)
  try {
    const agentId = agentManager.spawn(options)
    console.log('Agent spawned successfully:', agentId)
    return { success: true, agentId }
  } catch (error) {
    console.error('Agent spawn failed:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to spawn agent' }
  }
})

ipcMain.handle('send-agent-input', async (_, agentId: string, input: string) => {
  return agentManager.sendInput(agentId, input)
})

ipcMain.handle('kill-agent', async (_, agentId: string) => {
  return agentManager.kill(agentId)
})

ipcMain.handle('get-agents', async () => {
  return agentManager.getAgents()
})

ipcMain.handle('get-agent', async (_, agentId: string) => {
  return agentManager.getAgent(agentId)
})

ipcMain.handle('get-agent-for-story', async (_, storyId: string) => {
  return agentManager.hasAgentForStory(storyId)
})


// Scan BMAD project files for agents, workflows, version info
ipcMain.handle('scan-bmad', async (_, projectPath: string) => {
  try {
    return await scanBmadProject(projectPath)
  } catch (error) {
    console.error('Failed to scan BMAD project:', error)
    return null
  }
})

// Detect project type (bmm vs gds)
ipcMain.handle('detect-project-type', async (_, projectPath: string, outputFolder?: string) => {
  const folder = outputFolder || '_bmad-output'
  // Check for GDS module directory
  const gdsModulePath = join(projectPath, folder, '_bmad', 'gds')

  if (existsSync(gdsModulePath)) {
    return 'gds'
  }

  // Default to BMM (standard BMAD Method)
  return 'bmm'
})

// Check if bmad folders are in .gitignore
// When bmad is gitignored, the data persists across branch switches since it's not tracked
ipcMain.handle('check-bmad-in-gitignore', async (_, projectPath: string, outputFolder?: string) => {
  try {
    const folder = outputFolder || '_bmad-output'
    const gitignorePath = join(projectPath, '.gitignore')
    if (!existsSync(gitignorePath)) {
      return { inGitignore: false }
    }

    const content = await readFile(gitignorePath, 'utf-8')
    const lines = content.split('\n').map(line => line.trim())

    // Check for patterns that would ignore bmad folders
    const bmadPatterns = [
      'bmad',
      folder,
      folder + '/',
      folder + '/*',
      'docs/planning-artifacts',
      'docs/implementation-artifacts'
    ]

    const inGitignore = lines.some(line => {
      // Skip comments and empty lines
      if (!line || line.startsWith('#')) return false
      // Check if any bmad pattern matches
      return bmadPatterns.some(pattern => line === pattern || line.startsWith(pattern))
    })

    return { inGitignore }
  } catch (error) {
    console.error('Failed to check .gitignore:', error)
    return { inGitignore: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// Agent output file management
const getAgentOutputDir = () => join(app.getPath('userData'), 'agent-outputs')
const getAgentOutputPath = (agentId: string) => join(getAgentOutputDir(), `${agentId}.jsonl`)

// Ensure agent output directory exists
async function ensureAgentOutputDir() {
  const dir = getAgentOutputDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

// Append output lines to agent's file (JSON Lines format)
ipcMain.handle('append-agent-output', async (_, agentId: string, lines: string[]) => {
  try {
    await ensureAgentOutputDir()
    const filePath = getAgentOutputPath(agentId)
    // Each line is a JSON string, write one per line
    const content = lines.map(line => JSON.stringify(line)).join('\n') + '\n'
    await writeFile(filePath, content, { flag: 'a' }) // Append mode
    return true
  } catch (error) {
    console.error('Failed to append agent output:', error)
    return false
  }
})

// Load all output for an agent
ipcMain.handle('load-agent-output', async (_, agentId: string) => {
  try {
    const filePath = getAgentOutputPath(agentId)
    if (!existsSync(filePath)) {
      return []
    }
    const content = await readFile(filePath, 'utf-8')
    // Parse JSON Lines format
    const lines = content.trim().split('\n').filter(Boolean)
    return lines.map(line => {
      try {
        return JSON.parse(line)
      } catch {
        return line // Return as-is if not valid JSON
      }
    })
  } catch (error) {
    console.error('Failed to load agent output:', error)
    return []
  }
})

// Delete output file for an agent
ipcMain.handle('delete-agent-output', async (_, agentId: string) => {
  try {
    const filePath = getAgentOutputPath(agentId)
    if (existsSync(filePath)) {
      const { unlink } = await import('fs/promises')
      await unlink(filePath)
    }
    return true
  } catch (error) {
    console.error('Failed to delete agent output:', error)
    return false
  }
})

// List all agent output files (for cleanup)
ipcMain.handle('list-agent-outputs', async () => {
  try {
    const dir = getAgentOutputDir()
    if (!existsSync(dir)) {
      return []
    }
    const files = await readdir(dir)
    return files
      .filter(f => f.endsWith('.jsonl'))
      .map(f => f.replace('.jsonl', ''))
  } catch (error) {
    console.error('Failed to list agent outputs:', error)
    return []
  }
})

// Git IPC handlers

// Security: Validate git ref names (branch names, commit hashes, tags)
// Only allows alphanumeric, dash, underscore, slash, dot, and caret (for parent refs like HEAD^)
function isValidGitRef(ref: string): boolean {
  if (!ref || ref.length > 256) return false
  // Disallow shell metacharacters and dangerous patterns
  if (/[;&|`$(){}[\]<>!\\'"*?\n\r]/.test(ref)) return false
  // Disallow .. (parent directory traversal in paths, also dangerous in git refs)
  if (ref.includes('..') && !ref.match(/^[a-f0-9]+\.\.[a-f0-9]+$/)) return false
  // Must match safe git ref pattern
  return /^[\w\-./^~@]+$/.test(ref)
}

// Security: Validate file paths and prevent directory traversal
function isValidFilePath(filePath: string): boolean {
  if (!filePath || filePath.length > 1024) return false
  // Disallow shell metacharacters
  if (/[;&|`$(){}[\]<>!\\'"*?\n\r]/.test(filePath)) return false
  // Disallow null bytes
  if (filePath.includes('\0')) return false
  return true
}

// Security: Ensure resolved path stays within project directory
function isPathWithinProject(projectPath: string, filePath: string): boolean {
  const resolvedProject = resolve(projectPath)
  const resolvedFile = resolve(projectPath, filePath)
  return resolvedFile.startsWith(resolvedProject + '/')
}

// Helper to run git commands safely using spawnSync with array arguments
function runGitCommand(args: string[], cwd: string, maxBuffer?: number): { stdout: string; error?: string } {
  // Remove GPG_TTY from environment so gpg-agent uses GUI pinentry instead of terminal
  // This prevents blocking when running from Electron (no TTY available)
  const env = { ...process.env }
  delete env.GPG_TTY
  
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    maxBuffer: maxBuffer || 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    env
  })

  if (result.error) {
    return { stdout: '', error: result.error.message }
  }
  if (result.status !== 0) {
    return { stdout: result.stdout, error: result.stderr || result.stdout?.trim() || 'Git command failed' }
  }
  return { stdout: result.stdout }
}

// Get current git branch name
ipcMain.handle('git-current-branch', async (_, projectPath: string) => {
  const result = runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath)
  if (result.error) {
    return { error: 'Failed to get current branch' }
  }
  return { branch: result.stdout.trim() }
})

// List all local branches
ipcMain.handle('git-list-branches', async (_, projectPath: string) => {
  const result = runGitCommand(['branch', '--format=%(refname:short)'], projectPath)
  if (result.error) {
    return { branches: [], error: 'Failed to list branches' }
  }
  const branches = result.stdout.trim().split('\n').filter(Boolean)
  return { branches }
})

// Checkout a branch
ipcMain.handle('git-checkout-branch', async (_, projectPath: string, branchName: string) => {
  // Security: Validate branch name
  if (!isValidGitRef(branchName)) {
    return { success: false, error: 'Invalid branch name' }
  }

  const result = runGitCommand(['checkout', branchName], projectPath)
  if (result.error) {
    // Parse common git checkout errors for better messages
    if (result.error.includes('Your local changes')) {
      return { success: false, error: 'You have uncommitted changes. Commit or stash them before switching branches.' }
    }
    if (result.error.includes('did not match any')) {
      return { success: false, error: `Branch '${branchName}' does not exist.` }
    }
    return { success: false, error: result.error }
  }
  return { success: true }
})

// Create and switch to a new branch
ipcMain.handle('git-create-branch', async (_, projectPath: string, branchName: string, fromBranch?: string) => {
  // Security: Validate branch name
  if (!isValidGitRef(branchName)) {
    return { success: false, error: 'Invalid branch name' }
  }
  // Security: Validate fromBranch if provided
  if (fromBranch && !isValidGitRef(fromBranch)) {
    return { success: false, error: 'Invalid source branch name' }
  }

  // If fromBranch is specified, create from that branch; otherwise create from current branch
  let args = fromBranch ? ['checkout', '-b', branchName, fromBranch] : ['checkout', '-b', branchName]
  let result = runGitCommand(args, projectPath)
  if (result.error) {
    // If fromBranch was specified but is not a valid commit (e.g. empty repo with no commits),
    // retry without specifying the source branch
    if (fromBranch && (result.error.includes('not a commit') || result.error.includes('not a valid'))) {
      args = ['checkout', '-b', branchName]
      result = runGitCommand(args, projectPath)
    }
  }
  if (result.error) {
    // Parse common git checkout -b errors for better messages
    if (result.error.includes('already exists')) {
      return { success: false, error: `Branch '${branchName}' already exists.`, alreadyExists: true }
    }
    if (result.error.includes('Your local changes')) {
      return { success: false, error: 'You have uncommitted changes. Commit or stash them before creating a new branch.' }
    }
    return { success: false, error: result.error }
  }
  return { success: true }
})

// Check if a branch exists
ipcMain.handle('git-branch-exists', async (_, projectPath: string, branchName: string) => {
  // Security: Validate branch name
  if (!isValidGitRef(branchName)) {
    return { exists: false }
  }
  const result = runGitCommand(['rev-parse', '--verify', branchName], projectPath)
  return { exists: !result.error }
})

// Check if there are uncommitted changes
ipcMain.handle('git-has-changes', async (_, projectPath: string) => {
  const result = runGitCommand(['status', '--porcelain'], projectPath)
  if (result.error) {
    return { hasChanges: false, error: result.error }
  }
  const hasChanges = result.stdout.trim().length > 0
  return { hasChanges }
})

// Stage all changes and commit with a message
ipcMain.handle('git-commit', async (_, projectPath: string, message: string, noVerify?: boolean) => {
  // Security: Basic validation of commit message
  if (!message || message.length > 1000) {
    return { success: false, error: 'Invalid commit message' }
  }

  // First, stage all changes
  const addResult = runGitCommand(['add', '.'], projectPath)
  if (addResult.error) {
    return { success: false, error: `Failed to stage changes: ${addResult.error}` }
  }

  // Then commit (optionally bypassing hooks for automated workflows)
  const commitArgs = ['commit', '-m', message]
  if (noVerify) {
    commitArgs.push('--no-verify')
  }
  const commitResult = runGitCommand(commitArgs, projectPath)

  if (commitResult.error) {
    // Check for common errors
    if (commitResult.error.includes('nothing to commit')) {
      return { success: false, error: 'Nothing to commit' }
    }
    return { success: false, error: commitResult.error }
  }

  return { success: true }
})

// Check if a branch has recent activity (recently modified files or recent commits)
ipcMain.handle('git-branch-activity', async (_, projectPath: string, branchName: string) => {
  // Security: Validate branch name
  if (!isValidGitRef(branchName)) {
    return {
      isOnBranch: false,
      hasRecentFileChanges: false,
      lastCommitTime: null,
      hasRecentCommit: false,
      isActive: false
    }
  }

  // Get current branch
  const currentBranchResult = runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath)
  if (currentBranchResult.error) {
    return {
      isOnBranch: false,
      hasRecentFileChanges: false,
      lastCommitTime: null,
      hasRecentCommit: false,
      isActive: false
    }
  }

  const currentBranch = currentBranchResult.stdout.trim()
  const isOnBranch = currentBranch === branchName
  const oneMinuteAgo = Date.now() - (1 * 60 * 1000)

  // Check for recently modified files (only if we're on the branch)
  let hasRecentFileChanges = false
  if (isOnBranch) {
    // Get list of modified/new files from git status
    const statusResult = runGitCommand(['status', '--porcelain'], projectPath)
    const status = statusResult.stdout.trim()

    if (status.length > 0) {
      // Check modification time of changed files
      const changedFiles = status.split('\n').map(line => line.substring(3).trim())
      for (const file of changedFiles) {
        // Security: Validate file path stays within project
        if (!isValidFilePath(file) || !isPathWithinProject(projectPath, file)) {
          continue
        }
        try {
          const filePath = join(projectPath, file)
          if (existsSync(filePath)) {
            const stats = await stat(filePath)
            if (stats.mtimeMs > oneMinuteAgo) {
              hasRecentFileChanges = true
              break
            }
          }
        } catch {
          // File might not exist (deleted)
        }
      }
    }
  }

  // Get the last commit timestamp on the branch
  let lastCommitTime: number | null = null
  const logResult = runGitCommand(['log', '-1', '--format=%ct', branchName], projectPath)
  if (!logResult.error && logResult.stdout.trim()) {
    lastCommitTime = parseInt(logResult.stdout.trim(), 10) * 1000 // Convert to milliseconds
  }

  const hasRecentCommit = lastCommitTime !== null && lastCommitTime > oneMinuteAgo

  return {
    isOnBranch,
    hasRecentFileChanges,
    lastCommitTime,
    hasRecentCommit,
    isActive: hasRecentFileChanges || hasRecentCommit
  }
})

// Get the default branch (main or master)
ipcMain.handle('git-default-branch', async (_, projectPath: string) => {
  // Try to get the default branch from remote
  const remoteResult = runGitCommand(['remote', 'show', 'origin'], projectPath)
  if (!remoteResult.error) {
    const match = remoteResult.stdout.match(/HEAD branch: (.+)/)
    if (match) {
      return { branch: match[1].trim() }
    }
  }

  // Fallback: check if main or master exists
  const mainResult = runGitCommand(['rev-parse', '--verify', 'main'], projectPath)
  if (!mainResult.error) {
    return { branch: 'main' }
  }

  const masterResult = runGitCommand(['rev-parse', '--verify', 'master'], projectPath)
  if (!masterResult.error) {
    return { branch: 'master' }
  }

  return { error: 'Could not determine default branch' }
})

// Get list of changed files between a feature branch and default branch
ipcMain.handle('git-changed-files', async (_, projectPath: string, baseBranch: string, featureBranch?: string) => {
  // Security: Validate branch names
  if (!isValidGitRef(baseBranch)) {
    return { error: 'Invalid base branch name' }
  }
  const targetBranch = featureBranch || 'HEAD'
  if (featureBranch && !isValidGitRef(featureBranch)) {
    return { error: 'Invalid feature branch name' }
  }

  // Get the merge base to find where branches diverged
  const mergeBaseResult = runGitCommand(['merge-base', baseBranch, targetBranch], projectPath)
  if (mergeBaseResult.error) {
    return { error: 'Failed to get merge base' }
  }
  const mergeBase = mergeBaseResult.stdout.trim()

  // Get the current branch to check if we should include uncommitted changes
  const currentBranchResult = runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath)
  const currentBranch = currentBranchResult.stdout.trim()
  const isOnBranch = currentBranch === featureBranch

  // When on the target branch, compare merge-base to working directory to include uncommitted changes
  // Otherwise compare merge-base to the branch's committed state
  const diffTarget = isOnBranch ? '' : targetBranch
  const diffArgs = diffTarget
    ? ['diff', '--name-status', mergeBase, diffTarget]
    : ['diff', '--name-status', mergeBase]

  const diffResult = runGitCommand(diffArgs, projectPath)
  if (diffResult.error) {
    return { error: 'Failed to get changed files' }
  }

  // Build a map of files from committed diff
  const fileMap = new Map<string, { status: string; mtime: number | null; lastCommitTime: number | null }>()

  // Parse the diff output
  const diffLines = diffResult.stdout.trim().split('\n').filter(Boolean)
  for (const line of diffLines) {
    const [status, ...pathParts] = line.split('\t')
    const filePath = pathParts.join('\t')
    if (filePath) {
      fileMap.set(filePath, { status, mtime: null, lastCommitTime: null })
    }
  }

  // Batch-fetch last commit times for all files in a single git command
  // instead of spawning one git process per file (which blocks the main thread with spawnSync)
  const commitTimeMap = new Map<string, number>()
  const allPaths = Array.from(fileMap.keys())
  if (allPaths.length > 0) {
    // git log with --name-only outputs: timestamp\n\nfile1\nfile2\n\ntimestamp\n\nfile3\n...
    // We parse this to build a map of file -> most recent commit timestamp
    const logResult = runGitCommand(
      ['log', '--format=%ct', '--name-only', targetBranch],
      projectPath,
      50 * 1024 * 1024
    )
    if (!logResult.error && logResult.stdout) {
      const pathSet = new Set(allPaths)
      let currentTimestamp = 0
      for (const line of logResult.stdout.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        // Lines that are purely digits are timestamps
        if (/^\d+$/.test(trimmed)) {
          currentTimestamp = parseInt(trimmed, 10) * 1000
        } else if (currentTimestamp && pathSet.has(trimmed) && !commitTimeMap.has(trimmed)) {
          // First occurrence = most recent commit for this file
          commitTimeMap.set(trimmed, currentTimestamp)
          pathSet.delete(trimmed)
          // Stop early once all files are resolved
          if (pathSet.size === 0) break
        }
      }
    }
  }

  // Get file modification times (async stat calls are fast, no git process needed)
  const files = await Promise.all(
    Array.from(fileMap.entries()).map(async ([filePath, data]) => {
      // Security: Validate file path
      if (!isValidFilePath(filePath) || !isPathWithinProject(projectPath, filePath)) {
        return {
          status: data.status as 'A' | 'M' | 'D' | 'R' | 'C',
          path: filePath,
          mtime: null,
          lastCommitTime: null
        }
      }

      let mtime: number | null = null
      if (isOnBranch && data.status !== 'D') {
        try {
          const fullPath = join(projectPath, filePath)
          if (existsSync(fullPath)) {
            const stats = await stat(fullPath)
            mtime = stats.mtimeMs
          }
        } catch {
          // File might not exist
        }
      }

      return {
        status: data.status as 'A' | 'M' | 'D' | 'R' | 'C',
        path: filePath,
        mtime,
        lastCommitTime: commitTimeMap.get(filePath) ?? null
      }
    })
  )

  return { files, mergeBase }
})

// Get file content at a specific commit
ipcMain.handle('git-file-content', async (_, projectPath: string, filePath: string, commit: string) => {
  // Security: Validate inputs
  if (!isValidFilePath(filePath)) {
    return { content: '' }
  }
  if (!isValidGitRef(commit)) {
    return { content: '' }
  }

  const result = runGitCommand(['show', `${commit}:${filePath}`], projectPath)
  return { content: result.stdout || '' }
})

// Get current file content from working directory
ipcMain.handle('git-working-file-content', async (_, projectPath: string, filePath: string) => {
  // Security: Validate file path and prevent directory traversal
  if (!isValidFilePath(filePath) || !isPathWithinProject(projectPath, filePath)) {
    return { content: '' }
  }

  try {
    const fullPath = join(projectPath, filePath)
    const content = await readFile(fullPath, 'utf-8')
    return { content }
  } catch {
    return { content: '' }
  }
})

// Get commit history for a branch (since it diverged from base)
ipcMain.handle('git-commit-history', async (_, projectPath: string, baseBranch: string, featureBranch: string) => {
  // Security: Validate branch names
  if (!isValidGitRef(baseBranch) || !isValidGitRef(featureBranch)) {
    return { commits: [], error: 'Invalid branch name' }
  }

  // Get merge base
  const mergeBaseResult = runGitCommand(['merge-base', baseBranch, featureBranch], projectPath)
  if (mergeBaseResult.error) {
    return { commits: [], error: 'Failed to get merge base' }
  }
  const mergeBase = mergeBaseResult.stdout.trim()

  // Get commits from merge-base to feature branch
  // Format: hash|author|timestamp|subject
  const logResult = runGitCommand(['log', '--format=%H|%an|%at|%s', `${mergeBase}..${featureBranch}`], projectPath)
  if (logResult.error) {
    return { commits: [], error: 'Failed to get commit history' }
  }

  const logOutput = logResult.stdout.trim()
  if (!logOutput) {
    return { commits: [] }
  }

  const commits = logOutput.split('\n').map(line => {
    const [hash, author, timestamp, subject] = line.split('|')
    return {
      hash,
      author,
      timestamp: parseInt(timestamp, 10) * 1000,
      subject
    }
  })

  return { commits }
})

// Get diff for a specific commit
ipcMain.handle('git-commit-diff', async (_, projectPath: string, commitHash: string) => {
  // Security: Validate commit hash
  if (!isValidGitRef(commitHash)) {
    return { files: [], error: 'Invalid commit hash' }
  }

  // Get files changed in this commit with status
  const diffResult = runGitCommand(['diff-tree', '--no-commit-id', '--name-status', '-r', commitHash], projectPath)
  if (diffResult.error) {
    return { files: [], error: 'Failed to get commit diff' }
  }

  const diffOutput = diffResult.stdout.trim()
  if (!diffOutput) {
    return { files: [] }
  }

  const files = diffOutput.split('\n').map(line => {
    const [status, ...pathParts] = line.split('\t')
    return {
      status: status as 'A' | 'M' | 'D' | 'R' | 'C',
      path: pathParts.join('\t')
    }
  })

  return { files }
})

// Get file content at a specific commit's parent (for diff comparison)
ipcMain.handle('git-file-at-parent', async (_, projectPath: string, filePath: string, commitHash: string) => {
  // Security: Validate inputs
  if (!isValidFilePath(filePath) || !isValidGitRef(commitHash)) {
    return { content: '' }
  }

  const result = runGitCommand(['show', `${commitHash}^:${filePath}`], projectPath)
  return { content: result.stdout || '' }
})

// Get file content at a specific commit
ipcMain.handle('git-file-at-commit', async (_, projectPath: string, filePath: string, commitHash: string) => {
  // Security: Validate inputs
  if (!isValidFilePath(filePath) || !isValidGitRef(commitHash)) {
    return { content: '' }
  }

  const result = runGitCommand(['show', `${commitHash}:${filePath}`], projectPath)
  return { content: result.stdout || '' }
})

// Check if a branch is merged into another branch
ipcMain.handle('git-is-merged', async (_, projectPath: string, branchToCheck: string, targetBranch: string) => {
  // Security: Validate branch names
  if (!isValidGitRef(branchToCheck) || !isValidGitRef(targetBranch)) {
    return { merged: false, error: 'Invalid branch name' }
  }

  // Use merge-base --is-ancestor to check if branchToCheck is merged into targetBranch
  // Exit code 0 = merged (is ancestor), 1 = not merged
  const result = spawnSync('git', ['merge-base', '--is-ancestor', branchToCheck, targetBranch], {
    cwd: projectPath,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  })

  if (result.error) {
    return { merged: false, error: result.error.message }
  }

  // Exit code 0 means branchToCheck is an ancestor of targetBranch (i.e., merged)
  return { merged: result.status === 0 }
})

// Merge a branch into the current branch
ipcMain.handle('git-merge-branch', async (_, projectPath: string, branchToMerge: string) => {
  // Security: Validate branch name
  if (!isValidGitRef(branchToMerge)) {
    return { success: false, error: 'Invalid branch name' }
  }

  // Check for uncommitted changes first
  const changesResult = runGitCommand(['status', '--porcelain'], projectPath)
  if (changesResult.error) {
    return { success: false, error: 'Failed to check for changes' }
  }
  if (changesResult.stdout.trim().length > 0) {
    return { success: false, error: 'You have uncommitted changes. Commit or stash them before merging.' }
  }

  // Perform the merge with --no-edit (use default merge message) and --no-ff (always create merge commit)
  const mergeResult = spawnSync('git', ['merge', branchToMerge, '--no-edit', '--no-ff'], {
    cwd: projectPath,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  })

  if (mergeResult.error) {
    return { success: false, error: mergeResult.error.message }
  }

  // Check for merge conflicts (exit code 1 with conflict markers)
  if (mergeResult.status !== 0) {
    // Check if it's a conflict
    const statusAfter = runGitCommand(['status', '--porcelain'], projectPath)
    const hasConflicts = statusAfter.stdout.includes('UU') || statusAfter.stdout.includes('AA') || statusAfter.stdout.includes('DD')

    if (hasConflicts) {
      // Abort the merge
      runGitCommand(['merge', '--abort'], projectPath)
      return { success: false, error: 'Merge has conflicts - resolve in terminal', hasConflicts: true }
    }

    // Some other error
    return { success: false, error: mergeResult.stderr || 'Merge failed' }
  }

  return { success: true }
})

// Update story status in sprint-status.yaml
ipcMain.handle('update-story-status', async (_, filePath: string, newStatus: string) => {
  try {
    // Extract story key from file path (filename without .md)
    // Story path: {projectPath}/{outputFolder}/implementation-artifacts/{story-key}.md
    const storyKey = basename(filePath, '.md')

    // Derive sprint-status.yaml path from story file path
    // Sprint-status.yaml is in the same directory as story files (implementation-artifacts/)
    const implementationDir = dirname(filePath)
    const sprintStatusPath = join(implementationDir, 'sprint-status.yaml')

    if (!existsSync(sprintStatusPath)) {
      return { success: false, error: 'sprint-status.yaml not found' }
    }

    // Read and parse sprint-status.yaml
    const content = await readFile(sprintStatusPath, 'utf-8')
    const sprintStatus = parseYaml(content)

    // Validate and normalize the status before writing
    const { normalizeStatus } = await import('../src/types')
    const normalized = normalizeStatus(newStatus)
    if (!normalized) {
      return { success: false, error: `Unrecognized status: "${newStatus}"` }
    }

    // Update the story status in development_status section
    if (!sprintStatus.development_status) {
      sprintStatus.development_status = {}
    }
    sprintStatus.development_status[storyKey] = normalized

    // Write the file back with proper YAML formatting
    const updatedContent = stringifyYaml(sprintStatus, {
      lineWidth: 0, // Don't wrap lines
      nullStr: '' // Use empty string for null values
    })
    await writeFile(sprintStatusPath, updatedContent, 'utf-8')

    return { success: true }
  } catch (error) {
    console.error('Failed to update story status:', error)
    return { success: false, error: String(error) }
  }
})

// Shared helper: find a task/subtask line within ## Tasks section
function findTaskLine(lines: string[], taskIndex: number, subtaskIndex: number): {
  lineIndex: number
  sectionStart: number
  sectionEnd: number
} | null {
  let inTasksSection = false
  let sectionStart = -1
  let sectionEnd = lines.length
  let currentTaskIdx = -1
  let currentSubtaskIdx = -1
  let targetLine = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('## Tasks')) {
      inTasksSection = true
      sectionStart = i
      continue
    }
    if (inTasksSection && (line.startsWith('## ') || line.startsWith('# '))) {
      sectionEnd = i
      break
    }

    if (!inTasksSection) continue

    // Match main task: - [x] or - [ ]
    if (/^- \[[ xX]\]\s+/.test(line)) {
      currentTaskIdx++
      currentSubtaskIdx = -1

      if (currentTaskIdx === taskIndex && subtaskIndex === -1) {
        targetLine = i
        break
      }
    }

    // Match subtask: indented - [x] or - [ ]
    if (/^\s+- \[[ xX]\]\s+/.test(line) && currentTaskIdx === taskIndex) {
      currentSubtaskIdx++
      if (currentSubtaskIdx === subtaskIndex) {
        targetLine = i
        break
      }
    }
  }

  if (sectionStart === -1 || targetLine === -1) return null
  return { lineIndex: targetLine, sectionStart, sectionEnd }
}

// Toggle a task checkbox in a story markdown file
ipcMain.handle('toggle-story-task', async (_, filePath: string, taskIndex: number, subtaskIndex: number) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')

    const result = findTaskLine(lines, taskIndex, subtaskIndex)
    if (!result) {
      return { success: false, error: 'Task not found' }
    }

    // Toggle the checkbox
    const line = lines[result.lineIndex]
    if (/\[x\]/i.test(line)) {
      lines[result.lineIndex] = line.replace(/\[[xX]\]/, '[ ]')
    } else {
      lines[result.lineIndex] = line.replace(/\[ \]/, '[x]')
    }

    await writeFile(filePath, lines.join('\n'), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('Failed to toggle story task:', error)
    return { success: false, error: String(error) }
  }
})

// Add a new task or subtask to a story markdown file
ipcMain.handle('add-story-task', async (_, filePath: string, parentTaskIndex: number, title: string) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')

    // Find the Tasks section boundaries
    let sectionStart = -1
    let sectionEnd = lines.length
    let lastTaskLine = -1
    let currentTaskIdx = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('## Tasks')) {
        sectionStart = i
        continue
      }
      if (sectionStart !== -1 && (line.startsWith('## ') || line.startsWith('# '))) {
        sectionEnd = i
        break
      }
      if (sectionStart === -1) continue

      if (/^- \[[ xX]\]\s+/.test(line)) {
        currentTaskIdx++
        lastTaskLine = i
      }
      if (/^\s+- \[[ xX]\]\s+/.test(line)) {
        lastTaskLine = i
      }
    }

    if (parentTaskIndex === -1) {
      // Add top-level task
      const newLine = `- [ ] ${title}`
      if (sectionStart === -1) {
        // No ## Tasks section - create one
        // Insert before the next ## section or at end
        let insertAt = lines.length
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('## Dev Agent Record') || lines[i].startsWith('## Development Record')) {
            insertAt = i
            break
          }
        }
        lines.splice(insertAt, 0, '', '## Tasks', '', newLine, '')
      } else if (lastTaskLine === -1) {
        // Section exists but no tasks yet - insert after section header
        lines.splice(sectionStart + 1, 0, '', newLine)
      } else {
        // Insert after the last task/subtask line in the section
        lines.splice(lastTaskLine + 1, 0, newLine)
      }
    } else {
      // Add subtask under a specific parent task
      let parentLine = -1
      let insertAfter = -1
      let tIdx = -1

      for (let i = sectionStart + 1; i < sectionEnd; i++) {
        const line = lines[i]
        if (/^- \[[ xX]\]\s+/.test(line)) {
          tIdx++
          if (tIdx === parentTaskIndex) {
            parentLine = i
            insertAfter = i
            // Continue to find the last subtask of this parent
            for (let j = i + 1; j < sectionEnd; j++) {
              if (/^\s+- \[[ xX]\]\s+/.test(lines[j])) {
                insertAfter = j
              } else if (/^- \[[ xX]\]\s+/.test(lines[j]) || lines[j].startsWith('## ') || lines[j].startsWith('# ')) {
                break
              }
            }
            break
          }
        }
      }

      if (parentLine === -1) {
        return { success: false, error: 'Parent task not found' }
      }

      const newLine = `  - [ ] ${title}`
      lines.splice(insertAfter + 1, 0, newLine)
    }

    await writeFile(filePath, lines.join('\n'), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('Failed to add story task:', error)
    return { success: false, error: String(error) }
  }
})

// Edit a task or subtask title in a story markdown file
ipcMain.handle('edit-story-task', async (_, filePath: string, taskIndex: number, subtaskIndex: number, newTitle: string) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')

    const result = findTaskLine(lines, taskIndex, subtaskIndex)
    if (!result) {
      return { success: false, error: 'Task not found' }
    }

    const line = lines[result.lineIndex]
    // Preserve indentation, checkbox state, and optional "Task N:" prefix
    // Pattern: (indent)(- [x/X/ ]) (optional "Task N: ")(title text)
    const match = line.match(/^(\s*- \[[ xX]\]\s+)((?:Task\s+\d+:\s+)?)(.*)$/)
    if (!match) {
      return { success: false, error: 'Could not parse task line' }
    }

    lines[result.lineIndex] = match[1] + match[2] + newTitle

    await writeFile(filePath, lines.join('\n'), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('Failed to edit story task:', error)
    return { success: false, error: String(error) }
  }
})

// Delete a task or subtask from a story markdown file
ipcMain.handle('delete-story-task', async (_, filePath: string, taskIndex: number, subtaskIndex: number) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')

    if (subtaskIndex >= 0) {
      // Delete a single subtask line
      const result = findTaskLine(lines, taskIndex, subtaskIndex)
      if (!result) {
        return { success: false, error: 'Subtask not found' }
      }
      lines.splice(result.lineIndex, 1)
    } else {
      // Delete a top-level task and all its subtasks
      const result = findTaskLine(lines, taskIndex, -1)
      if (!result) {
        return { success: false, error: 'Task not found' }
      }

      // Count how many subtask lines follow this task
      let deleteCount = 1
      for (let i = result.lineIndex + 1; i < result.sectionEnd; i++) {
        if (/^\s+- \[[ xX]\]\s+/.test(lines[i])) {
          deleteCount++
        } else {
          break
        }
      }

      lines.splice(result.lineIndex, deleteCount)
    }

    await writeFile(filePath, lines.join('\n'), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete story task:', error)
    return { success: false, error: String(error) }
  }
})

// Update story development record content (replaces entire section)
ipcMain.handle('update-story-development-record', async (_, filePath: string, newContent: string) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')

    // Find the Development Record section
    let sectionStart = -1
    let sectionEnd = lines.length

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('## Dev Agent Record') || line.startsWith('## Development Record')) {
        sectionStart = i
        continue
      }
      if (sectionStart !== -1 && sectionStart !== i && (line.startsWith('## ') || line.startsWith('# '))) {
        sectionEnd = i
        break
      }
    }

    if (sectionStart === -1) {
      // No Development Record section exists — insert at end
      const insertContent = `\n## Development Record\n\n${newContent}\n`
      const result = [...lines]
      result.splice(lines.length, 0, ...insertContent.split('\n'))
      await writeFile(filePath, result.join('\n'), 'utf-8')
      return { success: true }
    }

    const heading = lines[sectionStart]
    const replacement = [
      heading,
      '',
      ...newContent.split('\n'),
    ]

    const result = [
      ...lines.slice(0, sectionStart),
      ...replacement,
      ...lines.slice(sectionEnd)
    ]

    await writeFile(filePath, result.join('\n'), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('Failed to update development record:', error)
    return { success: false, error: String(error) }
  }
})

// Show native notification
ipcMain.handle('show-notification', async (_, title: string, body: string) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
})

// Chat thread storage (project-scoped via path hash)
import { createHash } from 'crypto'

function hashProjectPath(projectPath: string): string {
  return createHash('md5').update(projectPath).digest('hex').slice(0, 12)
}
const getChatThreadsDir = (projectPath: string) =>
  join(app.getPath('userData'), 'chat-threads', hashProjectPath(projectPath))
const getChatThreadPath = (projectPath: string, agentId: string) =>
  join(getChatThreadsDir(projectPath), `${agentId}.json`)

async function ensureChatThreadsDir(projectPath: string) {
  const dir = getChatThreadsDir(projectPath)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

// Chat thread IPC handlers
ipcMain.handle('load-chat-thread', async (_, projectPath: string, agentId: string) => {
  try {
    const filePath = getChatThreadPath(projectPath, agentId)
    if (!existsSync(filePath)) {
      return null
    }
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error('Failed to load chat thread:', error)
    return null
  }
})

ipcMain.handle('save-chat-thread', async (_, projectPath: string, agentId: string, thread: unknown) => {
  try {
    await ensureChatThreadsDir(projectPath)
    const filePath = getChatThreadPath(projectPath, agentId)
    await writeFile(filePath, JSON.stringify(thread, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save chat thread:', error)
    return false
  }
})

ipcMain.handle('clear-chat-thread', async (_, projectPath: string, agentId: string) => {
  try {
    const filePath = getChatThreadPath(projectPath, agentId)
    if (existsSync(filePath)) {
      const { unlink } = await import('fs/promises')
      await unlink(filePath)
    }
    return true
  } catch (error) {
    console.error('Failed to clear chat thread:', error)
    return false
  }
})

ipcMain.handle('list-chat-threads', async (_, projectPath: string) => {
  try {
    const dir = getChatThreadsDir(projectPath)
    if (!existsSync(dir)) {
      return []
    }
    const files = await readdir(dir)
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  } catch (error) {
    console.error('Failed to list chat threads:', error)
    return []
  }
})

// Story chat history storage (linked to stories, persisted in project and user data)
import { homedir } from 'os'

interface StoryChatHistory {
  storyId: string
  storyTitle: string
  sessions: unknown[]
  lastUpdated: number
}

const getProjectStoryChatDir = (projectPath: string, outputFolder: string = '_bmad-output') => join(projectPath, outputFolder, 'chat-history')
const getProjectStoryChatPath = (projectPath: string, storyId: string, outputFolder: string = '_bmad-output') => join(getProjectStoryChatDir(projectPath, outputFolder), `${storyId}.json`)
const getUserStoryChatDir = () => join(homedir(), '.config', 'bmad-studio', 'story-chats')
const getUserStoryChatPath = (storyId: string) => join(getUserStoryChatDir(), `${storyId}.json`)

// Ensure story chat directories exist
async function ensureStoryChatDirs(projectPath: string, outputFolder: string = '_bmad-output') {
  const projectDir = getProjectStoryChatDir(projectPath, outputFolder)
  const userDir = getUserStoryChatDir()
  if (!existsSync(projectDir)) {
    await mkdir(projectDir, { recursive: true })
  }
  if (!existsSync(userDir)) {
    await mkdir(userDir, { recursive: true })
  }
}

// Save story chat history to both project and user data locations
ipcMain.handle('save-story-chat-history', async (_, projectPath: string, storyId: string, history: StoryChatHistory, outputFolder?: string) => {
  try {
    const folder = outputFolder || '_bmad-output'
    await ensureStoryChatDirs(projectPath, folder)
    const projectFilePath = getProjectStoryChatPath(projectPath, storyId, folder)
    const userFilePath = getUserStoryChatPath(storyId)
    const content = JSON.stringify(history, null, 2)

    // Save to both locations
    await Promise.all([
      writeFile(projectFilePath, content),
      writeFile(userFilePath, content)
    ])
    return true
  } catch (error) {
    console.error('Failed to save story chat history:', error)
    return false
  }
})

// Load story chat history - user dir first (primary), fallback to project dir (backup)
// If found in project dir but not user dir, sync to user dir
ipcMain.handle('load-story-chat-history', async (_, projectPath: string, storyId: string, outputFolder?: string) => {
  try {
    const folder = outputFolder || '_bmad-output'
    const projectFilePath = getProjectStoryChatPath(projectPath, storyId, folder)
    const userFilePath = getUserStoryChatPath(storyId)

    // Try user directory first (primary)
    if (existsSync(userFilePath)) {
      const content = await readFile(userFilePath, 'utf-8')
      return JSON.parse(content) as StoryChatHistory
    }

    // Fallback to project directory (backup)
    if (existsSync(projectFilePath)) {
      const content = await readFile(projectFilePath, 'utf-8')
      const history = JSON.parse(content) as StoryChatHistory

      // Sync to user directory for future access
      try {
        const userDir = getUserStoryChatDir()
        if (!existsSync(userDir)) {
          await mkdir(userDir, { recursive: true })
        }
        await writeFile(userFilePath, content)
        console.log('Synced story chat history from project to user data:', storyId)
      } catch (syncError) {
        console.error('Failed to sync story chat history to user data:', syncError)
      }

      return history
    }

    return null
  } catch (error) {
    console.error('Failed to load story chat history:', error)
    return null
  }
})

// List all story IDs that have chat history
ipcMain.handle('list-story-chat-histories', async (_, projectPath: string, outputFolder?: string) => {
  try {
    const folder = outputFolder || '_bmad-output'
    const storyIds = new Set<string>()

    // Check project directory
    const projectDir = getProjectStoryChatDir(projectPath, folder)
    if (existsSync(projectDir)) {
      const files = await readdir(projectDir)
      files.filter(f => f.endsWith('.json')).forEach(f => storyIds.add(f.replace('.json', '')))
    }

    // Check user directory
    const userDir = getUserStoryChatDir()
    if (existsSync(userDir)) {
      const files = await readdir(userDir)
      files.filter(f => f.endsWith('.json')).forEach(f => storyIds.add(f.replace('.json', '')))
    }

    return Array.from(storyIds)
  } catch (error) {
    console.error('Failed to list story chat histories:', error)
    return []
  }
})

// Project cost tracking - append-only ledger per project
const getProjectCostPath = (projectPath: string, outputFolder: string = '_bmad-output') => join(projectPath, outputFolder, 'project-costs.json')

ipcMain.handle('append-project-cost', async (_, projectPath: string, entry: unknown, outputFolder?: string) => {
  try {
    const folder = outputFolder || '_bmad-output'
    const costPath = getProjectCostPath(projectPath, folder)
    const dir = join(projectPath, folder)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    let entries: unknown[] = []
    if (existsSync(costPath)) {
      try {
        const content = await readFile(costPath, 'utf-8')
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed)) entries = parsed
      } catch {
        // Corrupted file, start fresh
      }
    }

    entries.push(entry)
    await writeFile(costPath, JSON.stringify(entries, null, 2))
    return true
  } catch (error) {
    console.error('Failed to append project cost:', error)
    return false
  }
})

ipcMain.handle('load-project-costs', async (_, projectPath: string, outputFolder?: string) => {
  try {
    const folder = outputFolder || '_bmad-output'
    const costPath = getProjectCostPath(projectPath, folder)
    if (!existsSync(costPath)) {
      return []
    }
    const content = await readFile(costPath, 'utf-8')
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Failed to load project costs:', error)
    return []
  }
})

// Chat agent - simple spawn per message
import { chatAgentManager } from './agentManager'

// Set mainWindow for chatAgentManager when app is ready
app.whenReady().then(() => {
  chatAgentManager.setMainWindow(mainWindow)
})

ipcMain.handle('chat-load-agent', async (_, options: {
  agentId: string
  projectPath: string
  projectType: 'bmm' | 'gds' | 'dashboard'
  tool?: AITool
  model?: ClaudeModel
  customEndpoint?: { name: string; baseUrl: string; apiKey: string; modelName: string } | null
  agentCommand?: string
}) => {
  chatAgentManager.setMainWindow(mainWindow)
  return chatAgentManager.loadAgent(options)
})

ipcMain.handle('chat-send-message', async (_, options: {
  agentId: string
  projectPath: string
  message: string
  sessionId?: string
  tool?: AITool
  model?: ClaudeModel
  customEndpoint?: { name: string; baseUrl: string; apiKey: string; modelName: string } | null
}) => {
  chatAgentManager.setMainWindow(mainWindow)
  return chatAgentManager.sendMessage(options)
})

ipcMain.handle('chat-cancel-message', async (_, agentId: string) => {
  return chatAgentManager.cancelMessage(agentId)
})

ipcMain.handle('chat-is-agent-running', async (_, agentId: string) => {
  return chatAgentManager.isRunning(agentId)
})

ipcMain.handle('chat-has-session', async () => {
  return chatAgentManager.hasSession()
})

ipcMain.handle('chat-is-session-ready', async () => {
  return chatAgentManager.isSessionReady()
})

ipcMain.handle('chat-kill-session', async () => {
  return chatAgentManager.killSession()
})

ipcMain.handle('chat-get-active-sessions', async () => {
  return []
})

// CLI Tool detection IPC handlers
ipcMain.handle('cli-detect-tool', async (_, toolId: string) => {
  return detectTool(toolId)
})

ipcMain.handle('cli-detect-all-tools', async () => {
  return detectAllTools()
})

ipcMain.handle('cli-clear-cache', async () => {
  clearDetectionCache()
})

// Prerequisites check handler - verifies dev environment prerequisites
ipcMain.handle('check-environment', async () => {
  interface EnvCheckItem {
    id: string
    label: string
    status: 'checking' | 'ok' | 'warning' | 'error'
    version?: string | null
    detail?: string
  }

  const items: EnvCheckItem[] = []

  // 1. Claude CLI
  const claudeResult = await detectTool('claude-code')
  const claudeAvailable = claudeResult.available
  items.push({
    id: 'claude',
    label: 'Claude CLI',
    status: claudeAvailable ? 'ok' : 'error',
    version: claudeResult.version,
    detail: claudeAvailable ? undefined : 'Not found in PATH'
  })

  // 2. Git
  const gitPath = findBinary('git')
  let gitVersion: string | null = null
  if (gitPath) {
    try {
      const execFileAsync = promisify(execFile)
      const gitResult = await execFileAsync('git', ['--version'], { encoding: 'utf-8', timeout: 5000 })
      if (gitResult.stdout) {
        const match = gitResult.stdout.match(/(\d+\.\d+\.\d+)/)
        if (match) gitVersion = match[1]
      }
    } catch { /* git --version failed */ }
  }
  items.push({
    id: 'git',
    label: 'Git',
    status: gitPath ? 'ok' : 'error',
    version: gitVersion,
    detail: gitPath ? undefined : 'Not found in PATH'
  })

  // 3. Node.js (needed for npx bmad-method install)
  const nodePath = findBinary('node')
  let nodeVersion: string | null = null
  if (nodePath) {
    try {
      const execFileAsync = promisify(execFile)
      const nodeResult = await execFileAsync('node', ['--version'], { encoding: 'utf-8', timeout: 5000 })
      if (nodeResult.stdout) {
        const match = nodeResult.stdout.match(/v?(\d+\.\d+\.\d+)/)
        if (match) nodeVersion = match[1]
      }
    } catch { /* node --version failed */ }
  }
  items.push({
    id: 'node',
    label: 'Node.js',
    status: nodePath ? 'ok' : 'warning',
    version: nodeVersion,
    detail: nodePath ? undefined : 'Needed for BMAD installation (npx)'
  })

  // 4-7. Plugins and MCP servers - read Claude settings file
  let enabledPlugins: Record<string, boolean> = {}
  try {
    const claudeSettingsPath = join(homedir(), '.claude', 'settings.json')
    if (existsSync(claudeSettingsPath)) {
      const content = await readFile(claudeSettingsPath, 'utf-8')
      const settings = JSON.parse(content)
      enabledPlugins = settings.enabledPlugins || {}
    }
  } catch {
    // Settings file may not exist or be unreadable
  }

  // 3. Context7 Plugin
  const context7Enabled = enabledPlugins['context7@claude-plugins-official'] === true
  items.push({
    id: 'context7',
    label: 'Context7 Plugin',
    status: context7Enabled ? 'ok' : 'warning',
    detail: context7Enabled ? 'Enabled' : 'Not enabled in Claude settings'
  })

  // 4. Web Search (built-in to Claude Code)
  items.push({
    id: 'web-search',
    label: 'Web Search (built-in)',
    status: claudeAvailable ? 'ok' : 'warning',
    detail: claudeAvailable ? 'Available' : 'Requires Claude CLI'
  })

  // 5. Web Reader MCP
  let webReaderStatus: 'ok' | 'warning' | 'error' = 'warning'
  let webReaderDetail = 'Not configured'
  if (!claudeAvailable) {
    webReaderDetail = 'Requires Claude CLI'
  } else {
    try {
      // Strip CLAUDECODE env var to avoid "nested session" error
      const mcpEnv = { ...getAugmentedEnv() }
      delete mcpEnv.CLAUDECODE
      // Also remove any CLAUDE_ session env vars that might cause nested session detection
      for (const key of Object.keys(mcpEnv)) {
        if (key.startsWith('CLAUDE_') && key !== 'CLAUDE_CONFIG_DIR') {
          delete mcpEnv[key]
        }
      }

      const execFileAsync = promisify(execFile)
      const mcpResult = await execFileAsync('claude', ['mcp', 'list'], {
        encoding: 'utf-8',
        timeout: 8000,
        env: mcpEnv
      })

      if (mcpResult.stdout?.toLowerCase().includes('web-reader')) {
        webReaderStatus = 'ok'
        webReaderDetail = 'Configured'
      }
    } catch {
      webReaderDetail = 'Could not verify'
    }
  }
  items.push({
    id: 'web-reader',
    label: 'Web Reader MCP',
    status: webReaderStatus,
    detail: webReaderDetail
  })

  // 6. TypeScript LSP Plugin
  const tsLspEnabled = enabledPlugins['typescript-lsp@claude-plugins-official'] === true
  items.push({
    id: 'ts-lsp',
    label: 'TypeScript LSP',
    status: tsLspEnabled ? 'ok' : 'warning',
    detail: tsLspEnabled ? 'Enabled' : 'Not enabled in Claude settings'
  })

  return { items }
})

// BMAD Install handler - runs npx bmad-method install
let bmadInstallProcess: ReturnType<typeof spawnChild> | null = null

// Parse a GitHub input (shorthand, HTTPS, or SSH) into owner, repo, and clone URL.
// Returns null if the input is not a GitHub reference.
function parseGitHubInput(input: string): { owner: string; repo: string; cloneUrl: string } | { error: string } | null {
  if (input.startsWith('git@github.com:')) {
    const match = input.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/)
    if (!match) return { error: 'Invalid SSH GitHub URL' }
    return { owner: match[1], repo: match[2], cloneUrl: input }
  }
  if (input.startsWith('https://github.com/')) {
    const match = input.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
    if (!match) return { error: 'Invalid GitHub URL' }
    return { owner: match[1], repo: match[2], cloneUrl: input.endsWith('.git') ? input : `${input}.git` }
  }
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(input)) {
    const [owner, repo] = input.split('/')
    return { owner, repo, cloneUrl: `https://github.com/${owner}/${repo}.git` }
  }
  return null
}

// Check if a file exists in a GitHub repo via raw.githubusercontent.com (no auth needed for public repos).
async function githubFileExists(owner: string, repo: string, filePath: string): Promise<boolean> {
  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${filePath}`
    const response = await net.fetch(url, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

// Verify a GitHub repo contains module.yaml before cloning.
// Returns the relative path to module.yaml, or an error.
async function verifyGitHubModuleExists(owner: string, repo: string): Promise<{ yamlRelPath: string } | { error: string }> {
  if (await githubFileExists(owner, repo, 'module.yaml')) {
    return { yamlRelPath: 'module.yaml' }
  }
  if (await githubFileExists(owner, repo, 'src/module.yaml')) {
    return { yamlRelPath: 'src/module.yaml' }
  }
  return { error: `Repository ${owner}/${repo} does not contain a module.yaml (checked root and src/)` }
}

// Run a git command asynchronously with credential prompts disabled and a timeout.
// Non-blocking — does not freeze the Electron main process.
function runGitAsync(args: string[], cwd: string): Promise<{ stdout: string; error?: string }> {
  return new Promise((resolve) => {
    const env = { ...process.env }
    delete env.GPG_TTY
    env.GIT_TERMINAL_PROMPT = '0' // Prevent git from prompting for HTTPS credentials
    env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes' // Prevent SSH from prompting for passphrase

    const child = spawnChild('git', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env
    })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })

    const timeout = setTimeout(() => {
      child.kill()
      resolve({ stdout: '', error: 'Git operation timed out — the repository may require authentication' })
    }, 30_000)

    child.on('error', (err) => {
      clearTimeout(timeout)
      resolve({ stdout: '', error: err.message })
    })

    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code !== 0) {
        const msg = stderr.trim()
        if (msg.includes('could not read Username') || msg.includes('Authentication failed') || msg.includes('Permission denied')) {
          resolve({ stdout: '', error: 'Repository requires authentication — only public repos or repos with pre-configured SSH keys are supported' })
        } else {
          resolve({ stdout, error: msg || 'Git command failed' })
        }
      } else {
        resolve({ stdout })
      }
    })
  })
}

// Clone or update a GitHub module repo into the local cache.
async function cloneGitHubRepo(owner: string, repo: string, cloneUrl: string): Promise<{ path: string } | { error: string }> {
  const cacheDir = join(app.getPath('userData'), 'module-cache')
  const modulePath = join(cacheDir, `${owner}--${repo}`)

  if (existsSync(modulePath)) {
    const result = await runGitAsync(['pull', '--ff-only'], modulePath)
    if (result.error) {
      console.warn(`Failed to update cached module ${owner}/${repo}: ${result.error}`)
    }
  } else {
    if (!existsSync(cacheDir)) {
      await mkdir(cacheDir, { recursive: true })
    }
    const result = await runGitAsync(['clone', '--depth', '1', cloneUrl, modulePath], cacheDir)
    if (result.error) {
      return { error: result.error }
    }
  }

  return { path: modulePath }
}

ipcMain.handle('validate-custom-module', async (_, input: string) => {
  try {
    let dirPath = input
    let source: 'local' | 'github' = 'local'
    let repoSlug: string | undefined

    const parsed = parseGitHubInput(input)
    if (parsed && 'error' in parsed) {
      return { valid: false, error: parsed.error }
    }

    if (parsed) {
      // Verify module.yaml exists in the repo before downloading anything
      const verify = await verifyGitHubModuleExists(parsed.owner, parsed.repo)
      if ('error' in verify) {
        return { valid: false, error: verify.error }
      }

      // Module.yaml confirmed — now clone
      const cloneResult = await cloneGitHubRepo(parsed.owner, parsed.repo, parsed.cloneUrl)
      if ('error' in cloneResult) {
        return { valid: false, error: cloneResult.error }
      }

      dirPath = cloneResult.path
      source = 'github'
      repoSlug = `${parsed.owner}/${parsed.repo}`
    }

    // Look for module.yaml: root first, then src/module.yaml
    let yamlPath = join(dirPath, 'module.yaml')
    if (!existsSync(yamlPath)) {
      yamlPath = join(dirPath, 'src', 'module.yaml')
    }
    if (!existsSync(yamlPath)) {
      return { valid: false, error: source === 'github'
        ? 'Repository does not contain a module.yaml (checked root and src/)'
        : 'No module.yaml found in directory' }
    }

    const content = await readFile(yamlPath, 'utf-8')
    const codeMatch = content.match(/^\s*code:\s*['"]?([^'"\n\s]+)['"]?/m)
    if (!codeMatch) {
      return { valid: false, error: 'module.yaml is missing required "code" field' }
    }
    const nameMatch = content.match(/^\s*name:\s*['"]?([^'"\n]+?)['"]?\s*$/m)
    return {
      valid: true,
      code: codeMatch[1],
      name: nameMatch ? nameMatch[1].trim() : undefined,
      path: dirPath,
      source,
      repo: repoSlug
    }
  } catch (err) {
    return { valid: false, error: `Failed to read module: ${(err as Error).message}` }
  }
})

/**
 * After BMAD install, generate missing .claude/commands/ files for custom modules.
 * The BMAD installer compiles custom module agents but doesn't create slash command files for them.
 */
async function generateCustomModuleCommands(projectPath: string): Promise<void> {
  const customDir = join(projectPath, '_bmad', '_config', 'custom')
  if (!existsSync(customDir)) return

  const commandsDir = join(projectPath, '.claude', 'commands')
  if (!existsSync(commandsDir)) {
    await mkdir(commandsDir, { recursive: true })
  }

  const customEntries = await readdir(customDir)
  for (const moduleId of customEntries) {
    if (moduleId.startsWith('.') || moduleId.endsWith('.yaml')) continue
    const moduleSrcDir = join(customDir, moduleId, 'src', moduleId)

    // Generate agent command files
    const agentsDir = join(moduleSrcDir, 'agents')
    if (existsSync(agentsDir)) {
      const agentFiles = await readdir(agentsDir)
      for (const file of agentFiles) {
        if (!file.endsWith('.md')) continue
        const agentName = file.replace('.md', '')
        const commandFile = join(commandsDir, `bmad-agent-${moduleId}-${agentName}.md`)
        if (existsSync(commandFile)) continue

        const agentPath = `_bmad/_config/custom/${moduleId}/src/${moduleId}/agents/${file}`
        const content = [
          '---',
          `name: '${agentName}'`,
          `description: '${agentName} agent (custom module: ${moduleId})'`,
          'disable-model-invocation: true',
          '---',
          '',
          'You must fully embody this agent\'s persona and follow all activation instructions exactly as specified. NEVER break character until given an exit command.',
          '',
          '<agent-activation CRITICAL="TRUE">',
          `1. LOAD the FULL agent file from {project-root}/${agentPath}`,
          '2. READ its entire contents - this contains the complete agent persona, menu, and instructions',
          '3. FOLLOW every step in the <activation> section precisely',
          '4. DISPLAY the welcome/greeting as instructed',
          '5. PRESENT the numbered menu',
          '6. WAIT for user input before proceeding',
          '</agent-activation>'
        ].join('\n')

        await writeFile(commandFile, content, 'utf-8')
        console.log(`[BMAD Install] Generated command: bmad-agent-${moduleId}-${agentName}.md`)
      }
    }

    // Generate workflow command files from module-help.csv
    const moduleHelpPath = join(customDir, moduleId, 'module-help.csv')
    if (existsSync(moduleHelpPath)) {
      const csv = await readFile(moduleHelpPath, 'utf-8')
      const lines = csv.split('\n').filter(Boolean)
      for (let i = 1; i < lines.length; i++) {
        const fields = lines[i].split(',').map(f => f.trim().replace(/^"|"$/g, ''))
        if (fields.length < 7) continue
        const [, , name, , , workflowFile, commandName] = fields
        if (!commandName || !workflowFile) continue

        const commandFile = join(commandsDir, `${commandName}.md`)
        if (existsSync(commandFile)) continue

        // Determine if workflow file is .yaml or .md
        const hasYaml = existsSync(join(projectPath, workflowFile.replace('.md', '.yaml')))
        const yamlPath = hasYaml ? workflowFile.replace('.md', '.yaml') : workflowFile

        let content: string
        if (hasYaml) {
          content = [
            '---',
            `name: '${commandName.replace('bmad-', '')}'`,
            `description: '${name} (custom module: ${moduleId})'`,
            'disable-model-invocation: true',
            '---',
            '',
            'IT IS CRITICAL THAT YOU FOLLOW THESE STEPS - while staying in character as the current agent persona you may have loaded:',
            '',
            '<steps CRITICAL="TRUE">',
            `1. Always LOAD the FULL @{project-root}/_bmad/core/tasks/workflow.xml`,
            `2. READ its entire contents - this is the CORE OS for EXECUTING the specific workflow-config @{project-root}/${yamlPath}`,
            `3. Pass the yaml path @{project-root}/${yamlPath} as 'workflow-config' parameter to the workflow.xml instructions`,
            '4. Follow workflow.xml instructions EXACTLY as written to process and follow the specific workflow config and its instructions',
            '5. Save outputs after EACH section when generating any documents from templates',
            '</steps>'
          ].join('\n')
        } else {
          content = [
            '---',
            `name: '${commandName.replace('bmad-', '')}'`,
            `description: '${name} (custom module: ${moduleId})'`,
            'disable-model-invocation: true',
            '---',
            '',
            'IT IS CRITICAL THAT YOU FOLLOW THESE STEPS:',
            '',
            '<steps CRITICAL="TRUE">',
            `1. LOAD the FULL workflow file from {project-root}/${workflowFile}`,
            '2. READ its entire contents',
            '3. Follow the workflow instructions precisely',
            '4. Save outputs after EACH section',
            '</steps>'
          ].join('\n')
        }

        await writeFile(commandFile, content, 'utf-8')
        console.log(`[BMAD Install] Generated command: ${commandName}.md`)
      }
    }
  }
}

ipcMain.handle('bmad-install', async (_, projectPath: string, useAlpha?: boolean, outputFolder?: string, modules?: string[], customContentPaths?: string[]) => {
  if (bmadInstallProcess) {
    return { success: false, error: 'Installation already in progress' }
  }

  try {
    const folder = outputFolder || '_bmad-output'
    const packageName = useAlpha ? 'bmad-method@alpha' : 'bmad-method'
    const moduleList = (modules?.length) ? modules.join(',') : 'bmm'
    // Use --action update if BMAD is already installed (adds tools/modules without full reinstall)
    const isUpdate = existsSync(join(projectPath, '_bmad', '_config', 'manifest.yaml'))
    // Stable v6 supports non-interactive flags; alpha does not
    const args = useAlpha
      ? [packageName, 'install']
      : [
          packageName, 'install',
          '--directory', projectPath,
          '--modules', moduleList,
          '--tools', 'claude-code',
          '--output-folder', folder,
          '--yes',
          ...(isUpdate ? ['--action', 'update'] : []),
          ...(customContentPaths?.length ? ['--custom-content', customContentPaths.join(',')] : [])
        ]

    console.log('[BMAD Install] Running: npx', args.join(' '))

    const proc = spawnChild('npx', args, {
      cwd: projectPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: getAugmentedEnv()
    })

    bmadInstallProcess = proc

    proc.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString('utf-8')
      console.log('[BMAD Install stdout]', chunk)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bmad:install-output', { type: 'stdout', chunk })
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString('utf-8')
      console.log('[BMAD Install stderr]', chunk)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bmad:install-output', { type: 'stderr', chunk })
      }
    })

    proc.on('exit', async (code, signal) => {
      console.log('[BMAD Install] Exited:', { code, signal })
      bmadInstallProcess = null

      // Generate missing command files for custom modules after successful install
      // Always run (not just when customContentPaths provided) — handles update installs
      // where custom modules are already compiled into _bmad/_config/custom/
      if (code === 0) {
        try {
          await generateCustomModuleCommands(projectPath)
        } catch (err) {
          console.error('[BMAD Install] Error generating custom module commands:', err)
        }
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bmad:install-complete', {
          success: code === 0,
          code,
          signal
        })
      }
    })

    proc.on('error', (error) => {
      console.error('[BMAD Install] Error:', error)
      bmadInstallProcess = null
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bmad:install-complete', {
          success: false,
          error: error.message
        })
      }
    })

    return { success: true }
  } catch (error) {
    bmadInstallProcess = null
    return { success: false, error: error instanceof Error ? error.message : 'Failed to start install' }
  }
})

// Wizard file watcher - watches _bmad-output/planning-artifacts for new files
let wizardWatcher: FSWatcher | null = null
let wizardWatchDebounce: NodeJS.Timeout | null = null

ipcMain.handle('wizard-start-watching', async (_, projectPath: string, outputFolder?: string) => {
  const folder = outputFolder || '_bmad-output'
  // Stop existing wizard watcher
  if (wizardWatcher) {
    wizardWatcher.close()
    wizardWatcher = null
  }

  const outputDir = join(projectPath, folder)

  // Create the directory if it doesn't exist yet (install may not have completed)
  if (!existsSync(outputDir)) {
    try {
      await mkdir(outputDir, { recursive: true })
    } catch {
      return false
    }
  }

  try {
    wizardWatcher = watch(outputDir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return
      // Watch .md and .yaml files (covers both planning artifacts and sprint-status.yaml)
      if (!filename.endsWith('.md') && !filename.endsWith('.yaml')) return

      if (wizardWatchDebounce) clearTimeout(wizardWatchDebounce)
      wizardWatchDebounce = setTimeout(() => {
        console.log('[Wizard Watcher] File changed:', filename)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('wizard:file-changed', { filename })
        }
      }, 500)
    })
    return true
  } catch (error) {
    console.error('[Wizard Watcher] Failed to start:', error)
    return false
  }
})

ipcMain.handle('wizard-stop-watching', async () => {
  if (wizardWatchDebounce) {
    clearTimeout(wizardWatchDebounce)
    wizardWatchDebounce = null
  }
  if (wizardWatcher) {
    wizardWatcher.close()
    wizardWatcher = null
  }
  return true
})

// Check if a file exists (for wizard step completion detection)
ipcMain.handle('check-file-exists', async (_, filePath: string) => {
  return existsSync(filePath)
})

ipcMain.handle('check-dir-has-prefix', async (_, dirPath: string, prefix: string) => {
  try {
    if (!existsSync(dirPath)) return false
    const entries = await readdir(dirPath)
    return entries.some(entry => entry.startsWith(prefix) && entry.endsWith('.md'))
  } catch {
    return false
  }
})

// Wizard state persistence
ipcMain.handle('save-wizard-state', async (_, projectPath: string, state: unknown, outputFolder?: string) => {
  try {
    const folder = outputFolder || '_bmad-output'
    const wizardDir = join(projectPath, folder)
    if (!existsSync(wizardDir)) {
      await mkdir(wizardDir, { recursive: true })
    }
    const wizardPath = join(wizardDir, '.bmad-studio-wizard.json')
    await writeFile(wizardPath, JSON.stringify(state, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save wizard state:', error)
    return false
  }
})

ipcMain.handle('load-wizard-state', async (_, projectPath: string, outputFolder?: string) => {
  try {
    const folder = outputFolder || '_bmad-output'
    const wizardPath = join(projectPath, folder, '.bmad-studio-wizard.json')
    if (!existsSync(wizardPath)) return null
    const content = await readFile(wizardPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
})

ipcMain.handle('delete-wizard-state', async (_, projectPath: string, outputFolder?: string) => {
  try {
    const folder = outputFolder || '_bmad-output'
    const wizardPath = join(projectPath, folder, '.bmad-studio-wizard.json')
    if (existsSync(wizardPath)) {
      const { unlink } = await import('fs/promises')
      await unlink(wizardPath)
    }
    return true
  } catch {
    return false
  }
})

// Write project files (for human developer mode - replaces workflow files after install)
ipcMain.handle('write-project-files', async (_, projectPath: string, files: { relativePath: string; content: string }[]) => {
  try {
    if (!existsSync(projectPath)) {
      return { success: false, written: 0, error: 'Project path does not exist' }
    }

    let written = 0
    for (const file of files) {
      const fullPath = join(projectPath, file.relativePath)
      const dir = dirname(fullPath)
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }
      await writeFile(fullPath, file.content, 'utf-8')
      written++
    }

    return { success: true, written }
  } catch (error) {
    return { success: false, written: 0, error: error instanceof Error ? error.message : 'Failed to write files' }
  }
})

// Append YAML fields to module config files after installation
ipcMain.handle('append-config-fields', async (_, projectPath: string, fields: Record<string, string>) => {
  try {
    const bmadPath = join(projectPath, '_bmad')
    if (!existsSync(bmadPath)) {
      return { success: false, error: '_bmad directory not found' }
    }

    // Build YAML lines to append
    const yamlLines = Object.entries(fields)
      .filter(([, v]) => v) // skip empty values
      .map(([k, v]) => `${k}: "${v}"`)
    if (yamlLines.length === 0) return { success: true, updated: 0 }

    const yamlBlock = '\n# User Profile\n' + yamlLines.join('\n') + '\n'

    // Find all module config.yaml files (e.g., _bmad/bmm/config.yaml, _bmad/gds/config.yaml)
    let updated = 0
    const entries = readdirSync(bmadPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('_')) {
        const configPath = join(bmadPath, entry.name, 'config.yaml')
        if (existsSync(configPath)) {
          const existing = readFileSync(configPath, 'utf-8')
          // Only append if not already present
          if (!existing.includes('user_name:')) {
            appendFileSync(configPath, yamlBlock)
            updated++
          }
        }
      }
    }

    return { success: true, updated }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to append config fields' }
  }
})

// Allow selecting a directory without validating _bmad-output (for wizard)
ipcMain.handle('select-directory-any', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Project Folder'
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return { path: result.filePaths[0] }
})

// Create a new project directory (for "New Project" flow)
ipcMain.handle('create-project-directory', async (_, parentPath: string, projectName: string) => {
  try {
    const projectPath = join(parentPath, projectName)
    if (existsSync(projectPath)) {
      return { success: false, error: 'A folder with that name already exists' }
    }
    await mkdir(projectPath, { recursive: true })
    const gitInit = spawnSync('git', ['init'], { cwd: projectPath })
    if (gitInit.status !== 0) {
      return { success: false, error: 'Created folder but git init failed: ' + (gitInit.stderr?.toString() || 'unknown error') }
    }
    // Create an initial empty commit so the default branch is a valid ref for branching
    // Skip GPG signing — this is a housekeeping commit, not user content
    spawnSync('git', ['commit', '--allow-empty', '--no-gpg-sign', '-m', 'Initial commit'], { cwd: projectPath })
    return { success: true, path: projectPath }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create directory' }
  }
})

// ============================================================
// Remote Branch Viewer — IPC handlers
// ============================================================

// Save encrypted GitHub PAT token to settings
ipcMain.handle('save-github-token', async (_, token: string) => {
  try {
    const encrypted = encryptToken(token)
    const settings = await loadSettings()
    settings.githubTokenEncrypted = encrypted
    await saveSettings(settings)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save token' }
  }
})

// Load decrypted GitHub PAT token from settings
ipcMain.handle('load-github-token', async () => {
  try {
    const settings = await loadSettings()
    if (!settings.githubTokenEncrypted) return { token: null }
    const token = decryptToken(settings.githubTokenEncrypted)
    return { token }
  } catch (error) {
    return { token: null, error: error instanceof Error ? error.message : 'Failed to load token' }
  }
})

// Test a GitHub token by running git ls-remote against a test URL
ipcMain.handle('test-github-token', async (_, token: string, testUrl: string) => {
  if (!testUrl) {
    return { success: false, error: 'No test URL provided' }
  }

  try {
    const authenticatedUrl = testUrl.startsWith('https://')
      ? getAuthenticatedUrl(testUrl, encryptToken(token))
      : testUrl

    const result = spawnSync('git', ['ls-remote', '--heads', authenticatedUrl], {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })

    if (result.status === 0) {
      return { success: true }
    }
    return { success: false, error: result.stderr?.trim() || 'Authentication failed' }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Token test failed' }
  }
})

// Fetch remote refs (git fetch <remote> --prune)
ipcMain.handle('git-fetch', async (_, projectPath: string, remote?: string) => {
  const remoteArg = remote || 'origin'
  // Optionally inject token for HTTPS remotes
  const settings = await loadSettings()
  const encrypted = settings.githubTokenEncrypted

  // Get the remote URL to potentially inject token
  const urlResult = runGitCommand(['remote', 'get-url', remoteArg], projectPath)
  const env: Record<string, string | undefined> = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  delete env.GPG_TTY

  if (!urlResult.error && urlResult.stdout.trim().startsWith('https://') && encrypted) {
    // Temporarily set the authenticated URL for this fetch
    const authUrl = getAuthenticatedUrl(urlResult.stdout.trim(), encrypted)
    const result = spawnSync('git', ['-c', `url.${authUrl}.insteadOf=${urlResult.stdout.trim()}`, 'fetch', remoteArg, '--prune'], {
      cwd: projectPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env
    })
    if (result.error) return { success: false, error: result.error.message }
    if (result.status !== 0) return { success: false, error: result.stderr?.trim() || 'Fetch failed' }
    return { success: true }
  }

  const result = runGitCommand(['fetch', remoteArg, '--prune'], projectPath)
  if (result.error) return { success: false, error: result.error }
  return { success: true }
})

// List remote branches (origin/*)
ipcMain.handle('git-list-remote-branches', async (_, projectPath: string) => {
  const result = runGitCommand(['branch', '-r', '--format=%(refname:short)'], projectPath)
  if (result.error) {
    return { branches: [], error: result.error }
  }
  const branches = result.stdout.trim().split('\n')
    .filter(Boolean)
    .filter(b => !b.includes('->') && b.includes('/')) // Exclude symbolic refs (HEAD resolves to bare "origin")
  return { branches }
})

// Clone a local repo to cache for attached remote branch viewing
ipcMain.handle('git-clone-local-to-cache', async (_, localProjectPath: string, cacheKey: string) => {
  try {
    const cacheDir = join(app.getPath('userData'), 'remote-cache')
    mkdirSync(cacheDir, { recursive: true })
    const absolutePath = join(cacheDir, cacheKey)

    const spawnOpts = { encoding: 'utf-8' as const, maxBuffer: 10 * 1024 * 1024, timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] as StdioOptions }

    if (existsSync(absolutePath)) {
      // Cache exists — just fetch to update refs
      const fetchResult = spawnSync('git', ['-C', absolutePath, 'fetch', 'origin'], spawnOpts)
      if (fetchResult.error) return { success: false, error: fetchResult.error.message }
      if (fetchResult.status !== 0) return { success: false, error: fetchResult.stderr?.trim() || 'Fetch failed' }
      return { success: true, path: absolutePath }
    }

    // Clone using --local for hardlinks (fast, minimal disk usage)
    const cloneResult = spawnSync('git', [
      'clone', '--local', '--depth', '1', '--no-single-branch',
      localProjectPath, absolutePath
    ], spawnOpts)

    if (cloneResult.error) return { success: false, error: cloneResult.error.message }
    if (cloneResult.status !== 0) return { success: false, error: cloneResult.stderr?.trim() || 'Clone failed' }

    // Fix origin URL: point to the real remote instead of local path
    // so "Refresh Board" fetches from GitHub, not the local directory
    const realUrlResult = spawnSync('git', ['-C', localProjectPath, 'remote', 'get-url', 'origin'], spawnOpts)
    if (realUrlResult.status === 0 && realUrlResult.stdout.trim()) {
      const realUrl = realUrlResult.stdout.trim()
      // Inject token if available
      const settings = await loadSettings()
      const encrypted = settings.githubTokenEncrypted
      const authenticatedUrl = getAuthenticatedUrl(realUrl, encrypted || null)
      spawnSync('git', ['-C', absolutePath, 'remote', 'set-url', 'origin', authenticatedUrl], spawnOpts)
    }

    return { success: true, path: absolutePath }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to clone local repo' }
  }
})

// Shallow clone a remote repository
ipcMain.handle('git-clone-remote', async (_, url: string, targetName: string) => {
  try {
    // Resolve to absolute cache path
    const cacheDir = join(app.getPath('userData'), 'remote-cache')
    mkdirSync(cacheDir, { recursive: true })
    const absolutePath = join(cacheDir, targetName)

    // Inject token if available
    const settings = await loadSettings()
    const encrypted = settings.githubTokenEncrypted
    const authenticatedUrl = getAuthenticatedUrl(url, encrypted || null)

    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    const spawnOpts = { encoding: 'utf-8' as const, maxBuffer: 10 * 1024 * 1024, timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] as StdioOptions, env: gitEnv }

    // Shallow clone with all branches — gives a proper working tree with _bmad/, .claude/, etc.
    // --depth 1 only downloads the tip commit per branch (minimal data)
    // --no-single-branch fetches all remote branches, not just the default
    const result = spawnSync('git', [
      'clone', '--depth', '1', '--no-single-branch',
      authenticatedUrl, absolutePath
    ], spawnOpts)

    if (result.error) return { success: false, error: result.error.message }
    if (result.status !== 0) return { success: false, error: result.stderr?.trim() || 'Clone failed' }

    // Determine default branch from remote HEAD
    const headResult = spawnSync('git', ['-C', absolutePath, 'symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], spawnOpts)
    const defaultBranch = headResult.status === 0 ? headResult.stdout.trim() : null

    return { success: true, path: absolutePath, defaultBranch }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to set up remote' }
  }
})

// Reset working tree to HEAD — reverts all modifications and removes untracked files
// Used to keep remote project cache clean after agent interactions
ipcMain.handle('git-reset-working-tree', async (_, projectPath: string) => {
  try {
    // Revert all tracked file modifications
    const checkoutResult = runGitCommand(['checkout', '--', '.'], projectPath)
    // Remove untracked files and directories
    const cleanResult = runGitCommand(['clean', '-fd'], projectPath)
    if (checkoutResult.error && cleanResult.error) {
      return { success: false, error: checkoutResult.error }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Reset failed' }
  }
})

// Checkout a remote branch in a cached repo (updates working tree for remote project viewing)
ipcMain.handle('git-checkout-remote-branch', async (_, projectPath: string, branch: string) => {
  if (!isValidGitRef(branch)) {
    return { success: false, error: 'Invalid branch name' }
  }
  try {
    // For remote branches like "origin/develop", checkout as detached HEAD
    const result = runGitCommand(['checkout', branch], projectPath)
    if (result.error) return { success: false, error: result.error }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Checkout failed' }
  }
})

// List branches from a remote URL without cloning (git ls-remote)
ipcMain.handle('git-ls-remote', async (_, url: string) => {
  try {
    // Inject token if available
    const settings = await loadSettings()
    const encrypted = settings.githubTokenEncrypted
    const authenticatedUrl = getAuthenticatedUrl(url, encrypted || null)

    const result = spawnSync('git', ['ls-remote', '--heads', authenticatedUrl], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })

    if (result.error) return { branches: [], error: result.error.message }
    if (result.status !== 0) return { branches: [], error: result.stderr?.trim() || 'ls-remote failed' }

    // Parse output: each line is "<hash>\trefs/heads/<branch>"
    const branches = result.stdout.trim().split('\n')
      .filter(Boolean)
      .map(line => {
        const parts = line.split('\t')
        const ref = parts[1] || ''
        return ref.replace('refs/heads/', '')
      })
      .filter(Boolean)

    return { branches }
  } catch (error) {
    return { branches: [], error: error instanceof Error ? error.message : 'ls-remote failed' }
  }
})

