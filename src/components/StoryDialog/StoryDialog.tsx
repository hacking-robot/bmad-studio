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
  FormControlLabel
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import VerifiedIcon from '@mui/icons-material/Verified'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { gruvboxDark, gruvboxLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useStore } from '../../store'
import { gruvbox } from '../../theme'
import { EPIC_COLORS, STATUS_COLUMNS } from '../../types'
import { useWorkflow } from '../../hooks/useWorkflow'
import { parseStoryContent } from '../../utils/parseStory'
import ChatHistorySection from './ChatHistorySection'
import StatusHistorySection from './StatusHistorySection'

// Factory function to create code component with theme awareness
const createCodeBlock = (isDark: boolean): Components['code'] => {
  return ({ className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1] : ''
    const codeString = String(children).replace(/\n$/, '')

    // Check if this is inline code (no language and short content without newlines)
    const isInline = !match && !codeString.includes('\n')

    if (isInline) {
      return (
        <code
          style={{
            backgroundColor: isDark ? gruvbox.dark2 : gruvbox.light2,
            color: isDark ? gruvbox.light1 : gruvbox.dark1,
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
        style={isDark ? gruvboxDark : gruvboxLight}
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
  const themeMode = useStore((state) => state.themeMode)
  const projectPath = useStore((state) => state.projectPath)
  const chatThreads = useStore((state) => state.chatThreads)

  // Get agents from workflow
  const { agents } = useWorkflow()

  const openGitDiffPanel = useStore((state) => state.openGitDiffPanel)

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
  const CodeBlock = React.useMemo(() => createCodeBlock(themeMode === 'dark'), [themeMode])

  const handleClose = () => {
    setSelectedStory(null)
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
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '90vh'
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
          <Typography variant="h5" fontWeight={600}>
            {selectedStory.title}
          </Typography>
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

      <DialogContent dividers sx={{ p: 0 }}>
        {!storyContent && selectedStory.filePath ? (
          <Box
            sx={{
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
        ) : !storyContent ? (
          <Box>
            {/* Epic Context (Collapsible) - for stories without files */}
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

            {/* User Story from epics.md */}
            {selectedStory.epicDescription && (
              <Box sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  User Story
                </Typography>
                <Box
                  sx={{
                    bgcolor: 'action.hover',
                    borderRadius: 2,
                    p: 2
                  }}
                >
                  <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                    {selectedStory.epicDescription}
                  </Typography>
                </Box>
              </Box>
            )}

            {/* Acceptance Criteria Preview */}
            {selectedStory.acceptanceCriteriaPreview && selectedStory.acceptanceCriteriaPreview.length > 0 && (
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

            {/* No content message - only show if no metadata at all */}
            {!selectedStory.epicDescription && !selectedStory.acceptanceCriteriaPreview && !selectedStory.technicalNotes && !selectedStory.frsAddressed && (
              <Box sx={{ p: 3 }}>
                <Typography color="text.secondary">
                  No story file available. This story is still in backlog.
                </Typography>
              </Box>
            )}
          </Box>
        ) : (
          <Box>
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

            {/* Story Description */}
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Story
              </Typography>
              <Box
                sx={{
                  bgcolor: 'action.hover',
                  borderRadius: 2,
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
              </Box>
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
                  Acceptance Criteria ({storyContent.acceptanceCriteria.length})
                </Typography>
                <Tooltip title="Criteria that must be met for the story to be considered complete. Written by PM (John)." arrow>
                  <InfoOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', cursor: 'help' }} />
                </Tooltip>
              </Box>
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
            </Box>

            <Divider />

            {/* Tasks */}
            {storyContent.tasks.length > 0 && (
              <>
                <Box sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="h6">
                      Tasks ({storyContent.tasks.filter((t) => t.completed).length}/{storyContent.tasks.length})
                    </Typography>
                    <Tooltip title="Implementation tasks. Click to toggle completion." arrow>
                      <InfoOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', cursor: 'help' }} />
                    </Tooltip>
                  </Box>
                  <List dense disablePadding>
                    {storyContent.tasks.map((task, taskIdx) => (
                      <Box key={task.id}>
                        <ListItem
                          sx={{ px: 0, py: 0.5, cursor: 'pointer', borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
                          onClick={() => handleToggleTask(taskIdx)}
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            {task.completed ? (
                              <CheckCircleIcon color="success" fontSize="small" />
                            ) : (
                              <RadioButtonUncheckedIcon color="disabled" fontSize="small" />
                            )}
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Box sx={{
                                '& p': { m: 0 },
                                ...(task.completed ? { textDecoration: 'line-through', color: 'text.secondary' } : {})
                              }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>{task.title}</ReactMarkdown>
                              </Box>
                            }
                            primaryTypographyProps={{ fontWeight: 500, component: 'div' }}
                          />
                        </ListItem>
                        {task.subtasks.length > 0 && (
                          <List dense disablePadding sx={{ pl: 4 }}>
                            {task.subtasks.map((subtask, subtaskIdx) => (
                              <ListItem
                                key={subtask.id}
                                sx={{ px: 0, py: 0.25, cursor: 'pointer', borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
                                onClick={() => handleToggleTask(taskIdx, subtaskIdx)}
                              >
                                <ListItemIcon sx={{ minWidth: 28 }}>
                                  {subtask.completed ? (
                                    <CheckCircleIcon
                                      color="success"
                                      sx={{ fontSize: 16 }}
                                    />
                                  ) : (
                                    <RadioButtonUncheckedIcon
                                      color="disabled"
                                      sx={{ fontSize: 16 }}
                                    />
                                  )}
                                </ListItemIcon>
                                <ListItemText
                                  primary={
                                    <Box sx={{
                                      '& p': { m: 0 },
                                      fontSize: '0.875rem',
                                      ...(subtask.completed ? { textDecoration: 'line-through', color: 'text.secondary' } : {})
                                    }}>
                                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>{subtask.title}</ReactMarkdown>
                                    </Box>
                                  }
                                  primaryTypographyProps={{ component: 'div' }}
                                />
                              </ListItem>
                            ))}
                          </List>
                        )}
                      </Box>
                    ))}
                  </List>
                </Box>
                <Divider />
              </>
            )}

            {/* Dev Notes (Collapsible) */}
            {storyContent.devNotes && (
              <Accordion elevation={0} disableGutters>
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{ px: 3, bgcolor: 'action.hover' }}
                >
                  <Typography variant="h6">Dev Notes</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 3 }}>
                  <Box
                    sx={{
                      '& h1, & h2, & h3, & h4': {
                        mt: 2,
                        mb: 1,
                        '&:first-of-type': { mt: 0 }
                      },
                      '& p': { mb: 1 },
                      '& ul, & ol': {
                        pl: 3,
                        mb: 1,
                        '& li': {
                          mb: 0.5
                        }
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
                      {storyContent.devNotes}
                    </ReactMarkdown>
                  </Box>
                </AccordionDetails>
              </Accordion>
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

          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}
