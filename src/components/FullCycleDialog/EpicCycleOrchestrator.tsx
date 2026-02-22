import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../../store'
import { useFullCycle } from '../../hooks/useFullCycle'

/**
 * EpicCycleOrchestrator - Manages running through an epic's story queue
 *
 * This sits on top of the existing single-story FullCycleOrchestrator.
 * It watches for story completions and feeds the next story into the
 * existing pipeline. Mounted at App level alongside FullCycleOrchestrator.
 */
export default function EpicCycleOrchestrator() {
  const epicCycle = useStore((state) => state.epicCycle)
  const fullCycle = useStore((state) => state.fullCycle)
  const advanceEpicCycleStory = useStore((state) => state.advanceEpicCycleStory)
  const setEpicCycleError = useStore((state) => state.setEpicCycleError)
  const completeEpicCycle = useStore((state) => state.completeEpicCycle)
  const setFullCycleDialogOpen = useStore((state) => state.setFullCycleDialogOpen)
  const appendFullCycleLog = useStore((state) => state.appendFullCycleLog)

  const { start: startSingleCycle } = useFullCycle()

  // Track whether we've started the current story
  const startedStoryRef = useRef<string | null>(null)
  // Track the previous fullCycle.isRunning state for detecting transitions
  const prevFullCycleRunningRef = useRef(false)

  // Start the next story in the queue
  const startNextStory = useCallback(() => {
    const state = useStore.getState()
    const { epicCycle: ec } = state

    if (!ec.isRunning) return
    if (ec.currentStoryIndex >= ec.storyQueue.length) {
      // All stories done
      appendFullCycleLog('\n=== Epic cycle complete! All stories processed ===')
      completeEpicCycle()
      return
    }

    const storyId = ec.storyQueue[ec.currentStoryIndex]

    // Don't start the same story twice
    if (startedStoryRef.current === storyId) return
    startedStoryRef.current = storyId

    // Update the story's status to running
    const newStatuses = [...ec.storyStatuses]
    newStatuses[ec.currentStoryIndex] = 'running'
    useStore.setState({
      epicCycle: { ...ec, storyStatuses: newStatuses }
    })

    // Suppress the regular FullCycleDialog - we show progress in EpicCycleDialog
    setFullCycleDialogOpen(false)

    const story = state.stories.find((s) => s.id === storyId)
    appendFullCycleLog(`\n========================================`)
    appendFullCycleLog(`Epic Story ${ec.currentStoryIndex + 1}/${ec.storyQueue.length}: ${story?.title || storyId}`)
    appendFullCycleLog(`========================================`)

    // Start the single-story full cycle
    startSingleCycle(storyId)

    // Suppress the regular dialog again after startFullCycle opens it
    setTimeout(() => setFullCycleDialogOpen(false), 0)
  }, [startSingleCycle, appendFullCycleLog, completeEpicCycle, setFullCycleDialogOpen])

  // Effect: Kick off the first story when epic cycle starts
  useEffect(() => {
    if (!epicCycle.isRunning) {
      startedStoryRef.current = null
      return
    }

    // If no single-story cycle is running, start the next one
    if (!fullCycle.isRunning && !fullCycle.error) {
      startNextStory()
    }
  }, [epicCycle.isRunning, epicCycle.currentStoryIndex])

  // Effect: Watch for single-story completion (isRunning transitions true → false)
  useEffect(() => {
    const wasRunning = prevFullCycleRunningRef.current
    prevFullCycleRunningRef.current = fullCycle.isRunning

    // Only act on true → false transitions while epic cycle is active
    if (!wasRunning || fullCycle.isRunning) return
    if (!epicCycle.isRunning) return

    if (fullCycle.error) {
      // Story failed - halt the epic cycle
      setEpicCycleError(`Story failed: ${fullCycle.error}`)
      return
    }

    // Story completed successfully - advance and start next
    advanceEpicCycleStory()

    // Small delay to let state settle, then start next story
    // Clear the started ref so startNextStory can proceed
    startedStoryRef.current = null
    setTimeout(() => {
      startNextStory()
    }, 500)
  }, [fullCycle.isRunning, fullCycle.error, epicCycle.isRunning, advanceEpicCycleStory, setEpicCycleError, startNextStory])

  // Suppress FullCycleDialog when epic cycle is active
  useEffect(() => {
    if (epicCycle.isRunning) {
      const unsub = useStore.subscribe((state, prevState) => {
        if (state.fullCycleDialogOpen && !prevState.fullCycleDialogOpen && state.epicCycle.isRunning) {
          setFullCycleDialogOpen(false)
        }
      })
      return unsub
    }
  }, [epicCycle.isRunning, setFullCycleDialogOpen])

  return null
}
