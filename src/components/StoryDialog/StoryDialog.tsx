import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  Chip,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Tooltip,
  Checkbox,
  FormControlLabel,
  Paper,
  TextField,
  Button
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import VerifiedIcon from '@mui/icons-material/Verified'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { useStore } from '../../store'
import { useThemedSyntax } from '../../hooks/useThemedSyntax'
import { EPIC_COLORS, STATUS_COLUMNS } from '../../types'
import { useWorkflow } from '../../hooks/useWorkflow'
import { parseStoryContent } from '../../utils/parseStory'
import ChatHistorySection from './ChatHistorySection'
import StatusHistorySection from './StatusHistorySection'

// Factory function to create code component with theme awareness
const createCodeBlock = (
  prismStyle: Record<string, React.CSSProperties>,
  codeColors: { background: string; color: string }
): Components['code'] => {
  return ({ className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1] : ''
    const codeString = String(children).replace(/\n$/, '')
    const isInline = !match && !codeString.includes('\n')

    if (isInline) {
      return (
        <code
          style={{
            backgroundColor: codeColors.background,
            color: codeColors.color,
            padding: '2px 6px',
            borderRadius: 4,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '0.85em'
          }}
          {...props}
        >
          {children}
        </code>
      )
    }

    return (
      <SyntaxHighlighter
        style={prismStyle}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: '8px 0',
          borderRadius: 8,
          fontSize: '0.85rem'
        }}
      >
        {codeString}
      </SyntaxHighlighter>
    )
  }
}

export default function StoryDialog() {
  const selectedStory = useStore((state) => state.selectedStory)
  const storyContent = useStore((state) => state.storyContent)
  const setSelectedStory = useStore((state) => state.setSelectedStory)
  const setStoryContent = useStore((state) => state.setStoryContent)
  const epics = useStore((state) => state.epics)
  const humanReviewChecklist = useStore((state) => state.humanReviewChecklist)
  const humanReviewStates = useStore((state) => state.humanReviewStates)
  const toggleReviewItem = useStore((state) => state.toggleReviewItem)
  const enableHumanReviewColumn = useStore((state) => state.enableHumanReviewColumn)
  const getEffectiveStatus = useStore((state) => state.getEffectiveStatus)
  const projectPath = useStore((state) => state.projectPath)
  const chatThreads = useStore((state) => state.chatThreads)
  const { prismStyle, inlineCodeColors } = useThemedSyntax()

  // Get agents from workflow
  const { agents } = useWorkflow()

  const openGitDiffPanel = useStore((state) => state.openGitDiffPanel)
  const developerMode = useStore((state) => state.developerMode)

  // Right side panel state: only one can be open at a time
  const [sidePanel, setSidePanel] = useState<'none' | 'devNotes' | 'devRecord'>('none')

  // Dev record editing state (human mode only)
  const [editingDevRecord, setEditingDevRecord] = useState(false)
  const [devRecordDraft, setDevRecordDraft] = useState('')

  // Task CRUD state (human mode only)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [addingTaskParent, setAddingTaskParent] = useState<number | null>(null) // -1 = top-level, >= 0 = subtask under that index
  const [addDraft, setAddDraft] = useState('')

  // Auto-open implementation notes for ready-for-dev and in-progress stories
  useEffect(() => {
    if (selectedStory && storyContent?.devNotes) {
      const status = selectedStory.status
      if (status === 'ready-for-dev' || status === 'in-progress') {
        setSidePanel('devNotes')
      }
    }
  }, [selectedStory?.id, storyContent?.devNotes])

  // Git diff state
  const [branchExists, setBranchExists] = useState(false)

  // Check if the story's branch exists
  useEffect(() => {
    const checkBranch = async () => {
      if (!projectPath || !selectedStory) {
        setBranchExists(false)
        return
      }
      try {
        const branchName = selectedStory.id
        const result = await window.gitAPI.branchExists(projectPath, branchName)
        setBranchExists(result.exists)
      } catch {
        setBranchExists(false)
      }
    }
    checkBranch()
  }, [projectPath, selectedStory])

  // Create theme-aware code block component (memoized to avoid recreation on every render)
  const CodeBlock = React.useMemo(() => createCodeBlock(prismStyle, inlineCodeColors), [prismStyle, inlineCodeColors])

  // Reset edit state when side panel changes (auto-enter edit for empty dev record in human mode)
  useEffect(() => {
    if (sidePanel === 'devRecord' && !storyContent?.developmentRecord && developerMode === 'human') {
      setEditingDevRecord(true)
      setDevRecordDraft('')
    } else {
      setEditingDevRecord(false)
      setDevRecordDraft('')
    }
  }, [sidePanel, storyContent?.developmentRecord, developerMode])

  const handleClose = () => {
    setSidePanel('none')
    setEditingDevRecord(false)
    setSelectedStory(null)
  }

  const handleSaveDevRecord = async () => {
    if (!selectedStory?.filePath) return
    const result = await window.fileAPI.updateDevelopmentRecord(selectedStory.filePath, devRecordDraft)
    if (result.success) {
      const fileResult = await window.fileAPI.readFile(selectedStory.filePath)
      if (fileResult.content) {
        setStoryContent(parseStoryContent(fileResult.content))
      }
      setEditingDevRecord(false)
    }
  }

  const handleToggleTask = async (taskIndex: number, subtaskIndex: number = -1) => {
    if (!selectedStory?.filePath) return
    const result = await window.fileAPI.toggleStoryTask(selectedStory.filePath, taskIndex, subtaskIndex)
    if (result.success) {
      const fileResult = await window.fileAPI.readFile(selectedStory.filePath)
      if (fileResult.content) {
        setStoryContent(parseStoryContent(fileResult.content))
      }
    }
  }

  const reloadStoryContent = async () => {
    if (!selectedStory?.filePath) return
    const fileResult = await window.fileAPI.readFile(selectedStory.filePath)
    if (fileResult.content) {
      setStoryContent(parseStoryContent(fileResult.content))
    }
  }

  const handleAddTask = async (parentTaskIndex: number, title: string) => {
    if (!selectedStory?.filePath || !title.trim()) return
    const result = await window.fileAPI.addStoryTask(selectedStory.filePath, parentTaskIndex, title.trim())
    if (result.success) {
      await reloadStoryContent()
      setAddingTaskParent(null)
      setAddDraft('')
    }
  }

  const handleEditTask = async (taskIndex: number, subtaskIndex: number, newTitle: string) => {
    if (!selectedStory?.filePath || !newTitle.trim()) return
    const result = await window.fileAPI.editStoryTask(selectedStory.filePath, taskIndex, subtaskIndex, newTitle.trim())
    if (result.success) {
      await reloadStoryContent()
      setEditingTaskId(null)
      setEditDraft('')
    }
  }

  const handleDeleteTask = async (taskIndex: number, subtaskIndex: number) => {
    if (!selectedStory?.filePath) return
    const result = await window.fileAPI.deleteStoryTask(selectedStory.filePath, taskIndex, subtaskIndex)
    if (result.success) {
      await reloadStoryContent()
    }
  }

  if (!selectedStory) return null

  const branchName = selectedStory.id

  // Find if a chat teammate is working on this story's branch
  const workingTeammate = (() => {
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

  const effectiveStatus = getEffectiveStatus(selectedStory)
  const epicColor = EPIC_COLORS[(selectedStory.epicId - 1) % EPIC_COLORS.length]
  const statusConfig = STATUS_COLUMNS.find((c) => c.status === effectiveStatus)
  const selectedEpic = epics.find((e) => e.id === selectedStory.epicId)

  return (
    <Dialog
      open={Boolean(selectedStory)}
      onClose={handleClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '90vh',
          maxWidth: sidePanel !== 'none' ? '95vw' : 960,
          transition: 'max-width 0.3s ease'
        }
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 2,
          pr: 6
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Chip
              label={`Epic ${selectedStory.epicId}`}
              size="small"
              sx={{
                bgcolor: epicColor,
                color: 'white',
                fontWeight: 600
              }}
            />
            <Chip
              label={statusConfig?.label || effectiveStatus}
              size="small"
              sx={{
                bgcolor: statusConfig?.color,
                color: 'white',
                fontWeight: 600
              }}
            />
            {workingTeammate && (
              <Chip
                label={`${workingTeammate.name} working`}
                size="small"
                sx={{
                  bgcolor: 'success.main',
                  color: 'white',
                  fontWeight: 600,
                  animation: 'pulse 2s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.7 }
                  }
                }}
              />
            )}
            <Typography variant="body2" color="text.secondary">
              Story {selectedStory.epicId}.{selectedStory.storyNumber}
            </Typography>
          </Box>
        </Box>

        {/* Git Diff button - only shown if branch exists */}
        {branchExists && (
          <Tooltip title="View branch diff">
            <IconButton
              onClick={() => openGitDiffPanel(branchName)}
              sx={{
                position: 'absolute',
                right: 56,
                top: 16,
                color: 'success.main'
              }}
            >
              <CompareArrowsIcon />
            </IconButton>
          </Tooltip>
        )}

        <IconButton
          onClick={handleClose}
          sx={{
            position: 'absolute',
            right: 16,
            top: 16
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, display: 'flex', overflow: 'hidden' }}>
        {!storyContent && selectedStory.filePath ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              py: 6,
              gap: 2
            }}
          >
            <CircularProgress size={24} />
            <Typography color="text.secondary">Loading story content...</Typography>
          </Box>
        ) : (
          <>
          <Box sx={{ flex: 1, overflowY: 'auto', minWidth: 0, width: sidePanel !== 'none' ? '50%' : '100%', display: 'flex', flexDirection: 'column' }}>

            {/* === Epic Metadata (always shown when available) === */}

            {/* Epic Context (Collapsible) */}
            {selectedEpic && selectedEpic.goal && (
              <Accordion elevation={0} disableGutters defaultExpanded={false}>
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{ px: 3, bgcolor: 'action.hover' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: epicColor,
                        flexShrink: 0
                      }}
                    />
                    <Typography variant="subtitle2" fontWeight={600}>
                      Epic {selectedEpic.id}: {selectedEpic.name}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 3, py: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Goal:</strong> {selectedEpic.goal}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            )}

            {/* User Story from epics.md - skip when story file exists (duplicated in story description) */}
            {selectedStory.epicDescription && !storyContent && (
              <Box sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  User Story
                </Typography>
                <Box
                  sx={{
                    bgcolor: 'action.hover',
                    borderRadius: 2,
                    p: 2,
                    '& p': { m: 0, mb: 1, '&:last-child': { mb: 0 } },
                    '& ul, & ol': { pl: 3, mb: 1, '& li': { mb: 0.5 } }
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
                    {selectedStory.epicDescription}
                  </ReactMarkdown>
                </Box>
              </Box>
            )}

            {/* Acceptance Criteria Preview from epics.md - skip when story file exists (duplicated in story AC) */}
            {selectedStory.acceptanceCriteriaPreview && selectedStory.acceptanceCriteriaPreview.length > 0 && !storyContent && (
              <>
                <Divider />
                <Box sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Acceptance Criteria
                  </Typography>
                  <List dense disablePadding>
                    {selectedStory.acceptanceCriteriaPreview.map((ac, index) => (
                      <ListItem key={index} sx={{ px: 0, py: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              bgcolor: 'primary.main',
                              color: 'white',
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 600
                            }}
                          >
                            {index + 1}
                          </Typography>
                        </ListItemIcon>
                        <ListItemText primary={ac} primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              </>
            )}

            {/* Technical Notes */}
            {selectedStory.technicalNotes && (
              <>
                <Divider />
                <Accordion elevation={0} disableGutters defaultExpanded>
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{ px: 3, bgcolor: 'action.hover' }}
                  >
                    <Typography variant="h6">Technical Notes</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 3 }}>
                    <Box
                      sx={{
                        '& p': { mb: 1 },
                        '& ul, & ol': { pl: 3, mb: 1 }
                      }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
                        {selectedStory.technicalNotes}
                      </ReactMarkdown>
                    </Box>
                  </AccordionDetails>
                </Accordion>
              </>
            )}

            {/* FRs Addressed */}
            {selectedStory.frsAddressed && selectedStory.frsAddressed.length > 0 && (
              <>
                <Divider />
                <Box sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Functional Requirements Addressed
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {selectedStory.frsAddressed.map((fr, index) => (
                      <Box
                        key={index}
                        sx={{
                          px: 1.5,
                          py: 0.5,
                          bgcolor: 'warning.main',
                          color: 'white',
                          borderRadius: 1,
                          fontSize: '0.875rem',
                          fontWeight: 500
                        }}
                      >
                        {fr}
                      </Box>
                    ))}
                  </Box>
                </Box>
              </>
            )}

            {/* === Story File Content (only when storyContent exists) === */}
            {storyContent && (
              <>
                <Divider />

                {/* Story Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', px: 3, minHeight: 48, bgcolor: 'action.hover' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: epicColor,
                        flexShrink: 0
                      }}
                    />
                    <Typography variant="subtitle2" fontWeight={600}>
                      Story {selectedStory.epicId}.{selectedStory.storyNumber}: {selectedStory.title}
                    </Typography>
                  </Box>
                </Box>

                {/* Story Description */}
                <Box sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    User Story
                  </Typography>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      '& p': { m: 0, mb: 1, '&:last-child': { mb: 0 } },
                      '& ul, & ol': {
                        pl: 3,
                        mb: 1,
                        '& li': { mb: 0.5 }
                      }
                    }}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
                      {storyContent.description}
                    </ReactMarkdown>
                  </Paper>
                </Box>

                {/* Human Review Checklist - shows for human-review status OR done status when human review is enabled */}
                {(effectiveStatus === 'human-review' || (enableHumanReviewColumn && selectedStory.status === 'done')) && humanReviewChecklist.length > 0 && (
                  <>
                    <Divider />
                    <Box sx={{ p: 3, bgcolor: 'action.hover' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <AssignmentTurnedInIcon color="primary" />
                        <Typography variant="h6">
                          Human Review Checklist ({(humanReviewStates[selectedStory.id]?.checkedItems.length || 0)}/{humanReviewChecklist.length})
                        </Typography>
                        <Tooltip title="Check to approve this story" arrow>
                          <InfoOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', cursor: 'help' }} />
                        </Tooltip>
                      </Box>
                      <List dense disablePadding>
                        {humanReviewChecklist.map((item) => {
                          const isChecked = humanReviewStates[selectedStory.id]?.checkedItems.includes(item.id) || false
                          return (
                            <ListItem key={item.id} sx={{ px: 0, py: 0.5 }}>
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={isChecked}
                                    onChange={() => toggleReviewItem(selectedStory.id, item.id)}
                                    color="success"
                                  />
                                }
                                label={
                                  <Box>
                                    <Typography fontWeight={500} sx={{ color: isChecked ? 'text.secondary' : 'text.primary' }}>
                                      {item.label}
                                    </Typography>
                                    {item.description && (
                                      <Typography variant="caption" color="text.secondary" display="block">
                                        {item.description}
                                      </Typography>
                                    )}
                                  </Box>
                                }
                                sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { pt: 0.5 } }}
                              />
                            </ListItem>
                          )
                        })}
                      </List>

                      {/* Progress indicator */}
                      <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                        <Typography
                          variant="body2"
                          color={(humanReviewStates[selectedStory.id]?.checkedItems.length || 0) === humanReviewChecklist.length ? 'success.main' : 'text.secondary'}
                          fontWeight={500}
                        >
                          {(humanReviewStates[selectedStory.id]?.checkedItems.length || 0) === humanReviewChecklist.length
                            ? 'All items approved. Story review complete.'
                            : `${humanReviewChecklist.length - (humanReviewStates[selectedStory.id]?.checkedItems.length || 0)} item(s) remaining to review.`
                          }
                        </Typography>
                      </Box>
                    </Box>
                  </>
                )}

                <Divider />

                {/* Acceptance Criteria */}
                <Box sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="h6">
                      Acceptance Criteria {storyContent.acceptanceCriteria.length > 0 ? `(${storyContent.acceptanceCriteria.length})` : ''}
                    </Typography>
                    <Tooltip title="Criteria that must be met for the story to be considered complete. Written by PM (John)." arrow>
                      <InfoOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', cursor: 'help' }} />
                    </Tooltip>
                  </Box>
                  {storyContent.acceptanceCriteria.length > 0 ? (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                  <List dense disablePadding>
                    {storyContent.acceptanceCriteria.map((ac, index) => (
                      <ListItem key={ac.id} sx={{ px: 0, py: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              bgcolor: 'primary.main',
                              color: 'white',
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 600
                            }}
                          >
                            {index + 1}
                          </Typography>
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ '& p': { m: 0 } }}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>{ac.title}</ReactMarkdown>
                            </Box>
                          }
                          secondary={
                            ac.description ? (
                              <Box sx={{ '& p': { m: 0 } }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>{ac.description}</ReactMarkdown>
                              </Box>
                            ) : null
                          }
                          primaryTypographyProps={{ fontWeight: 500, component: 'div' }}
                          secondaryTypographyProps={{ component: 'div' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                  </Paper>
                  ) : storyContent.acceptanceCriteriaRaw ? (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      '& p': { m: 0, mb: 1, '&:last-child': { mb: 0 } },
                      '& ul, & ol': { pl: 3, mb: 1, '& li': { mb: 0.5 } }
                    }}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
                      {storyContent.acceptanceCriteriaRaw}
                    </ReactMarkdown>
                  </Paper>
                  ) : null}
                </Box>

                <Divider />

                {/* Tasks */}
                {(storyContent.tasks.length > 0 || (developerMode === 'human' && selectedStory?.filePath)) && (
                  <>
                    <Box sx={{ p: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Typography variant="h6">
                          Tasks ({storyContent.tasks.filter((t) => t.completed).length}/{storyContent.tasks.length})
                        </Typography>
                        <Tooltip title="Implementation tasks. Click to toggle completion." arrow>
                          <InfoOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', cursor: 'help' }} />
                        </Tooltip>
                        {developerMode === 'human' && selectedStory?.filePath && (
                          <Tooltip title="Add task">
                            <IconButton
                              size="small"
                              onClick={() => { setAddingTaskParent(-1); setAddDraft('') }}
                              sx={{ ml: 'auto' }}
                            >
                              <AddIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                      {storyContent.tasks.length > 0 ? (
                      <Paper variant="outlined" sx={{ p: 2 }}>
                      <List dense disablePadding>
                        {storyContent.tasks.map((task, taskIdx) => (
                          <Box key={task.id}>
                            <ListItem
                              sx={{ px: 0, py: 0.5, cursor: 'pointer', borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' }, '&:hover .task-actions': { opacity: 1 } }}
                              onClick={() => {
                                if (editingTaskId !== task.id) handleToggleTask(taskIdx)
                              }}
                            >
                              <ListItemIcon sx={{ minWidth: 32 }}>
                                <Checkbox
                                  checked={task.completed}
                                  size="small"
                                  color="success"
                                  sx={{ p: 0 }}
                                  tabIndex={-1}
                                  disableRipple
                                />
                              </ListItemIcon>
                              {editingTaskId === task.id ? (
                                <TextField
                                  size="small"
                                  fullWidth
                                  autoFocus
                                  value={editDraft}
                                  onChange={(e) => setEditDraft(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => {
                                    e.stopPropagation()
                                    if (e.key === 'Enter') {
                                      handleEditTask(taskIdx, -1, editDraft)
                                    } else if (e.key === 'Escape') {
                                      setEditingTaskId(null)
                                      setEditDraft('')
                                    }
                                  }}
                                  sx={{ '& .MuiInputBase-input': { py: 0.5, fontSize: '0.875rem' } }}
                                />
                              ) : (
                                <ListItemText
                                  primary={
                                    <Box sx={{ '& p': { m: 0 } }}>
                                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>{task.title}</ReactMarkdown>
                                    </Box>
                                  }
                                  primaryTypographyProps={{ fontWeight: 500, component: 'div' }}
                                />
                              )}
                              {developerMode === 'human' && editingTaskId !== task.id && (
                                <Box className="task-actions" sx={{ display: 'flex', opacity: 0, transition: 'opacity 0.15s', ml: 1 }}>
                                  <Tooltip title="Add subtask">
                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAddingTaskParent(taskIdx); setAddDraft('') }}>
                                      <AddIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Edit">
                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setEditingTaskId(task.id); setEditDraft(task.title) }}>
                                      <EditIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Delete task and subtasks">
                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDeleteTask(taskIdx, -1) }}>
                                      <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              )}
                            </ListItem>
                            {task.subtasks.length > 0 && (
                              <List dense disablePadding sx={{ pl: 4 }}>
                                {task.subtasks.map((subtask, subtaskIdx) => (
                                  <ListItem
                                    key={subtask.id}
                                    sx={{ px: 0, py: 0.25, cursor: 'pointer', borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' }, '&:hover .task-actions': { opacity: 1 } }}
                                    onClick={() => {
                                      if (editingTaskId !== subtask.id) handleToggleTask(taskIdx, subtaskIdx)
                                    }}
                                  >
                                    <ListItemIcon sx={{ minWidth: 28 }}>
                                      <Checkbox
                                        checked={subtask.completed}
                                        size="small"
                                        color="success"
                                        sx={{ p: 0, '& .MuiSvgIcon-root': { fontSize: 18 } }}
                                        tabIndex={-1}
                                        disableRipple
                                      />
                                    </ListItemIcon>
                                    {editingTaskId === subtask.id ? (
                                      <TextField
                                        size="small"
                                        fullWidth
                                        autoFocus
                                        value={editDraft}
                                        onChange={(e) => setEditDraft(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => {
                                          e.stopPropagation()
                                          if (e.key === 'Enter') {
                                            handleEditTask(taskIdx, subtaskIdx, editDraft)
                                          } else if (e.key === 'Escape') {
                                            setEditingTaskId(null)
                                            setEditDraft('')
                                          }
                                        }}
                                        sx={{ '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8rem' } }}
                                      />
                                    ) : (
                                      <ListItemText
                                        primary={
                                          <Box sx={{
                                            '& p': { m: 0 },
                                            fontSize: '0.875rem',
                                          }}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>{subtask.title}</ReactMarkdown>
                                          </Box>
                                        }
                                        primaryTypographyProps={{ component: 'div' }}
                                      />
                                    )}
                                    {developerMode === 'human' && editingTaskId !== subtask.id && (
                                      <Box className="task-actions" sx={{ display: 'flex', opacity: 0, transition: 'opacity 0.15s', ml: 1 }}>
                                        <Tooltip title="Edit">
                                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setEditingTaskId(subtask.id); setEditDraft(subtask.title) }}>
                                            <EditIcon sx={{ fontSize: 16 }} />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete subtask">
                                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDeleteTask(taskIdx, subtaskIdx) }}>
                                            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                          </IconButton>
                                        </Tooltip>
                                      </Box>
                                    )}
                                  </ListItem>
                                ))}
                                {/* Inline add subtask */}
                                {addingTaskParent === taskIdx && (
                                  <ListItem sx={{ px: 0, py: 0.5 }}>
                                    <ListItemIcon sx={{ minWidth: 28 }} />
                                    <TextField
                                      size="small"
                                      fullWidth
                                      autoFocus
                                      placeholder="New subtask..."
                                      value={addDraft}
                                      onChange={(e) => setAddDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && addDraft.trim()) {
                                          handleAddTask(taskIdx, addDraft)
                                        } else if (e.key === 'Escape') {
                                          setAddingTaskParent(null)
                                          setAddDraft('')
                                        }
                                      }}
                                      onBlur={() => {
                                        if (!addDraft.trim()) {
                                          setAddingTaskParent(null)
                                          setAddDraft('')
                                        }
                                      }}
                                      sx={{ '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8rem' } }}
                                    />
                                  </ListItem>
                                )}
                              </List>
                            )}
                            {/* Inline add subtask when task has no subtasks yet */}
                            {task.subtasks.length === 0 && addingTaskParent === taskIdx && (
                              <List dense disablePadding sx={{ pl: 4 }}>
                                <ListItem sx={{ px: 0, py: 0.5 }}>
                                  <ListItemIcon sx={{ minWidth: 28 }} />
                                  <TextField
                                    size="small"
                                    fullWidth
                                    autoFocus
                                    placeholder="New subtask..."
                                    value={addDraft}
                                    onChange={(e) => setAddDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && addDraft.trim()) {
                                        handleAddTask(taskIdx, addDraft)
                                      } else if (e.key === 'Escape') {
                                        setAddingTaskParent(null)
                                        setAddDraft('')
                                      }
                                    }}
                                    onBlur={() => {
                                      if (!addDraft.trim()) {
                                        setAddingTaskParent(null)
                                        setAddDraft('')
                                      }
                                    }}
                                    sx={{ '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8rem' } }}
                                  />
                                </ListItem>
                              </List>
                            )}
                          </Box>
                        ))}
                      </List>
                      {/* Inline add top-level task */}
                      {addingTaskParent === -1 && (
                        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox disabled size="small" sx={{ p: 0 }} />
                          <TextField
                            size="small"
                            fullWidth
                            autoFocus
                            placeholder="New task..."
                            value={addDraft}
                            onChange={(e) => setAddDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && addDraft.trim()) {
                                handleAddTask(-1, addDraft)
                              } else if (e.key === 'Escape') {
                                setAddingTaskParent(null)
                                setAddDraft('')
                              }
                            }}
                            onBlur={() => {
                              if (!addDraft.trim()) {
                                setAddingTaskParent(null)
                                setAddDraft('')
                              }
                            }}
                            sx={{ '& .MuiInputBase-input': { py: 0.5, fontSize: '0.875rem' } }}
                          />
                        </Box>
                      )}
                      </Paper>
                      ) : (
                        <Paper variant="outlined" sx={{ p: 2 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: addingTaskParent === -1 ? 1 : 0 }}>
                            No tasks yet. Click + to add one.
                          </Typography>
                          {addingTaskParent === -1 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Checkbox disabled size="small" sx={{ p: 0 }} />
                              <TextField
                                size="small"
                                fullWidth
                                autoFocus
                                placeholder="New task..."
                                value={addDraft}
                                onChange={(e) => setAddDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && addDraft.trim()) {
                                    handleAddTask(-1, addDraft)
                                  } else if (e.key === 'Escape') {
                                    setAddingTaskParent(null)
                                    setAddDraft('')
                                  }
                                }}
                                onBlur={() => {
                                  if (!addDraft.trim()) {
                                    setAddingTaskParent(null)
                                    setAddDraft('')
                                  }
                                }}
                                sx={{ '& .MuiInputBase-input': { py: 0.5, fontSize: '0.875rem' } }}
                              />
                            </Box>
                          )}
                        </Paper>
                      )}
                    </Box>
                    <Divider />
                  </>
                )}

                {/* File Changes (Collapsible) */}
                {storyContent.fileChanges && (
                  <Accordion elevation={0} disableGutters>
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon />}
                      sx={{ px: 3, bgcolor: 'action.hover' }}
                    >
                      <Typography variant="h6">File Changes</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 3 }}>
                      {storyContent.fileChanges.created.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                          <Typography
                            variant="subtitle2"
                            sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
                          >
                            <AddIcon fontSize="small" color="success" />
                            Created ({storyContent.fileChanges.created.length})
                          </Typography>
                          <Box
                            component="ul"
                            sx={{
                              m: 0,
                              pl: 3,
                              '& li': { fontFamily: 'monospace', fontSize: '0.875rem' }
                            }}
                          >
                            {storyContent.fileChanges.created.map((file, i) => (
                              <li key={i}>{file}</li>
                            ))}
                          </Box>
                        </Box>
                      )}

                      {storyContent.fileChanges.modified.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                          <Typography
                            variant="subtitle2"
                            sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
                          >
                            <EditIcon fontSize="small" color="warning" />
                            Modified ({storyContent.fileChanges.modified.length})
                          </Typography>
                          <Box
                            component="ul"
                            sx={{
                              m: 0,
                              pl: 3,
                              '& li': { fontFamily: 'monospace', fontSize: '0.875rem' }
                            }}
                          >
                            {storyContent.fileChanges.modified.map((file, i) => (
                              <li key={i}>{file}</li>
                            ))}
                          </Box>
                        </Box>
                      )}

                      {storyContent.fileChanges.verified.length > 0 && (
                        <Box>
                          <Typography
                            variant="subtitle2"
                            sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
                          >
                            <VerifiedIcon fontSize="small" color="info" />
                            Verified ({storyContent.fileChanges.verified.length})
                          </Typography>
                          <Box
                            component="ul"
                            sx={{
                              m: 0,
                              pl: 3,
                              '& li': { fontFamily: 'monospace', fontSize: '0.875rem' }
                            }}
                          >
                            {storyContent.fileChanges.verified.map((file, i) => (
                              <li key={i}>{file}</li>
                            ))}
                          </Box>
                        </Box>
                      )}
                    </AccordionDetails>
                  </Accordion>
                )}

                {/* Chat History (Collapsible) */}
                <ChatHistorySection storyId={selectedStory.id} />

                {/* Status History (Collapsible) */}
                <StatusHistorySection storyId={selectedStory.id} />
              </>
            )}

            {/* No content message - only show when both epic metadata and storyContent are absent */}
            {!storyContent && !selectedStory.epicDescription && !selectedStory.acceptanceCriteriaPreview && !selectedStory.technicalNotes && !selectedStory.frsAddressed && (
              <Box sx={{ p: 3 }}>
                <Typography color="text.secondary">
                  No story file available. This story is still in backlog.
                </Typography>
              </Box>
            )}
          </Box>

          {/* Side Panel Edge Tabs */}
          {(storyContent?.devNotes || storyContent?.developmentRecord) && sidePanel === 'none' && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                borderLeft: 1,
                borderColor: 'divider'
              }}
            >
              {storyContent?.devNotes && (
                <Box
                  onClick={() => setSidePanel('devNotes')}
                  sx={{
                    writingMode: 'vertical-rl',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    px: 0.5,
                    flex: 1,
                    cursor: 'pointer',
                    bgcolor: 'text.primary',
                    color: 'background.paper',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    letterSpacing: 2,
                    userSelect: 'none',
                    transition: 'opacity 0.2s',
                    '&:hover': { opacity: 0.85 }
                  }}
                >
                  <ChevronRightIcon sx={{ fontSize: 18 }} />
                  Implementation Notes
                  <ChevronRightIcon sx={{ fontSize: 18 }} />
                </Box>
              )}
              {(storyContent?.developmentRecord || (developerMode === 'human' && selectedStory?.filePath && storyContent?.devNotes)) && (
                <Box
                  onClick={() => setSidePanel('devRecord')}
                  sx={{
                    writingMode: 'vertical-rl',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    px: 0.5,
                    flex: 1,
                    cursor: 'pointer',
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    letterSpacing: 2,
                    userSelect: 'none',
                    transition: 'opacity 0.2s',
                    borderTop: storyContent?.devNotes ? 1 : 0,
                    borderColor: 'divider',
                    '&:hover': { opacity: 0.85 }
                  }}
                >
                  <ChevronRightIcon sx={{ fontSize: 18 }} />
                  {storyContent?.developmentRecord ? 'Dev Record' : '+ Dev Record'}
                  <ChevronRightIcon sx={{ fontSize: 18 }} />
                </Box>
              )}
            </Box>
          )}

          {/* Side Panel */}
          {sidePanel !== 'none' && (sidePanel === 'devNotes' ? storyContent?.devNotes : (storyContent?.developmentRecord || editingDevRecord)) && (
            <>
              <Divider orientation="vertical" flexItem />
              <Box
                sx={{
                  width: '50%',
                  flexShrink: 0,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, minHeight: 48, bgcolor: 'action.hover' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: epicColor,
                        flexShrink: 0
                      }}
                    />
                    <Typography variant="subtitle2" fontWeight={600}>
                      {sidePanel === 'devNotes' ? 'Implementation Notes' : 'Development Record'}
                    </Typography>
                    <Tooltip title={sidePanel === 'devNotes'
                      ? 'AI-generated guidance for implementing this story, including architecture decisions and approach notes.'
                      : 'Log of development activity, decisions made, and progress notes recorded during implementation.'
                    } arrow>
                      <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled', cursor: 'help' }} />
                    </Tooltip>
                    {/* Edit icon next to title (human mode, dev record only) */}
                    {sidePanel === 'devRecord' && developerMode === 'human' && selectedStory?.filePath && !editingDevRecord && (
                      <Tooltip title="Edit Development Record">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setEditingDevRecord(true)
                            setDevRecordDraft(storyContent?.developmentRecord || '')
                          }}
                        >
                          <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {/* Toggle to the other panel if both are available */}
                    {storyContent?.devNotes && (storyContent?.developmentRecord || (developerMode === 'human' && selectedStory?.filePath)) && (
                      <Tooltip title={sidePanel === 'devNotes' ? 'Switch to Development Record' : 'Switch to Implementation Notes'}>
                        <Chip
                          icon={<CompareArrowsIcon sx={{ fontSize: 16 }} />}
                          label={sidePanel === 'devNotes' ? 'Dev Record' : 'Impl Notes'}
                          size="small"
                          onClick={() => setSidePanel(sidePanel === 'devNotes' ? 'devRecord' : 'devNotes')}
                          sx={{ cursor: 'pointer', fontWeight: 500 }}
                        />
                      </Tooltip>
                    )}
                    {/* Save+Cancel for dev record in human mode */}
                    {sidePanel === 'devRecord' && developerMode === 'human' && selectedStory?.filePath && editingDevRecord && (
                      <>
                        <Button
                          size="small"
                          onClick={() => {
                            setEditingDevRecord(false)
                            setDevRecordDraft('')
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={handleSaveDevRecord}
                        >
                          Save
                        </Button>
                      </>
                    )}
                    <IconButton size="small" onClick={() => setSidePanel('none')}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
                <Box sx={{ p: 3, flex: 1, overflowY: 'auto' }}>
                  {editingDevRecord && sidePanel === 'devRecord' ? (
                    <TextField
                      multiline
                      fullWidth
                      minRows={12}
                      value={devRecordDraft}
                      onChange={(e) => setDevRecordDraft(e.target.value)}
                      placeholder="Enter development record notes (markdown supported)..."
                      sx={{
                        flex: 1,
                        '& .MuiInputBase-input': {
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: '0.85rem'
                        }
                      }}
                    />
                  ) : (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      '& h1, & h2, & h3, & h4': {
                        mt: 2,
                        mb: 1,
                        '&:first-of-type': { mt: 0 }
                      },
                      '& p': { mb: 1 },
                      '& ul, & ol': {
                        pl: 3,
                        mb: 1,
                        '& li': { mb: 0.5 }
                      },
                      '& table': {
                        width: '100%',
                        borderCollapse: 'collapse',
                        '& th, & td': {
                          border: 1,
                          borderColor: 'divider',
                          p: 1
                        },
                        '& th': {
                          bgcolor: 'action.hover',
                          fontWeight: 600
                        }
                      }
                    }}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
                      {sidePanel === 'devNotes' ? storyContent!.devNotes : storyContent!.developmentRecord!}
                    </ReactMarkdown>
                  </Paper>
                  )}
                </Box>
              </Box>
            </>
          )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
