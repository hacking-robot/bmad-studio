import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { parseSprintStatus } from '../utils/parseSprintStatus'
import { parseEpicsUnified, getAllStories } from '../utils/parseEpicsUnified'
import { parseStoryContent } from '../utils/parseStory'
import { getEpicsFullPath, getSprintStatusFullPath, hasBoardModule } from '../utils/projectTypes'
import { mergeWorkflowConfig } from '../utils/workflowMerge'
import { flushPendingThreadSave } from '../utils/chatUtils'
import type { BmadScanResult } from '../types/bmadScan'

export function useProjectData() {
  const {
    _hasHydrated,
    projectPath,
    projectType,
    outputFolder,
    setProjectPath,
    setProjectType,
    setOutputFolder,
    addRecentProject,
    setEpics,
    setStories,
    setLoading,
    setError,
    setLastRefreshed,
    setIsWatching,
    setStoryContent,
    selectedStory,
    setNewProjectDialogOpen,
    setPendingNewProject,
    setBmadInGitignore,
    setBmadScanResult,
    setScannedWorkflowConfig,
    setBmadVersionError,
    setViewMode,
    projectWizard
  } = useStore()

  const wizardIsActive = projectWizard.isActive

  const selectProject = useCallback(async () => {
    const result = await window.fileAPI.selectDirectory()

    if (!result) {
      return false // User cancelled
    }

    if (result.error) {
      setError(result.error)
      return false
    }

    if (result.path && result.projectType) {
      // Check if this is a new/empty project
      if (result.isNewProject) {
        // Check if there's a saved wizard state (interrupted install with possibly custom output folder)
        const dirOutputFolder = result.outputFolder || '_bmad-output'
        const savedWizard = await window.wizardAPI.loadState(result.path, dirOutputFolder)
        if (savedWizard && typeof savedWizard === 'object' && 'isActive' in (savedWizard as Record<string, unknown>)) {
          const ws = savedWizard as import('../types/projectWizard').ProjectWizardState & { outputFolder?: string }
          if (ws.isActive) {
            // Resume the wizard with its stored output folder
            const { resumeWizard } = useStore.getState()
            resumeWizard(ws)
            return true
          }
        }
        setPendingNewProject({
          path: result.path,
          projectType: result.projectType,
          outputFolder: dirOutputFolder,
          bmadInstalled: result.bmadInstalled
        })
        setNewProjectDialogOpen(true)
        return false // Don't set project yet - let dialog handle it
      }

      const projectName = result.path.split('/').pop() || 'Unknown'
      const resolvedOutputFolder = result.outputFolder || '_bmad-output'
      setProjectPath(result.path)
      setProjectType(result.projectType)
      setOutputFolder(resolvedOutputFolder)
      // Set correct viewMode for the project type
      setViewMode(result.projectType === 'dashboard' ? 'dashboard' : 'board')
      addRecentProject({
        path: result.path,
        projectType: result.projectType,
        name: projectName,
        outputFolder: resolvedOutputFolder
      })
      return true
    }

    return false
  }, [setProjectPath, setProjectType, setOutputFolder, setError, addRecentProject, setNewProjectDialogOpen, setPendingNewProject])

  const setDeveloperMode = useStore((state) => state.setDeveloperMode)

  const switchToProject = useCallback((project: import('../store').RecentProject) => {
    if (!project.projectType) return

    // Flush any pending debounced thread save and persist all in-memory threads
    // before clearing state, so switching back restores them from disk
    const state = useStore.getState()
    flushPendingThreadSave()
    if (state.projectPath) {
      for (const [agentId, thread] of Object.entries(state.chatThreads)) {
        if (thread && thread.messages.length > 0) {
          window.chatAPI.saveThread(state.projectPath, agentId, thread)
        }
      }
    }

    // Batch all state updates into a single set() to avoid 9 separate persist cycles
    // Each persist cycle reads/writes the 645KB settings file via IPC
    const filtered = state.recentProjects.filter((p) => p.path !== project.path)
    const updatedRecent = [project, ...filtered].slice(0, 10)
    useStore.setState({
      projectPath: project.path,
      projectType: project.projectType,
      outputFolder: project.outputFolder || '_bmad-output',
      developerMode: project.developerMode || 'ai',
      baseBranch: project.baseBranch || 'main',
      enableEpicBranches: project.enableEpicBranches ?? false,
      allowDirectEpicMerge: project.allowDirectEpicMerge ?? false,
      disableGitBranching: project.disableGitBranching ?? true,
      colorTheme: project.colorTheme || 'gruvbox-dark',
      selectedEpicId: null,
      recentProjects: updatedRecent,
      chatThreads: {},
      selectedChatAgent: null,
      gitDiffPanelOpen: false,
      gitDiffPanelBranch: null,
      // Set correct viewMode for the target project type
      viewMode: project.projectType === 'dashboard' ? 'dashboard' : 'board',
      // Clear stale scan data so hasBrd computes correctly before new scan completes
      bmadScanResult: null,
      scannedWorkflowConfig: null
    })
  }, [])

  const loadProjectData = useCallback(async () => {
    if (!projectPath || !projectType) return

    // Skip loading if wizard is active (project artifacts don't exist yet)
    if (wizardIsActive) return

    // Dashboard projects have no board data to load
    if (projectType === 'dashboard') {
      setLoading(false)
      return
    }

    // Get current state values (don't use reactive values to avoid infinite loops)
    const { stories: currentStories, notificationsEnabled, isUserDragging, setIsUserDragging } = useStore.getState()

    // Capture previous statuses before loading new data
    const previousStatuses = new Map(currentStories.map(s => [s.id, s.status]))

    setLoading(true)
    setError(null)

    try {
      // Load sprint-status.yaml
      const currentOutputFolder = useStore.getState().outputFolder
      const sprintStatusPath = getSprintStatusFullPath(projectPath, projectType, currentOutputFolder)
      const statusResult = await window.fileAPI.readFile(sprintStatusPath)

      if (statusResult.error || !statusResult.content) {
        throw new Error('Failed to read sprint-status.yaml')
      }

      const sprintStatus = parseSprintStatus(statusResult.content)

      // Load epics from correct location based on project type
      // Supports both single epics.md and sharded epic-N.md files
      const epicsPath = getEpicsFullPath(projectPath, projectType, currentOutputFolder)
      let epicsContent: string
      const epicsResult = await window.fileAPI.readFile(epicsPath)

      if (epicsResult.error || !epicsResult.content) {
        // Try output root (GDS puts epics.md directly in _bmad-output/)
        const outputRootEpics = await window.fileAPI.readFile(`${projectPath}/${currentOutputFolder}/epics.md`)
        if (outputRootEpics.content) {
          epicsContent = outputRootEpics.content
        } else {
          // Try sharded epic files (epic-1.md, epic-2.md, etc.) in both locations
          const searchDirs = [
            `${projectPath}/${currentOutputFolder}/planning-artifacts`,
            `${projectPath}/${currentOutputFolder}`
          ]
          let epicFiles: string[] = []
          let epicDir = ''
          for (const dir of searchDirs) {
            const dirFiles = await window.fileAPI.listDirectory(dir)
            const found = (dirFiles.files || [])
              .filter((f: string) => /^epic-\d+\.md$/.test(f))
              .sort((a: string, b: string) => {
                const numA = parseInt(a.match(/\d+/)?.[0] || '0')
                const numB = parseInt(b.match(/\d+/)?.[0] || '0')
                return numA - numB
              })
            if (found.length > 0) {
              epicFiles = found
              epicDir = dir
              break
            }
          }

          if (epicFiles.length === 0) {
            throw new Error('Failed to read epics.md or epic-*.md files')
          }

          // Concatenate sharded files
          const parts: string[] = []
          for (const file of epicFiles) {
            const result = await window.fileAPI.readFile(`${epicDir}/${file}`)
            if (result.content) parts.push(result.content)
          }
          epicsContent = parts.join('\n\n')
        }
      } else {
        epicsContent = epicsResult.content
      }

      // Use unified parser with project type
      const epics = parseEpicsUnified(epicsContent, sprintStatus, projectType)
      const stories = getAllStories(epics)

      // Update file paths for stories that have files
      const implementationPath = `${projectPath}/${currentOutputFolder}/implementation-artifacts`
      const filesResult = await window.fileAPI.listDirectory(implementationPath)

      if (filesResult.files) {
        const storyFiles = filesResult.files.filter((f) => f.endsWith('.md') && !f.startsWith('story-'))

        for (const story of stories) {
          // Try to find a matching file
          const matchingFile = storyFiles.find((f) => {
            // Match by story ID pattern: 1-1-slug.md
            const prefix = `${story.epicId}-${story.storyNumber}-`
            return f.startsWith(prefix)
          })

          if (matchingFile) {
            story.filePath = `${implementationPath}/${matchingFile}`
            // Update status from sprint-status if the file exists
            const storyKey = matchingFile.replace('.md', '')
            const fileStatus = sprintStatus.developmentStatus[storyKey]
            if (fileStatus) {
              story.status = fileStatus
            }
          }
        }
      }

      setEpics(epics)
      setStories(stories)
      setLastRefreshed(new Date())

      // Auto-select first epic on initial load to avoid rendering all stories at once
      const { selectedEpicId } = useStore.getState()
      if (selectedEpicId === null && epics.length > 0) {
        useStore.getState().setSelectedEpicId(epics[0].id)
      }

      // Get human review settings and status change recording
      const { enableHumanReviewColumn, humanReviewStories, addToHumanReview, isInHumanReview, recordStatusChange } = useStore.getState()

      // Check for status changes (only for external changes, not user drags)
      if (!isUserDragging && previousStatuses.size > 0) {
        for (const story of stories) {
          const oldStatus = previousStatuses.get(story.id)
          if (oldStatus && oldStatus !== story.status) {
            // If human review is enabled and story moved to "done" from "review" or was in human-review,
            // automatically redirect it to human-review instead
            if (enableHumanReviewColumn && story.status === 'done') {
              const wasInHumanReview = humanReviewStories.includes(story.id)
              // Intercept if it was in review OR was already in human-review column
              if (oldStatus === 'review' || wasInHumanReview) {
                // Add to human review list if not already there
                if (!isInHumanReview(story.id)) {
                  addToHumanReview(story.id)
                }
                // Record the status change (from old status to human-review, since that's the effective status)
                recordStatusChange(story.id, story.title, story.epicId, story.storyNumber, oldStatus, 'human-review', 'external')
                // Show notification about the interception
                if (notificationsEnabled) {
                  window.fileAPI.showNotification(
                    'Story Ready for Review',
                    `"${story.title}" moved to Human Review (was marked done by AI)`
                  )
                }
                continue // Skip the normal notification
              }
            }

            // Record the external status change
            recordStatusChange(story.id, story.title, story.epicId, story.storyNumber, oldStatus, story.status, 'external')
            // Show normal status change notification
            if (notificationsEnabled) {
              window.fileAPI.showNotification(
                'Story Status Changed',
                `"${story.title}" moved from ${oldStatus} to ${story.status}`
              )
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load project data'
      // If essential artifacts are missing, redirect to wizard instead of showing error
      const isMissingArtifacts = msg.includes('Failed to read sprint-status') || msg.includes('Failed to read epics')
      if (isMissingArtifacts) {
        console.log('[useProjectData] Missing project artifacts — redirecting to wizard')
        const { outputFolder: currentOutput, developerMode: currentDevMode } = useStore.getState()
        // Scan _bmad/ to detect the correct module type (don't trust store — it may be stale)
        try {
          const scanResult = await window.fileAPI.scanBmad(projectPath!) as BmadScanResult | null
          const detectedType = scanResult?.modules.includes('gds') ? 'gds' : scanResult?.modules ? (hasBoardModule(scanResult.modules) ? 'bmm' : 'dashboard') : 'bmm'
          const modules = [detectedType]
          console.log(`[useProjectData] Detected modules from scan: [${detectedType}]`)
          useStore.getState().startProjectWizard(projectPath!, currentOutput, currentDevMode as 'ai' | 'human', modules)
        } catch {
          // Fallback to store value if scan fails
          const { projectType: currentType } = useStore.getState()
          const modules = currentType === 'gds' ? ['gds'] : ['bmm']
          useStore.getState().startProjectWizard(projectPath!, currentOutput, currentDevMode as 'ai' | 'human', modules)
        }
        return
      }
      setError(msg)
    } finally {
      setLoading(false)
      // Delay resetting user dragging flag to allow file watcher events to be ignored
      // File watcher events can be delayed significantly (1-2 seconds)
      setTimeout(() => {
        setIsUserDragging(false)
      }, 2000)
    }
  }, [projectPath, projectType, wizardIsActive, setEpics, setStories, setLoading, setError, setLastRefreshed])

  const loadStoryContent = useCallback(async (story: typeof selectedStory) => {
    if (!story?.filePath) {
      setStoryContent(null)
      return
    }

    try {
      const result = await window.fileAPI.readFile(story.filePath)

      if (result.error || !result.content) {
        setStoryContent(null)
        return
      }

      const content = parseStoryContent(result.content)
      setStoryContent(content)
    } catch {
      setStoryContent(null)
    }
  }, [setStoryContent])

  // Refs to hold latest callbacks - allows file watcher effect to call them without re-running
  const loadProjectDataRef = useRef(loadProjectData)
  const loadStoryContentRef = useRef(loadStoryContent)

  // Keep refs up to date
  useEffect(() => {
    loadProjectDataRef.current = loadProjectData
    loadStoryContentRef.current = loadStoryContent
  }, [loadProjectData, loadStoryContent])

  // Load project data when path changes or after hydration
  // Also re-runs when wizard deactivates (wizardIsActive flips false → triggers scan + load)
  useEffect(() => {
    console.log('[useProjectData] Effect triggered:', { _hasHydrated, projectPath: !!projectPath, projectType, wizardIsActive })
    if (_hasHydrated && projectPath && projectType) {
      // Skip if wizard is active (project artifacts don't exist yet)
      if (wizardIsActive) {
        console.log('[useProjectData] Skipping — wizard is active')
        return
      }

      // Check if this is an incomplete project with a saved wizard state
      // This happens when the app restarts mid-wizard (projectPath persisted but wizard state isn't)
      window.wizardAPI.loadState(projectPath, outputFolder).then(async (savedState) => {
        if (savedState && typeof savedState === 'object' && 'isActive' in (savedState as Record<string, unknown>)) {
          const ws = savedState as import('../types/projectWizard').ProjectWizardState
          if (ws.isActive) {
            // Before resuming, check if the project is actually ready (wizard may have completed
            // but the state file wasn't cleaned up due to a race condition)
            const wsOutputFolder = ws.outputFolder || outputFolder
            const sprintPath = `${projectPath}/${wsOutputFolder}/implementation-artifacts/sprint-status.yaml`
            const epicsPlanningPath = `${projectPath}/${wsOutputFolder}/planning-artifacts/epics.md`
            const epicsRootPath = `${projectPath}/${wsOutputFolder}/epics.md`
            try {
              const [sprintExists, epicsPlanningExists, epicsRootExists] = await Promise.all([
                window.wizardAPI.checkFileExists(sprintPath),
                window.wizardAPI.checkFileExists(epicsPlanningPath),
                window.wizardAPI.checkFileExists(epicsRootPath)
              ])
              if (sprintExists && (epicsPlanningExists || epicsRootExists)) {
                // Project has all required artifacts — wizard is done, clean up stale state
                console.log('[useProjectData] Wizard state file is stale — artifacts exist, loading project normally')
                window.wizardAPI.deleteState(projectPath, wsOutputFolder)
                loadProjectData()
                return
              }
            } catch { /* check failed, resume wizard as fallback */ }

            // Auto-correct selectedModules from scan (fixes stale wizard state with wrong module)
            try {
              const scanResult = await window.fileAPI.scanBmad(projectPath) as BmadScanResult | null
              if (scanResult) {
                const detectedModule = scanResult.modules.includes('gds') ? 'gds' : 'bmm'
                const currentModule = ws.selectedModules?.includes('gds') ? 'gds' : 'bmm'
                if (detectedModule !== currentModule) {
                  console.log(`[useProjectData] Correcting wizard modules: [${currentModule}] → [${detectedModule}]`)
                  ws.selectedModules = [detectedModule]
                }
              }
            } catch { /* scan failed, resume with existing modules */ }
            // Resume the wizard with its stored output folder (prefer wizard state over store)
            const { resumeWizard } = useStore.getState()
            resumeWizard(ws)
            return
          }
        }
        // No wizard state — load project data normally
        loadProjectData()
      }).catch(() => {
        // No wizard state file — load normally
        loadProjectData()
      })

      // Scan BMAD project files for agents, workflows, and version info
      console.log('[useProjectData] Scanning BMAD:', projectPath)
      window.fileAPI.scanBmad(projectPath).then((scanResult) => {
        const result = scanResult as BmadScanResult | null
        console.log('[useProjectData] Scan result:', result ? `${result.agents.length} agents` : 'null')
        setBmadScanResult(result)
        if (result) {
          // Auto-detect developer mode if not already set for this project
          const { recentProjects } = useStore.getState()
          const currentProject = recentProjects.find(p => p.path === projectPath)
          if (!currentProject?.developerMode) {
            const detected = result.detectedDeveloperMode || 'ai'
            console.log(`[useProjectData] Auto-detected developer mode: ${detected}`)
            setDeveloperMode(detected)
          }
          // Version compatibility check: require BMAD v6+ stable (reject alpha builds)
          const version = result.version
          if (version) {
            const major = parseInt(version.split('.')[0], 10)
            const isAlpha = /alpha/i.test(version)
            if (!isNaN(major) && (major < 6 || isAlpha)) {
              console.warn(`[useProjectData] Incompatible BMAD version: ${version}`)
              setBmadVersionError(`Detected BMAD v${version}. BMad Studio requires BMAD v6.0.0 or later (stable format).`)
              setScannedWorkflowConfig(null)
              return
            }
          } else {
            // No version in manifest = pre-6.0 alpha project
            console.warn('[useProjectData] No BMAD version detected — treating as incompatible')
            setBmadVersionError('No BMAD version detected. BMad Studio requires BMAD v6.0.0 or later (stable format). This project may be using an older alpha installation.')
            setScannedWorkflowConfig(null)
            return
          }
          setBmadVersionError(null)

          // If .claude/commands/ is missing (BMAD installed without Claude Code as a tool),
          // redirect to the wizard so the user can run install to add Claude Code support.
          // The wizard's install step runs `npx bmad-method install --tools claude-code`.
          if (result.missingClaudeCommands) {
            const installedModules = result.modules.filter(m => m !== 'core')
            const moduleList = installedModules.length > 0 ? installedModules : hasBoardModule(result.modules) ? ['bmm'] : []
            console.log(`[useProjectData] Missing .claude/commands/ — opening wizard to install Claude Code support (modules: ${moduleList.join(',')})`)
            const { outputFolder: currentOutput, developerMode: currentDevMode } = useStore.getState()
            useStore.getState().startProjectWizard(projectPath!, currentOutput, currentDevMode as 'ai' | 'human', moduleList)
            return
          }

          // Auto-correct project type from scan data (fixes stale recent project entries)
          const scanDetectedType = result.modules.includes('gds')
            ? 'gds' as const
            : hasBoardModule(result.modules)
              ? 'bmm' as const
              : 'dashboard' as const
          const { projectType: currentProjectType } = useStore.getState()
          if (currentProjectType !== scanDetectedType) {
            console.log(`[useProjectData] Correcting project type: ${currentProjectType} → ${scanDetectedType}`)
            setProjectType(scanDetectedType)
            // Set initial viewMode for dashboard projects
            if (scanDetectedType === 'dashboard') {
              useStore.getState().setViewMode('dashboard')
            }
          }
          const merged = mergeWorkflowConfig(result, scanDetectedType)
          console.log('[useProjectData] Merged config agents:', merged.agents.length)
          setScannedWorkflowConfig(merged)
        } else {
          // No _bmad/ directory at all — not a BMAD project, new project flow handles this
          setBmadVersionError(null)
          setScannedWorkflowConfig(null)
        }
      }).catch((err) => {
        console.error('[useProjectData] Scan failed:', err)
        setBmadScanResult(null)
        setScannedWorkflowConfig(null)
      })

      // Load project cost total from ledger
      window.costAPI.loadCosts(projectPath, outputFolder).then((entries) => {
        const total = entries.reduce((sum: number, e: { totalCostUsd?: number }) => sum + (e.totalCostUsd || 0), 0)
        const { setProjectCostTotal } = useStore.getState()
        setProjectCostTotal(total)
      }).catch(() => {
        const { setProjectCostTotal } = useStore.getState()
        setProjectCostTotal(0)
      })

      // Check if bmad folders are in .gitignore (affects branch restrictions)
      // Defer this check so it doesn't compete with initial project load
      setTimeout(() => {
        const { bmadInGitignoreUserSet } = useStore.getState()
        if (!bmadInGitignoreUserSet) {
          window.fileAPI.checkBmadInGitignore(projectPath, outputFolder).then((result) => {
            setBmadInGitignore(result.inGitignore)
          })
        }
      }, 100)
    }
  // Note: setBmadInGitignore is stable (Zustand setter) and intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasHydrated, projectPath, projectType, outputFolder, wizardIsActive, loadProjectData])

  // File watcher setup - separate effect with minimal deps to avoid repeated start/stop
  useEffect(() => {
    if (!_hasHydrated || !projectPath || !projectType) return

    // Skip file watching if wizard is active (wizard has its own watcher)
    if (wizardIsActive) return

    // Start watching for file changes (all project types including dashboard)
    window.fileAPI.startWatching(projectPath, projectType, outputFolder)
    setIsWatching(true)

    // Listen for file changes - use refs to get latest callbacks without triggering effect
    const cleanup = window.fileAPI.onFilesChanged(() => {
      // Always bump documents revision so useDocuments refreshes
      useStore.getState().bumpDocumentsRevision()

      // Dashboard projects have no board data to reload
      if (projectType === 'dashboard') return

      // Skip reload if user is currently dragging (they already triggered a reload)
      const { isUserDragging, selectedStory } = useStore.getState()
      if (isUserDragging) {
        return
      }
      // Call the latest callbacks via refs
      loadProjectDataRef.current()
      // Also reload story content if a story dialog is open
      if (selectedStory?.filePath) {
        loadStoryContentRef.current(selectedStory)
      }
    })

    // Cleanup watcher and listener on unmount or path change
    return () => {
      cleanup()
      window.fileAPI.stopWatching()
      setIsWatching(false)
    }
  // Only re-run when project path/type/outputFolder actually changes, not on callback recreation
  }, [_hasHydrated, projectPath, projectType, outputFolder, wizardIsActive, setIsWatching])

  // Load story content when selected story changes
  useEffect(() => {
    if (selectedStory) {
      loadStoryContent(selectedStory)
    } else {
      setStoryContent(null)
    }
  }, [selectedStory, loadStoryContent, setStoryContent])

  return {
    selectProject,
    switchToProject,
    loadProjectData,
    loadStoryContent
  }
}
