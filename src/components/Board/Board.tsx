import { useMemo, useState, useRef, useCallback } from 'react'
import { Box, CircularProgress, Typography, Alert, Snackbar, Chip } from '@mui/material'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, rectIntersection, closestCorners, CollisionDetection, PointerSensor, useSensor, useSensors, UniqueIdentifier } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import MergeIcon from '@mui/icons-material/Merge'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import { useStore } from '../../store'
import { useProjectData } from '../../hooks/useProjectData'
import { useWorkflow } from '../../hooks/useWorkflow'
import { STATUS_COLUMNS, Story, StoryStatus } from '../../types'
import type { AgentDefinition } from '../../types/flow'
import Column from './Column'
import StoryCard from '../StoryCard/StoryCard'

// Branch type detection
type BranchType = 'main' | 'epic' | 'story'

interface BranchInfo {
  type: BranchType
  epicId?: number
  storyId?: string // Full story ID like "1-6-load-chips"
}

function parseBranchInfo(branchName: string | null, baseBranch: string): BranchInfo {
  if (!branchName) return { type: 'main' }

  // Base branch (configured in settings)
  if (branchName === baseBranch) {
    return { type: 'main' }
  }

  // Epic branch: epic-N-name (e.g., "epic-1-setup")
  const epicMatch = branchName.match(/^epic-(\d+)-/)
  if (epicMatch) {
    return { type: 'epic', epicId: parseInt(epicMatch[1], 10) }
  }

  // Story branch: epicId-storyId (e.g., "1-1-6-load-chips")
  // Story ID format: epicId-storyNumber-slug
  // So branch format is: epicId-epicId-storyNumber-slug (first epicId is branch prefix)
  // Actually looking at StoryCard: storyBranchName = story.id
  // story.id format is: epicId-storyNumber-slug (e.g., "1-2-load-built-in-chips")
  const storyMatch = branchName.match(/^(\d+-\d+-.+)$/)
  if (storyMatch) {
    return {
      type: 'story',
      epicId: parseInt(storyMatch[1].split('-')[0], 10),
      storyId: storyMatch[1] // e.g., "1-6-load-chips"
    }
  }

  // Unknown branch format - treat as main (full access)
  return { type: 'main' }
}

export default function Board() {
  // Compute read-only state from store values (reactive)
  const currentBranch = useStore((state) => state.currentBranch)
  const epicMergeStatusChecked = useStore((state) => state.epicMergeStatusChecked)
  const unmergedStoryBranches = useStore((state) => state.unmergedStoryBranches)
  const baseBranch = useStore((state) => state.baseBranch)
  const bmadInGitignore = useStore((state) => state.bmadInGitignore)
  const disableGitBranching = useStore((state) => state.disableGitBranching)

  // Parse current branch to determine type and scope
  const branchInfo = useMemo(() => parseBranchInfo(currentBranch, baseBranch), [currentBranch, baseBranch])

  const isEpicBranch = branchInfo.type === 'epic'
  const isStoryBranch = branchInfo.type === 'story'

  // Read-only mode for epic branches with unmerged story branches
  const epicReadOnly = Boolean(isEpicBranch && (!epicMergeStatusChecked || unmergedStoryBranches.length > 0))

  // For story branches, board is editable but only for the matching story
  // For epic branches (when not epicReadOnly), only stories in that epic are editable
  // For base branch, everything is editable
  const readOnly = epicReadOnly

  // Configure sensors for drag detection - empty when read-only to disable dragging
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: readOnly ? Infinity : 5 // Infinity effectively disables drag; 5px allows clicks
      }
    })
  )

  const loading = useStore((state) => state.loading)
  const error = useStore((state) => state.error)
  const allStories = useStore((state) => state.stories)
  const selectedEpicId = useStore((state) => state.selectedEpicId)
  const searchQuery = useStore((state) => state.searchQuery)
  const collapsedColumnsByEpic = useStore((state) => state.collapsedColumnsByEpic)
  const toggleColumnCollapse = useStore((state) => state.toggleColumnCollapse)
  const setIsUserDragging = useStore((state) => state.setIsUserDragging)
  const storyOrder = useStore((state) => state.storyOrder)
  const setStoryOrder = useStore((state) => state.setStoryOrder)
  const enableHumanReviewColumn = useStore((state) => state.enableHumanReviewColumn)
  const humanReviewStories = useStore((state) => state.humanReviewStories)
  const addToHumanReview = useStore((state) => state.addToHumanReview)
  const removeFromHumanReview = useStore((state) => state.removeFromHumanReview)
  const getEffectiveStatus = useStore((state) => state.getEffectiveStatus)
  const recordStatusChange = useStore((state) => state.recordStatusChange)
  const chatThreads = useStore((state) => state.chatThreads)
  const { loadProjectData } = useProjectData()
  const { agents: bmadAgents } = useWorkflow()

  // Determine if a story is editable based on current branch
  const isStoryEditable = useCallback((story: Story): boolean => {
    // When bmad is in .gitignore or git branching is disabled, no restrictions needed
    if (bmadInGitignore || disableGitBranching) return true

    // If in epic read-only mode (unmerged branches), nothing is editable
    if (epicReadOnly) return false

    switch (branchInfo.type) {
      case 'main':
        // On base branch, everything is editable
        return true
      case 'epic':
        // On epic branch, only stories in this epic are editable
        return story.epicId === branchInfo.epicId
      case 'story':
        // On story branch, only the matching story is editable
        return story.id === branchInfo.storyId
      default:
        return true
    }
  }, [branchInfo, epicReadOnly, bmadInGitignore, disableGitBranching])

  // Get set of locked story IDs for efficient lookup
  const lockedStoryIds = useMemo(() => {
    // When bmad is in .gitignore or git branching is disabled, no stories are locked
    if (bmadInGitignore || disableGitBranching) return new Set<string>()
    if (branchInfo.type === 'main' && !epicReadOnly) return new Set<string>()

    const locked = new Set<string>()
    for (const story of allStories) {
      if (!isStoryEditable(story)) {
        locked.add(story.id)
      }
    }
    return locked
  }, [allStories, branchInfo, epicReadOnly, isStoryEditable, bmadInGitignore, disableGitBranching])

  // Compute working teammates map at Board level to avoid per-card subscriptions
  const workingTeammatesByBranch = useMemo(() => {
    const map: Record<string, AgentDefinition> = {}
    for (const thread of Object.values(chatThreads)) {
      if (thread.isTyping && thread.branchName) {
        const agentInfo = bmadAgents.find((a) => a.id === thread.agentId)
        if (agentInfo) {
          map[thread.branchName] = agentInfo
        }
      }
    }
    return map
  }, [chatThreads, bmadAgents])

  // Drag and drop state
  const [activeStory, setActiveStory] = useState<Story | null>(null)
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)

  // Ref for scrollable container to preserve scroll position
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const savedScrollPositionRef = useRef<number>(0)

  // Custom collision detection:
  // - Same column: use closestCorners for card-level detection (reordering with preview)
  // - Different column: use column detection (drop at end)
  const columnIds = ['backlog', 'ready-for-dev', 'in-progress', 'review', 'done', 'human-review']

  const collisionDetection: CollisionDetection = (args) => {
    // First, find collisions using rectIntersection
    const rectCollisions = rectIntersection(args)

    // If no collisions, try closestCorners
    if (rectCollisions.length === 0) {
      return closestCorners(args)
    }

    // Find the dragged story's column
    const draggedStory = allStories.find(s => s.id === activeId)
    const draggedStatus = draggedStory ? getEffectiveStatus(draggedStory) : null

    // Check if we have a card collision
    const cardCollisions = rectCollisions.filter(c => !columnIds.includes(String(c.id)))
    const columnCollisions = rectCollisions.filter(c => columnIds.includes(String(c.id)))

    if (cardCollisions.length > 0) {
      // Found a card - check if it's in the same column as dragged item
      const overStory = allStories.find(s => s.id === cardCollisions[0].id)
      const overStatus = overStory ? getEffectiveStatus(overStory) : null

      if (draggedStatus && overStatus && draggedStatus === overStatus) {
        // Same column - return the card for reordering
        return [cardCollisions[0]]
      } else {
        // Different column - return the column instead
        if (columnCollisions.length > 0) {
          return [columnCollisions[0]]
        }
        // Find the column this card belongs to
        if (overStatus) {
          const columnCollision = rectCollisions.find(c => String(c.id) === overStatus)
          if (columnCollision) {
            return [columnCollision]
          }
        }
      }
    }

    // No card collision, return column if available
    if (columnCollisions.length > 0) {
      return [columnCollisions[0]]
    }

    return rectCollisions
  }
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('')

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const story = allStories.find((s) => s.id === active.id)

    // Block drag if story is locked (shouldn't happen due to disabled prop, but safety check)
    if (story && lockedStoryIds.has(story.id)) {
      return
    }

    // Save scroll position when drag starts
    savedScrollPositionRef.current = scrollContainerRef.current?.scrollLeft || 0
    setActiveId(active.id)
    if (story) {
      setActiveStory(story)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    // Use the scroll position saved at drag start
    const savedScrollLeft = savedScrollPositionRef.current

    setActiveStory(null)
    setActiveId(null)

    // Restore scroll position immediately after clearing drag state
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = savedScrollLeft
    }

    // Block drag operations in read-only mode
    if (readOnly) {
      setSnackbarMessage('Board is read-only. Merge story branches first.')
      setSnackbarOpen(true)
      return
    }

    if (!over) return

    const storyId = active.id as string
    const story = allStories.find((s) => s.id === storyId)
    if (!story) return

    // Block if story is locked due to branch scope
    if (lockedStoryIds.has(story.id)) {
      if (isStoryBranch) {
        setSnackbarMessage(`Switch to this story's branch to update its status`)
      } else if (isEpicBranch) {
        setSnackbarMessage(`This story belongs to a different epic`)
      }
      setSnackbarOpen(true)
      return
    }

    const overId = over.id as string
    const epicKey = selectedEpicId === null ? 'all' : String(selectedEpicId)

    // Check if we're dropping on another story (same column reorder)
    const overStory = allStories.find((s) => s.id === overId)
    const storyEffectiveStatus = getEffectiveStatus(story)

    if (overStory) {
      // Same column reorder (collision detection ensures this is same column)
      const status = storyEffectiveStatus
      const columnStories = allStories
        .filter((s) => getEffectiveStatus(s) === status)
        .filter((s) => selectedEpicId === null || s.epicId === selectedEpicId)

      // Get current order or create from existing stories
      const currentOrder = storyOrder[epicKey]?.[status] || columnStories.map(s => s.id)

      // Ensure all stories in column are in the order array
      const allIds = columnStories.map(s => s.id)
      const orderedIds = currentOrder.filter(id => allIds.includes(id))
      const missingIds = allIds.filter(id => !orderedIds.includes(id))
      const fullOrder = [...orderedIds, ...missingIds]

      const oldIndex = fullOrder.indexOf(storyId)
      const newIndex = fullOrder.indexOf(overId)

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newOrder = arrayMove(fullOrder, oldIndex, newIndex)
        setStoryOrder(epicKey, status, newOrder)
      }
      return
    }

    // Check if we're dropping on a column (cross-column move)
    // Only allow dropping on visible columns
    const validStatuses: string[] = STATUS_COLUMNS
      .filter(c => c.status !== 'optional')
      .filter(c => c.status !== 'human-review' || enableHumanReviewColumn)
      .map(c => c.status)
    if (validStatuses.includes(overId)) {
      const newStatus = overId as StoryStatus
      const currentEffectiveStatus = getEffectiveStatus(story)
      if (currentEffectiveStatus === newStatus) return

      // Handle human-review as app-level status (not written to BMAD)
      if (newStatus === 'human-review') {
        // Moving TO human-review: just add to app-level list
        addToHumanReview(story.id)
        // Record the status change
        recordStatusChange(story.id, story.title, story.epicId, story.storyNumber, currentEffectiveStatus, 'human-review', 'user')
        // Add to top of human-review column order
        const targetColumnStories = allStories
          .filter((s) => getEffectiveStatus(s) === 'human-review')
          .filter((s) => selectedEpicId === null || s.epicId === selectedEpicId)
        const currentOrder = storyOrder[epicKey]?.['human-review'] || targetColumnStories.map(s => s.id)
        const newOrder = [storyId, ...currentOrder.filter(id => id !== storyId)]
        setStoryOrder(epicKey, 'human-review', newOrder)
        setSnackbarMessage(`Moved "${story.title}" to Human Review`)
        setSnackbarOpen(true)
        return
      }

      // If moving FROM human-review to another status
      const wasInHumanReview = humanReviewStories.includes(story.id)
      if (wasInHumanReview) {
        removeFromHumanReview(story.id)
      }

      // Add the story to the top of the target column's order
      const addToColumnOrder = () => {
        const targetColumnStories = allStories
          .filter((s) => getEffectiveStatus(s) === newStatus)
          .filter((s) => selectedEpicId === null || s.epicId === selectedEpicId)
        const currentOrder = storyOrder[epicKey]?.[newStatus] || targetColumnStories.map(s => s.id)
        // Remove the story from order if it exists, then add to top
        const newOrder = [storyId, ...currentOrder.filter(id => id !== storyId)]
        setStoryOrder(epicKey, newStatus, newOrder)
      }

      // Update the story status in sprint-status.yaml (for real BMAD statuses)
      if (story.filePath) {
        // Set flag to prevent notification for user's own drag action
        setIsUserDragging(true)
        const result = await window.fileAPI.updateStoryStatus(story.filePath, newStatus)
        if (result.success) {
          // Record the status change (use story.status as old, since we're moving from BMAD status)
          // If was in human-review, the effective status was 'human-review', otherwise it's the story's actual status
          const oldStatus = wasInHumanReview ? 'human-review' : story.status
          recordStatusChange(story.id, story.title, story.epicId, story.storyNumber, oldStatus, newStatus, 'user')
          addToColumnOrder()
          setSnackbarMessage(`Moved "${story.title}" to ${newStatus}`)
          setSnackbarOpen(true)
          // Refresh stories to reflect the change
          await loadProjectData()
          // Restore scroll position multiple times to ensure it sticks
          const restoreScroll = () => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollLeft = savedScrollLeft
            }
          }
          restoreScroll()
          setTimeout(restoreScroll, 0)
          setTimeout(restoreScroll, 50)
          setTimeout(restoreScroll, 100)
        } else {
          setSnackbarMessage(`Failed to update status: ${result.error}`)
          setSnackbarOpen(true)
          setIsUserDragging(false)
          // Re-add to human review if the update failed and it was there before
          if (wasInHumanReview) {
            addToHumanReview(story.id)
          }
        }
      } else {
        setSnackbarMessage('Cannot update story without a file path')
        setSnackbarOpen(true)
        // Re-add to human review if no file path and it was there before
        if (wasInHumanReview) {
          addToHumanReview(story.id)
        }
      }
    }
  }

  // Get collapsed columns for current epic
  const collapsedColumns = useMemo(() => {
    const epicKey = selectedEpicId === null ? 'all' : String(selectedEpicId)
    return collapsedColumnsByEpic[epicKey] || []
  }, [collapsedColumnsByEpic, selectedEpicId])

  // Filter stories reactively when filter state changes
  const stories = useMemo(() => {
    let filtered = allStories

    // Filter by epic
    if (selectedEpicId !== null) {
      filtered = filtered.filter((s) => s.epicId === selectedEpicId)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((s) =>
        s.title.toLowerCase().includes(query) ||
        s.id.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [allStories, selectedEpicId, searchQuery])

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          gap: 2
        }}
      >
        <CircularProgress size={24} />
        <Typography color="text.secondary">Loading project...</Typography>
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  // Filter out 'optional' status and conditionally filter 'human-review'
  const displayColumns = STATUS_COLUMNS.filter((col) => {
    if (col.status === 'optional') return false
    if (col.status === 'human-review' && !enableHumanReviewColumn) return false
    return true
  })

  // Helper to sort stories by persisted order
  const sortStoriesByOrder = (columnStories: Story[], status: StoryStatus): Story[] => {
    const epicKey = selectedEpicId === null ? 'all' : String(selectedEpicId)
    const order = storyOrder[epicKey]?.[status]

    if (!order || order.length === 0) {
      return columnStories
    }

    // Sort by order, with stories not in order array at the end
    return [...columnStories].sort((a, b) => {
      const indexA = order.indexOf(a.id)
      const indexB = order.indexOf(b.id)

      // Stories not in order go to the end
      if (indexA === -1 && indexB === -1) return 0
      if (indexA === -1) return 1
      if (indexB === -1) return -1

      return indexA - indexB
    })
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetection={collisionDetection}
      autoScroll={false}
    >
      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Story branch context banner - show when on a story branch */}
        {isStoryBranch && branchInfo.storyId && (
          <Alert
            severity="info"
            icon={<AccountTreeIcon />}
            sx={{
              mx: 2,
              mt: 2,
              mb: 0,
              py: 0.5,
              '& .MuiAlert-message': { py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }
            }}
          >
            <Typography variant="body2" component="span">
              <strong>Story branch:</strong> Only this story can be updated.
            </Typography>
            <Chip
              label={branchInfo.storyId}
              size="small"
              sx={{ height: 20, fontSize: '0.7rem', fontWeight: 500 }}
            />
            <Typography variant="body2" component="span" color="text.secondary">
              Other stories are view-only.
            </Typography>
          </Alert>
        )}

        {/* Epic branch context banner - show when on an epic branch (not in read-only merge mode) */}
        {isEpicBranch && !readOnly && branchInfo.epicId && (
          <Alert
            severity="info"
            icon={<AccountTreeIcon />}
            sx={{
              mx: 2,
              mt: 2,
              mb: 0,
              py: 0.5,
              '& .MuiAlert-message': { py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }
            }}
          >
            <Typography variant="body2" component="span">
              <strong>Epic branch:</strong> Only Epic {branchInfo.epicId} stories can be updated.
            </Typography>
            <Typography variant="body2" component="span" color="text.secondary">
              Stories from other epics are view-only.
            </Typography>
          </Alert>
        )}

        {/* Read-only banner when on epic with unmerged story branches */}
        {readOnly && (
          <Alert
            severity="warning"
            icon={!epicMergeStatusChecked ? <CircularProgress size={16} /> : <MergeIcon />}
            sx={{
              mx: 2,
              mt: 2,
              mb: 0,
              py: 0.5,
              '& .MuiAlert-message': { py: 0.5 }
            }}
          >
            <Typography variant="body2">
              {!epicMergeStatusChecked ? (
                <><strong>Checking merge status...</strong></>
              ) : (
                <><strong>Read-only mode:</strong> Merge {unmergedStoryBranches.length} story branch{unmergedStoryBranches.length !== 1 ? 'es' : ''} before editing. Click the branch switcher to merge.</>
              )}
            </Typography>
          </Alert>
        )}

        <Box
          ref={scrollContainerRef}
          sx={{
            flex: 1,
            display: 'flex',
            gap: 2,
            p: 2,
            overflowX: 'auto',
            overflowY: 'hidden',
            overflowAnchor: 'none', // Prevent browser auto-scroll anchoring
            '&::-webkit-scrollbar': {
              height: 8
            },
            '&::-webkit-scrollbar-track': {
              bgcolor: 'action.hover',
              borderRadius: 4
            },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: 'action.disabled',
              borderRadius: 4,
              '&:hover': {
                bgcolor: 'action.active'
              }
            }
          }}
        >
          {displayColumns.map((column) => {
            const columnStories = stories.filter((s) => getEffectiveStatus(s) === column.status)
            const sortedStories = sortStoriesByOrder(columnStories, column.status)

            return (
              <Column
                key={column.status}
                status={column.status}
                label={column.label}
                color={column.color}
                stories={sortedStories}
                isCollapsed={collapsedColumns.includes(column.status)}
                onToggleCollapse={() => toggleColumnCollapse(column.status)}
                disableDrag={readOnly}
                lockedStoryIds={lockedStoryIds}
                workingTeammatesByBranch={workingTeammatesByBranch}
              />
            )
          })}
        </Box>
      </Box>

      {/* Drag Overlay - shows the card being dragged */}
      <DragOverlay>
        {activeStory ? (
          <Box sx={{ opacity: 0.8, transform: 'rotate(3deg)' }}>
            <StoryCard story={activeStory} isDragging />
          </Box>
        ) : null}
      </DragOverlay>

      {/* Status change notification */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </DndContext>
  )
}
