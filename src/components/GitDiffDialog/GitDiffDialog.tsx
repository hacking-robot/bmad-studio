import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  IconButton,
  Typography,
  Box,
  Chip,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Tabs,
  Tab,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  Button,
  Alert,
  Checkbox,
  FormControlLabel
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import ViewStreamIcon from '@mui/icons-material/ViewStream'
import CommitIcon from '@mui/icons-material/Commit'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import RefreshIcon from '@mui/icons-material/Refresh'
import { DiffView, DiffModeEnum } from '@git-diff-view/react'
import { generateDiffFile } from '@git-diff-view/file'
import { useStore } from '../../store'
import { AI_TOOLS } from '../../types'
import { useWorkflow } from '../../hooks/useWorkflow'
import '@git-diff-view/react/styles/diff-view.css'
import './diff-styles.css'

const AGENT_PANEL_WIDTH = 500

interface GitChangedFile {
  status: 'A' | 'M' | 'D' | 'R' | 'C'
  path: string
  mtime: number | null
  lastCommitTime: number | null
}

interface GitCommit {
  hash: string
  author: string
  timestamp: number
  subject: string
}

interface GitCommitFile {
  status: 'A' | 'M' | 'D' | 'R' | 'C'
  path: string
}

interface FileDiffData {
  oldContent: string
  newContent: string
  oldFileName: string
  newFileName: string
}

// Helper to get file extension for syntax highlighting
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    xml: 'xml',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    dockerfile: 'dockerfile',
    toml: 'toml'
  }
  return langMap[ext] || 'plaintext'
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    A: { label: 'Added', color: '#10B981', icon: <AddIcon sx={{ fontSize: 14 }} /> },
    M: { label: 'Modified', color: '#F59E0B', icon: <EditIcon sx={{ fontSize: 14 }} /> },
    D: { label: 'Deleted', color: '#EF4444', icon: <DeleteIcon sx={{ fontSize: 14 }} /> },
    R: { label: 'Renamed', color: '#8B5CF6', icon: <EditIcon sx={{ fontSize: 14 }} /> },
    C: { label: 'Copied', color: '#3B82F6', icon: <AddIcon sx={{ fontSize: 14 }} /> }
  }
  const { label, color, icon } = config[status] || config.M
  return (
    <Chip
      icon={<Box sx={{ display: 'flex', color: 'white' }}>{icon}</Box>}
      label={label}
      size="small"
      sx={{
        height: 22,
        bgcolor: color,
        color: 'white',
        fontWeight: 600,
        fontSize: '0.7rem',
        '& .MuiChip-icon': { color: 'white' }
      }}
    />
  )
}

// Single file diff component
function FileDiff({
  file,
  projectPath,
  mergeBase,
  branchName,
  themeMode,
  diffMode,
  isCurrentBranch
}: {
  file: GitChangedFile
  projectPath: string
  mergeBase: string
  branchName: string
  themeMode: 'light' | 'dark'
  diffMode: DiffModeEnum
  isCurrentBranch: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [diffData, setDiffData] = useState<FileDiffData | null>(null)

  useEffect(() => {
    if (expanded && !diffData) {
      loadDiff()
    }
  }, [expanded])

  const loadDiff = async () => {
    setLoading(true)
    try {
      // For the "new" content: use working directory if on current branch (includes uncommitted),
      // otherwise use committed content from the branch
      const [oldResult, newResult] = await Promise.all([
        file.status === 'A'
          ? Promise.resolve({ content: '' })
          : window.gitAPI.getFileContent(projectPath, file.path, mergeBase),
        file.status === 'D'
          ? Promise.resolve({ content: '' })
          : isCurrentBranch
            ? window.gitAPI.getWorkingFileContent(projectPath, file.path)
            : window.gitAPI.getFileContent(projectPath, file.path, branchName)
      ])

      setDiffData({
        oldContent: oldResult.content,
        newContent: newResult.content,
        oldFileName: file.status === 'A' ? '' : file.path,
        newFileName: file.status === 'D' ? '' : file.path
      })
    } catch (error) {
      console.error('Failed to load diff:', error)
    } finally {
      setLoading(false)
    }
  }

  const diffFile = useMemo(() => {
    if (!diffData) return null

    const lang = getLanguageFromPath(file.path)
    const df = generateDiffFile(
      diffData.oldFileName,
      diffData.oldContent,
      diffData.newFileName,
      diffData.newContent,
      lang,
      lang
    )
    df.init()
    return df
  }, [diffData, file.path])

  // Count additions and deletions
  const stats = useMemo(() => {
    if (!diffData) return { additions: 0, deletions: 0 }
    const oldLines = diffData.oldContent.split('\n').length
    const newLines = diffData.newContent.split('\n').length
    return {
      additions: Math.max(0, newLines - oldLines),
      deletions: Math.max(0, oldLines - newLines)
    }
  }, [diffData])

  return (
    <Accordion
      expanded={expanded}
      onChange={() => setExpanded(!expanded)}
      elevation={0}
      disableGutters
      sx={{
        border: 1,
        borderColor: 'divider',
        '&:not(:last-child)': { mb: 1 },
        '&:before': { display: 'none' }
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          bgcolor: 'action.hover',
          '&:hover': { bgcolor: 'action.selected' }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', pr: 2 }}>
          <StatusBadge status={file.status} />
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {file.path}
          </Typography>
          {diffData && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Typography variant="caption" sx={{ color: '#10B981', fontWeight: 600 }}>
                +{stats.additions}
              </Typography>
              <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 600 }}>
                -{stats.deletions}
              </Typography>
            </Box>
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
            <Typography sx={{ ml: 2 }} color="text.secondary">
              Loading diff...
            </Typography>
          </Box>
        ) : diffFile ? (
          <Box
            className={`diff-view-wrapper ${themeMode}`}
            sx={{
              '& .diff-view': {
                fontSize: '12px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
              }
            }}
          >
            <DiffView
              diffFile={diffFile}
              diffViewTheme={themeMode}
              diffViewMode={diffMode}
              diffViewHighlight
              diffViewFontSize={12}
            />
          </Box>
        ) : null}
      </AccordionDetails>
    </Accordion>
  )
}

// Single file diff for a specific commit (compares commit vs parent)
function CommitFileDiff({
  file,
  projectPath,
  commitHash,
  themeMode,
  diffMode
}: {
  file: GitCommitFile
  projectPath: string
  commitHash: string
  themeMode: 'light' | 'dark'
  diffMode: DiffModeEnum
}) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [diffData, setDiffData] = useState<FileDiffData | null>(null)

  useEffect(() => {
    if (expanded && !diffData) {
      loadDiff()
    }
  }, [expanded])

  const loadDiff = async () => {
    setLoading(true)
    try {
      const [oldResult, newResult] = await Promise.all([
        file.status === 'A'
          ? Promise.resolve({ content: '' })
          : window.gitAPI.getFileAtParent(projectPath, file.path, commitHash),
        file.status === 'D'
          ? Promise.resolve({ content: '' })
          : window.gitAPI.getFileAtCommit(projectPath, file.path, commitHash)
      ])

      setDiffData({
        oldContent: oldResult.content,
        newContent: newResult.content,
        oldFileName: file.status === 'A' ? '' : file.path,
        newFileName: file.status === 'D' ? '' : file.path
      })
    } catch (error) {
      console.error('Failed to load commit diff:', error)
    } finally {
      setLoading(false)
    }
  }

  const diffFile = useMemo(() => {
    if (!diffData) return null

    const lang = getLanguageFromPath(file.path)
    const df = generateDiffFile(
      diffData.oldFileName,
      diffData.oldContent,
      diffData.newFileName,
      diffData.newContent,
      lang,
      lang
    )
    df.init()
    return df
  }, [diffData, file.path])

  const stats = useMemo(() => {
    if (!diffData) return { additions: 0, deletions: 0 }
    const oldLines = diffData.oldContent.split('\n').length
    const newLines = diffData.newContent.split('\n').length
    return {
      additions: Math.max(0, newLines - oldLines),
      deletions: Math.max(0, oldLines - newLines)
    }
  }, [diffData])

  return (
    <Accordion
      expanded={expanded}
      onChange={() => setExpanded(!expanded)}
      elevation={0}
      disableGutters
      sx={{
        border: 1,
        borderColor: 'divider',
        '&:not(:last-child)': { mb: 1 },
        '&:before': { display: 'none' }
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          bgcolor: 'action.hover',
          '&:hover': { bgcolor: 'action.selected' }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', pr: 2 }}>
          <StatusBadge status={file.status} />
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {file.path}
          </Typography>
          {diffData && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Typography variant="caption" sx={{ color: '#10B981', fontWeight: 600 }}>
                +{stats.additions}
              </Typography>
              <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 600 }}>
                -{stats.deletions}
              </Typography>
            </Box>
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
            <Typography sx={{ ml: 2 }} color="text.secondary">
              Loading diff...
            </Typography>
          </Box>
        ) : diffFile ? (
          <Box
            className={`diff-view-wrapper ${themeMode}`}
            sx={{
              '& .diff-view': {
                fontSize: '12px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
              }
            }}
          >
            <DiffView
              diffFile={diffFile}
              diffViewTheme={themeMode}
              diffViewMode={diffMode}
              diffViewHighlight
              diffViewFontSize={12}
            />
          </Box>
        ) : null}
      </AccordionDetails>
    </Accordion>
  )
}

export default function GitDiffPanel() {
  const projectPath = useStore((state) => state.projectPath)
  const themeMode = useStore((state) => state.themeMode)
  const currentBranch = useStore((state) => state.currentBranch)
  const hasUncommittedChanges = useStore((state) => state.hasUncommittedChanges)
  const setHasUncommittedChanges = useStore((state) => state.setHasUncommittedChanges)
  const stories = useStore((state) => state.stories)
  const chatThreads = useStore((state) => state.chatThreads)
  const agentPanelOpen = useStore((state) => state.agentPanelOpen)
  const enableAgents = useStore((state) => state.enableAgents)
  const viewMode = useStore((state) => state.viewMode)
  const aiTool = useStore((state) => state.aiTool)

  // Git diff panel store state
  const gitDiffPanelOpen = useStore((state) => state.gitDiffPanelOpen)
  const branchName = useStore((state) => state.gitDiffPanelBranch)
  const panelWidth = useStore((state) => state.gitDiffPanelWidth)
  const closeGitDiffPanel = useStore((state) => state.closeGitDiffPanel)
  const setGitDiffPanelWidth = useStore((state) => state.setGitDiffPanelWidth)

  // Get agents from workflow
  const { agents } = useWorkflow()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changedFiles, setChangedFiles] = useState<GitChangedFile[]>([])
  const [mergeBase, setMergeBase] = useState<string>('')
  const [diffMode, setDiffMode] = useState<DiffModeEnum>(DiffModeEnum.Split)
  const [defaultBranch, setDefaultBranch] = useState<string>('')

  // Tab and commit history state
  const [activeTab, setActiveTab] = useState(0)
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null)
  const [commitFiles, setCommitFiles] = useState<GitCommitFile[]>([])
  const [commitFilesLoading, setCommitFilesLoading] = useState(false)

  // Commit action state
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  // Filter state - hide BMAD folders
  const [hideBmadFolders, setHideBmadFolders] = useState(true)

  // Resize drag state
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  // Determine if agent panel is visible (must match App.tsx logic exactly)
  const toolSupportsHeadless = AI_TOOLS.find(t => t.id === aiTool)?.cli.supportsHeadless ?? false
  const showChatView = viewMode === 'chat' && toolSupportsHeadless
  const showAgentPanel = agentPanelOpen && enableAgents && !showChatView && toolSupportsHeadless

  // Check if this is the current branch with uncommitted changes
  const isCurrentBranch = branchName === currentBranch
  const canCommit = isCurrentBranch && hasUncommittedChanges

  // Find if a chat teammate is working on this branch
  const workingTeammate = (() => {
    if (!branchName) return null
    for (const thread of Object.values(chatThreads)) {
      if (thread.isTyping && thread.branchName === branchName) {
        const agentInfo = agents.find((a) => a.id === thread.agentId)
        if (agentInfo) {
          return agentInfo
        }
      }
    }
    return null
  })()

  // Find matching story for commit message
  const getStoryFromBranch = (branch: string) => {
    for (const story of stories) {
      const storyBranchPrefix = story.id
      if (branch === storyBranchPrefix || branch.startsWith(`${storyBranchPrefix}-`)) {
        return story
      }
    }
    return null
  }

  const matchingStory = branchName ? getStoryFromBranch(branchName) : null

  const getCommitMessage = () => {
    if (matchingStory && branchName) {
      return `feat(${branchName}): update story ${matchingStory.epicId}.${matchingStory.storyNumber}`
    }
    return `chore(${branchName}): update`
  }

  const handleCommit = async () => {
    if (!projectPath || !canCommit) return

    setCommitting(true)
    setCommitError(null)

    try {
      const result = await window.gitAPI.commit(projectPath, getCommitMessage())
      if (result.success) {
        setHasUncommittedChanges(false)
        // Refresh the diff to show updated state
        loadChangedFiles(true)
      } else {
        setCommitError(result.error || 'Failed to commit')
      }
    } catch {
      setCommitError('Failed to commit changes')
    } finally {
      setCommitting(false)
    }
  }

  useEffect(() => {
    if (gitDiffPanelOpen && projectPath && branchName) {
      loadChangedFiles()
    }
  }, [gitDiffPanelOpen, projectPath, branchName])

  // Auto-refresh: react to uncommitted changes toggling (polled by UncommittedChanges)
  const prevHasChangesRef = useRef(hasUncommittedChanges)
  useEffect(() => {
    if (prevHasChangesRef.current !== hasUncommittedChanges) {
      prevHasChangesRef.current = hasUncommittedChanges
      if (gitDiffPanelOpen && projectPath && branchName) {
        loadChangedFiles(true)
      }
    }
  }, [hasUncommittedChanges, gitDiffPanelOpen, projectPath, branchName])

  // Auto-refresh: poll every 10s while panel is open
  useEffect(() => {
    if (!gitDiffPanelOpen || !projectPath || !branchName) return
    const interval = setInterval(() => {
      loadChangedFiles(true)
    }, 10000)
    return () => clearInterval(interval)
  }, [gitDiffPanelOpen, projectPath, branchName])

  // Escape key to close
  useEffect(() => {
    if (!gitDiffPanelOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeGitDiffPanel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gitDiffPanelOpen, closeGitDiffPanel])

  // Resize drag handlers
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = panelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return
      const delta = startXRef.current - ev.clientX
      const newWidth = startWidthRef.current + delta
      setGitDiffPanelWidth(newWidth)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [panelWidth, setGitDiffPanelWidth])

  const loadChangedFiles = async (isRefresh = false) => {
    if (!projectPath || !branchName) return

    // Show loading on initial load, refreshing state on manual refresh
    if (isRefresh) {
      setRefreshing(true)
    } else if (changedFiles.length === 0) {
      setLoading(true)
      setError(null)
    }

    try {
      // Get the default branch to compare against
      const defaultBranchResult = await window.gitAPI.getDefaultBranch(projectPath)
      if (defaultBranchResult.error || !defaultBranchResult.branch) {
        // On refresh, don't overwrite existing data with transient errors (e.g. git lock during agent work)
        if (!isRefresh) setError('Could not determine default branch')
        setLoading(false)
        return
      }

      setDefaultBranch(defaultBranchResult.branch)

      // Get changed files between default branch and the feature branch
      const result = await window.gitAPI.getChangedFiles(projectPath, defaultBranchResult.branch, branchName)
      if (result.error) {
        if (!isRefresh) setError(result.error)
        setLoading(false)
        return
      }

      setError(null)
      setChangedFiles(result.files || [])
      setMergeBase(result.mergeBase || '')
    } catch (err) {
      if (!isRefresh) setError('Failed to load git diff')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Load commit history when Commits tab is selected
  const loadCommits = async () => {
    if (!projectPath || !defaultBranch || !branchName) return

    setCommitsLoading(true)
    try {
      const result = await window.gitAPI.getCommitHistory(projectPath, defaultBranch, branchName)
      setCommits(result.commits || [])
    } catch (err) {
      console.error('Failed to load commits:', err)
    } finally {
      setCommitsLoading(false)
    }
  }

  // Load files changed in a specific commit
  const loadCommitFiles = async (commitHash: string) => {
    if (!projectPath) return

    setCommitFilesLoading(true)
    try {
      const result = await window.gitAPI.getCommitDiff(projectPath, commitHash)
      setCommitFiles(result.files || [])
    } catch (err) {
      console.error('Failed to load commit files:', err)
    } finally {
      setCommitFilesLoading(false)
    }
  }

  // Load commits when switching to Commits tab
  useEffect(() => {
    if (activeTab === 1 && commits.length === 0 && defaultBranch) {
      loadCommits()
    }
  }, [activeTab, defaultBranch])

  // Load commit files when selecting a commit
  useEffect(() => {
    if (selectedCommit) {
      loadCommitFiles(selectedCommit.hash)
    }
  }, [selectedCommit])

  // Reset selected commit when changing tabs
  useEffect(() => {
    if (activeTab === 0) {
      setSelectedCommit(null)
      setCommitFiles([])
    }
  }, [activeTab])

  // Detect agent from commit message
  const getAgentFromCommit = (subject: string): { name: string; color: string } | null => {
    const lowerSubject = subject.toLowerCase()
    if (lowerSubject.includes('implement') || lowerSubject.includes('feat:') || lowerSubject.includes('feature')) {
      return { name: 'DEV', color: '#10B981' } // Amelia
    }
    if (lowerSubject.includes('review') || lowerSubject.includes('fix:') || lowerSubject.includes('address')) {
      return { name: 'Review', color: '#3B82F6' } // Reviewer
    }
    if (lowerSubject.includes('test') || lowerSubject.includes('spec')) {
      return { name: 'TEA', color: '#8B5CF6' } // Test
    }
    if (lowerSubject.includes('doc') || lowerSubject.includes('readme')) {
      return { name: 'DOC', color: '#F59E0B' } // Paige
    }
    return null
  }

  // Filter out BMAD folders if enabled
  const filteredFiles = useMemo(() => {
    if (!hideBmadFolders) return changedFiles
    const folder = useStore.getState().outputFolder
    return changedFiles.filter((f) => !f.path.startsWith(folder + '/') && !f.path.startsWith('_bmad/'))
  }, [changedFiles, hideBmadFolders])

  // Calculate total stats
  const totalStats = useMemo(() => {
    const added = filteredFiles.filter((f) => f.status === 'A').length
    const modified = filteredFiles.filter((f) => f.status === 'M').length
    const deleted = filteredFiles.filter((f) => f.status === 'D').length
    return { added, modified, deleted, total: filteredFiles.length }
  }, [filteredFiles])

  // Get most recently modified files (top 5)
  const recentFiles = useMemo(() => {
    return [...filteredFiles]
      .map(f => ({
        ...f,
        // Use mtime if available (working directory), otherwise lastCommitTime
        sortTime: f.mtime || f.lastCommitTime || 0
      }))
      .filter(f => f.sortTime > 0)
      .sort((a, b) => b.sortTime - a.sortTime)
      .slice(0, 5)
  }, [filteredFiles])

  // Format relative time
  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  // Get status label
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'A': return 'Added'
      case 'M': return 'Modified'
      case 'D': return 'Deleted'
      case 'R': return 'Renamed'
      case 'C': return 'Copied'
      default: return 'Changed'
    }
  }

  // Early return when panel is closed
  if (!gitDiffPanelOpen || !branchName) return null

  return (
    <Box
      sx={{
        position: 'fixed',
        top: viewMode === 'board' ? 82 : 44,
        bottom: 0,
        right: showAgentPanel ? `${AGENT_PANEL_WIDTH}px` : 0,
        width: panelWidth,
        zIndex: 1199,
        bgcolor: 'background.paper',
        borderLeft: showAgentPanel ? 0 : 1,
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        transition: isDraggingRef.current ? 'none' : 'right 225ms cubic-bezier(0, 0, 0.2, 1)',
        boxShadow: showAgentPanel ? 0 : 8
      }}
    >
      {/* Resize handle */}
      <Box
        onMouseDown={handleResizeMouseDown}
        sx={{
          position: 'absolute',
          left: -3,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: 'col-resize',
          zIndex: 1,
          '&:hover': {
            bgcolor: 'primary.main',
            opacity: 0.3
          }
        }}
      />

      {/* Panel header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 56
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap>
            Branch Diff
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            <Chip
              label={branchName}
              size="small"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                bgcolor: 'primary.main',
                color: 'white',
                maxWidth: 200
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {totalStats.total} file{totalStats.total !== 1 ? 's' : ''}
            </Typography>
            {totalStats.added > 0 && (
              <Chip label={`+${totalStats.added}`} size="small" sx={{ height: 18, bgcolor: '#10B981', color: 'white', fontSize: '0.65rem' }} />
            )}
            {totalStats.modified > 0 && (
              <Chip label={`~${totalStats.modified}`} size="small" sx={{ height: 18, bgcolor: '#F59E0B', color: 'white', fontSize: '0.65rem' }} />
            )}
            {totalStats.deleted > 0 && (
              <Chip label={`-${totalStats.deleted}`} size="small" sx={{ height: 18, bgcolor: '#EF4444', color: 'white', fontSize: '0.65rem' }} />
            )}
            {workingTeammate && (
              <Chip
                label={`${workingTeammate.name} working`}
                size="small"
                sx={{
                  height: 18,
                  bgcolor: 'success.main',
                  color: 'white',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  animation: 'pulse 2s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.7 }
                  }
                }}
              />
            )}
          </Box>
        </Box>

        {/* Filter BMAD folders checkbox */}
        <FormControlLabel
          control={
            <Checkbox
              checked={hideBmadFolders}
              onChange={(e) => setHideBmadFolders(e.target.checked)}
              size="small"
            />
          }
          label={<Typography variant="caption">Hide BMAD</Typography>}
          sx={{ mr: 0 }}
        />

        {/* Commit button - only shown for current branch with changes */}
        {canCommit && (
          <Tooltip title={`Commit: ${getCommitMessage()}`}>
            <Button
              variant="contained"
              size="small"
              onClick={handleCommit}
              disabled={committing}
              startIcon={committing ? <CircularProgress size={14} color="inherit" /> : <CommitIcon />}
              sx={{ minWidth: 80 }}
            >
              {committing ? '...' : 'Commit'}
            </Button>
          </Tooltip>
        )}

        {/* Refresh button */}
        <Tooltip title="Refresh changes">
          <IconButton
            onClick={() => loadChangedFiles(true)}
            disabled={loading || refreshing}
            size="small"
            sx={{ color: 'text.secondary' }}
          >
            <RefreshIcon
              sx={{
                fontSize: 18,
                animation: refreshing ? 'spin 1s linear infinite' : 'none',
                '@keyframes spin': {
                  '0%': { transform: 'rotate(0deg)' },
                  '100%': { transform: 'rotate(360deg)' }
                }
              }}
            />
          </IconButton>
        </Tooltip>

        {/* View mode toggle */}
        <ToggleButtonGroup
          value={diffMode}
          exclusive
          onChange={(_, value) => value !== null && setDiffMode(value)}
          size="small"
        >
          <Tooltip title="Split view">
            <ToggleButton value={DiffModeEnum.Split} sx={{ px: 0.5 }}>
              <ViewColumnIcon sx={{ fontSize: 16 }} />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Unified view">
            <ToggleButton value={DiffModeEnum.Unified} sx={{ px: 0.5 }}>
              <ViewStreamIcon sx={{ fontSize: 16 }} />
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>

        <IconButton onClick={closeGitDiffPanel} size="small">
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* Panel body — scrollable */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {/* Commit error alert */}
        {commitError && (
          <Alert severity="error" onClose={() => setCommitError(null)} sx={{ m: 2, mb: 0 }}>
            {commitError}
          </Alert>
        )}

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            <Tab label="All Changes" />
            <Tab label={`Commits${commits.length > 0 ? ` (${commits.length})` : ''}`} icon={<CommitIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
          </Tabs>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} />
            <Typography sx={{ ml: 2 }} color="text.secondary">
              Loading branch changes...
            </Typography>
          </Box>
        ) : error ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography color="error">{error}</Typography>
          </Box>
        ) : filteredFiles.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography color="text.secondary">
              {changedFiles.length > 0 && hideBmadFolders
                ? 'No changes found (BMAD folders hidden)'
                : 'No changes found on this branch'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 2 }}>
            {/* Tab 0: All Changes */}
            {activeTab === 0 && (
              <>
                {/* Recent Activity Section */}
                {recentFiles.length > 0 && (
                  <Box
                    sx={{
                      mb: 2,
                      p: 2,
                      bgcolor: 'action.hover',
                      borderRadius: 2,
                      border: 1,
                      borderColor: 'divider'
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                      Recent Activity
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      {recentFiles.map((file) => (
                        <Box
                          key={file.path}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            fontSize: '0.85rem'
                          }}
                        >
                          <Typography
                            component="span"
                            sx={{
                              fontWeight: 600,
                              color: file.status === 'A' ? '#10B981' : file.status === 'D' ? '#EF4444' : '#F59E0B',
                              minWidth: 70
                            }}
                          >
                            {getStatusLabel(file.status)}
                          </Typography>
                          <Typography
                            component="span"
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {file.path}
                          </Typography>
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                            sx={{ whiteSpace: 'nowrap' }}
                          >
                            {formatRelativeTime(file.sortTime)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {/* File Diffs */}
                {filteredFiles.map((file) => (
                  <FileDiff
                    key={file.path}
                    file={file}
                    projectPath={projectPath!}
                    mergeBase={mergeBase}
                    branchName={branchName}
                    themeMode={themeMode}
                    diffMode={diffMode}
                    isCurrentBranch={isCurrentBranch}
                  />
                ))}
              </>
            )}

            {/* Tab 1: Commits */}
            {activeTab === 1 && (
              <>
                {commitsLoading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
                    <CircularProgress size={24} />
                    <Typography sx={{ ml: 2 }} color="text.secondary">
                      Loading commits...
                    </Typography>
                  </Box>
                ) : selectedCommit ? (
                  // Show selected commit's diff
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <IconButton size="small" onClick={() => setSelectedCommit(null)}>
                        <ArrowBackIcon />
                      </IconButton>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {selectedCommit.subject}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {selectedCommit.hash.substring(0, 7)} • {selectedCommit.author} • {formatRelativeTime(selectedCommit.timestamp)}
                        </Typography>
                      </Box>
                      {getAgentFromCommit(selectedCommit.subject) && (
                        <Chip
                          label={getAgentFromCommit(selectedCommit.subject)!.name}
                          size="small"
                          sx={{
                            bgcolor: getAgentFromCommit(selectedCommit.subject)!.color,
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '0.7rem'
                          }}
                        />
                      )}
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    {commitFilesLoading ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
                        <CircularProgress size={24} />
                        <Typography sx={{ ml: 2 }} color="text.secondary">
                          Loading files...
                        </Typography>
                      </Box>
                    ) : (
                      commitFiles.map((file) => (
                        <CommitFileDiff
                          key={file.path}
                          file={file}
                          projectPath={projectPath!}
                          commitHash={selectedCommit.hash}
                          themeMode={themeMode}
                          diffMode={diffMode}
                        />
                      ))
                    )}
                  </Box>
                ) : commits.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 8 }}>
                    <Typography color="text.secondary">No commits found on this branch</Typography>
                  </Box>
                ) : (
                  // Commit list
                  <List disablePadding>
                    {commits.map((commit, index) => {
                      const agent = getAgentFromCommit(commit.subject)
                      return (
                        <ListItemButton
                          key={commit.hash}
                          onClick={() => setSelectedCommit(commit)}
                          sx={{
                            borderBottom: index < commits.length - 1 ? 1 : 0,
                            borderColor: 'divider'
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
                            <CommitIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                            {agent && (
                              <Tooltip title={`${agent.name} agent work`}>
                                <Chip
                                  label={agent.name}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    bgcolor: agent.color,
                                    color: 'white',
                                    fontWeight: 600,
                                    fontSize: '0.65rem',
                                    minWidth: 50
                                  }}
                                />
                              </Tooltip>
                            )}
                          </Box>
                          <ListItemText
                            primary={commit.subject}
                            secondary={
                              <Typography variant="caption" color="text.secondary">
                                {commit.hash.substring(0, 7)} • {commit.author} • {formatRelativeTime(commit.timestamp)}
                              </Typography>
                            }
                            primaryTypographyProps={{
                              variant: 'body2',
                              fontWeight: 500,
                              sx: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                            }}
                          />
                        </ListItemButton>
                      )
                    })}
                  </List>
                )}
              </>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}
