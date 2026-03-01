import { useCallback, useEffect } from 'react'
import { useStore } from '../store'
import { parseSprintStatus } from '../utils/parseSprintStatus'
import { parseEpicsUnified, getAllStories } from '../utils/parseEpicsUnified'
import { parseStoryContent } from '../utils/parseStory'
import { getEpicsFullPath, getSprintStatusFullPath, hasBoardModule } from '../utils/projectTypes'
import { mergeWorkflowConfig } from '../utils/workflowMerge'
import { initialFullCycleState, initialEpicCycleState } from '../types/fullCycle'
import { createLocalReader } from '../utils/remoteFileReader'
import type { BmadScanResult } from '../types/bmadScan'

// Module-level functions using getState() — no hook dependency, stable references,
// safe to call from effects, file watchers, and UI event handlers.

export async function loadProjectData() {
  const state = useStore.getState()
  const { projectPath, projectType, projectWizard } = state
  if (!projectPath || !projectType) return
  if (projectWizard.isActive) return

  // Dashboard projects have no board data to load
  if (projectType === 'dashboard') {
    state.setLoading(false)
    return
  }

  // Both modes now have checked-out working trees (local or cache)
  const readOnly = state.remoteViewingBranch !== null || state.isRemoteProject
  const reader = createLocalReader()

  const { stories: currentStories, notificationsEnabled, isUserDragging, setIsUserDragging } = state

  // Capture previous statuses before loading new data
  const previousStatuses = new Map(currentStories.map(s => [s.id, s.status]))

  state.setLoading(true)
  state.setError(null)

  try {
    // Load sprint-status.yaml
    const currentOutputFolder = useStore.getState().outputFolder
    const sprintStatusPath = getSprintStatusFullPath(projectPath, projectType, currentOutputFolder)
    const statusResult = await reader.readFile(sprintStatusPath)

    if (statusResult.error || !statusResult.content) {
      throw new Error('Failed to read sprint-status.yaml')
    }

    const sprintStatus = parseSprintStatus(statusResult.content)

    // Load epics from correct location based on project type
    // Supports both single epics.md and sharded epic-N.md files
    const epicsPath = getEpicsFullPath(projectPath, projectType, currentOutputFolder)
    let epicsContent: string
    const epicsResult = await reader.readFile(epicsPath)

    if (epicsResult.error || !epicsResult.content) {
      // Try output root (GDS puts epics.md directly in _bmad-output/)
      const outputRootEpics = await reader.readFile(`${projectPath}/${currentOutputFolder}/epics.md`)
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
          const dirFiles = await reader.listDirectory(dir)
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
          const result = await reader.readFile(`${epicDir}/${file}`)
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
    const filesResult = await reader.listDirectory(implementationPath)

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

    // Batch data + epic auto-select into a single setState to avoid
    // an intermediate "All Epics" render with all stories visible
    const { selectedEpicId } = useStore.getState()
    const autoSelect = selectedEpicId === null && epics.length > 0
    useStore.setState({
      epics,
      stories,
      lastRefreshed: new Date(),
      ...(autoSelect ? { selectedEpicId: epics[0].id } : {})
    })

    // Get human review settings and status change recording
    const { enableHumanReviewColumn, humanReviewStories, addToHumanReview, isInHumanReview, recordStatusChange } = useStore.getState()

    // Check for status changes (only for external changes, not user drags)
    // Skip in read-only mode (remote viewing) — no status tracking needed
    if (!readOnly && !isUserDragging && previousStatuses.size > 0) {
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
    if (isMissingArtifacts && readOnly) {
      // Remote viewing: show error instead of redirecting to wizard
      useStore.getState().setError(`This branch does not contain BMAD project artifacts (missing sprint-status.yaml or epics.md).`)
      return
    }
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
    useStore.getState().setError(msg)
  } finally {
    useStore.getState().setLoading(false)
    // Delay resetting user dragging flag to allow file watcher events to be ignored
    // File watcher events can be delayed significantly (1-2 seconds)
    setTimeout(() => {
      setIsUserDragging(false)
    }, 2000)
  }
}

export async function loadStoryContent(story: { filePath?: string } | null) {
  if (!story?.filePath) {
    useStore.getState().setStoryContent(null)
    return
  }

  // Both modes now have checked-out working trees
  const reader = createLocalReader()

  try {
    const result = await reader.readFile(story.filePath)

    if (result.error || !result.content) {
      useStore.getState().setStoryContent(null)
      return
    }

    const content = parseStoryContent(result.content)
    useStore.getState().setStoryContent(content)
  } catch {
    useStore.getState().setStoryContent(null)
  }
}

/**
 * Effects hook — call exactly ONCE from App.tsx.
 * Handles project data loading, BMAD scanning, file watching, and story content loading.
 */
export function useProjectDataEffects() {
  const _hasHydrated = useStore((s) => s._hasHydrated)
  const projectPath = useStore((s) => s.projectPath)
  const projectType = useStore((s) => s.projectType)
  const outputFolder = useStore((s) => s.outputFolder)
  const wizardIsActive = useStore((s) => s.projectWizard.isActive)
  const selectedStory = useStore((s) => s.selectedStory)
  const remoteViewingBranch = useStore((s) => s.remoteViewingBranch)
  const isRemoteProject = useStore((s) => s.isRemoteProject)

  // Load project data when path changes or after hydration
  // Also re-runs when wizard deactivates (wizardIsActive flips false → triggers scan + load)
  // Also re-runs when remoteViewingBranch changes (to reload data from different ref)
  useEffect(() => {
    if (!_hasHydrated || !projectPath || !projectType) return
    if (wizardIsActive) return

    // Remote viewing: reset + checkout the branch, scan + load
    // Both standalone remote and attached mode now have checked-out working trees
    if (remoteViewingBranch) {
      // Safety: only run checkout on cache paths, never the real local project.
      // In attached mode, attachedLocalProjectPath holds the real path and projectPath is the cache.
      // In standalone mode, isRemoteProject is true and projectPath is always a cache clone.
      const { isRemoteProject: isRemote, attachedLocalProjectPath: attached } = useStore.getState()
      if (!isRemote && !attached) {
        // Inconsistent state — remoteViewingBranch set without remote context. Clear it.
        // Also restore projectPath if it's a cache path (e.g., after persistence gap).
        console.warn('[useProjectData] remoteViewingBranch set without remote context — clearing')
        if (projectPath.includes('/remote-cache/local-')) {
          const lastReal = useStore.getState().recentProjects.find(p => !p.isRemote)
          if (lastReal) {
            console.warn('[useProjectData] Restoring projectPath from recent:', lastReal.path)
            useStore.setState({
              projectPath: lastReal.path,
              projectType: lastReal.projectType,
              outputFolder: lastReal.outputFolder || '_bmad-output',
              remoteViewingBranch: null,
            })
            return // Effect will re-run with restored path
          }
        }
        useStore.getState().setRemoteViewingBranch(null)
        // Fall through to normal project load below
      } else {
        ;(async () => {
          try {
            await window.gitAPI.resetWorkingTree(projectPath)
            await window.gitAPI.checkoutRemoteBranch(projectPath, remoteViewingBranch)
            const scanResult = await window.fileAPI.scanBmad(projectPath) as BmadScanResult | null
            useStore.getState().setBmadScanResult(scanResult)
            if (scanResult) {
              useStore.getState().setBmadVersionError(null)
              const scanDetectedType = scanResult.modules.includes('gds')
                ? 'gds' as const
                : hasBoardModule(scanResult.modules) ? 'bmm' as const : 'dashboard' as const
              const { projectType: currentProjectType } = useStore.getState()
              if (currentProjectType !== scanDetectedType) {
                useStore.getState().setProjectType(scanDetectedType)
              }
              if (scanResult.outputFolder) {
                useStore.getState().setOutputFolder(scanResult.outputFolder)
              }
              // Merge workflow config to populate agents and workflows
              const merged = mergeWorkflowConfig(scanResult, scanDetectedType)
              useStore.getState().setScannedWorkflowConfig(merged)
            }
          } catch { /* scan failed, continue without */ }
          loadProjectData()
        })()
        return
      }
    }
    // Standalone remote project without a branch selected yet — auto-detect default branch
    if (isRemoteProject) {
      ;(async () => {
        try {
          const result = await window.gitAPI.listRemoteBranches(projectPath)
          const branches = result.branches || []
          const defaultBranch = branches.find(b => b === 'origin/develop')
            || branches.find(b => b === 'origin/main')
            || branches.find(b => b === 'origin/master')
            || branches[0]
            || 'origin/main'
          useStore.getState().setRemoteViewingBranch(defaultBranch)
          // Effect will re-run with remoteViewingBranch set → scan + load
        } catch {
          useStore.getState().setError('Failed to list remote branches')
          useStore.getState().setLoading(false)
        }
      })()
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
    window.fileAPI.scanBmad(projectPath).then((scanResult) => {
      const result = scanResult as BmadScanResult | null
      useStore.getState().setBmadScanResult(result)
      if (result) {
        // Auto-detect developer mode if not already set for this project
        const { recentProjects } = useStore.getState()
        const currentProject = recentProjects.find(p => p.path === projectPath)
        if (!currentProject?.developerMode) {
          const detected = result.detectedDeveloperMode || 'ai'
          console.log(`[useProjectData] Auto-detected developer mode: ${detected}`)
          useStore.getState().setDeveloperMode(detected)
        }
        // Version compatibility check: require BMAD v6+ stable (reject alpha builds)
        // Skip version gate for remote/read-only projects — just display whatever we can
        const { isRemoteProject: isRemote, remoteViewingBranch: remoteRef } = useStore.getState()
        const isReadOnlyView = isRemote || !!remoteRef
        const version = result.version
        if (version) {
          const major = parseInt(version.split('.')[0], 10)
          const isAlpha = /alpha/i.test(version)
          if (!isNaN(major) && (major < 6 || isAlpha) && !isReadOnlyView) {
            console.warn(`[useProjectData] Incompatible BMAD version: ${version}`)
            useStore.getState().setBmadVersionError(`Detected BMAD v${version}. BMad Studio requires BMAD v6.0.0 or later (stable format).`)
            useStore.getState().setScannedWorkflowConfig(null)
            return
          }
        } else if (!isReadOnlyView) {
          // No version in manifest = pre-6.0 alpha project
          console.warn('[useProjectData] No BMAD version detected — treating as incompatible')
          useStore.getState().setBmadVersionError('No BMAD version detected. BMad Studio requires BMAD v6.0.0 or later (stable format). This project may be using an older alpha installation.')
          useStore.getState().setScannedWorkflowConfig(null)
          return
        }
        useStore.getState().setBmadVersionError(null)

        // If .claude/commands/ is missing (BMAD installed without Claude Code as a tool),
        // redirect to the wizard so the user can run install to add Claude Code support.
        // The wizard's install step runs `npx bmad-method install --tools claude-code`.
        if (result.missingClaudeCommands && !isReadOnlyView) {
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
          useStore.getState().setProjectType(scanDetectedType)
          // Set initial viewMode for dashboard projects
          if (scanDetectedType === 'dashboard') {
            useStore.getState().setViewMode('dashboard')
          }
          // Persist corrected type to recentProjects so subsequent loads don't re-trigger correction
          const { recentProjects: rp } = useStore.getState()
          const updated = rp.map(p =>
            p.path === projectPath ? { ...p, projectType: scanDetectedType } : p
          )
          useStore.setState({ recentProjects: updated })
        }
        const merged = mergeWorkflowConfig(result, scanDetectedType)
        console.log('[useProjectData] Merged config agents:', merged.agents.length)
        useStore.getState().setScannedWorkflowConfig(merged)
      } else {
        // No _bmad/ directory at all — not a BMAD project, new project flow handles this
        useStore.getState().setBmadVersionError(null)
        useStore.getState().setScannedWorkflowConfig(null)
      }
    }).catch((err) => {
      console.error('[useProjectData] Scan failed:', err)
      useStore.getState().setBmadScanResult(null)
      useStore.getState().setScannedWorkflowConfig(null)
    })

    // Load project cost total from ledger
    window.costAPI.loadCosts(projectPath, outputFolder).then((entries) => {
      const total = entries.reduce((sum: number, e: { totalCostUsd?: number }) => sum + (e.totalCostUsd || 0), 0)
      useStore.getState().setProjectCostTotal(total)
    }).catch(() => {
      useStore.getState().setProjectCostTotal(0)
    })

    // Check if bmad folders are in .gitignore (affects branch restrictions)
    // Defer this check so it doesn't compete with initial project load
    setTimeout(() => {
      const { bmadInGitignoreUserSet } = useStore.getState()
      if (!bmadInGitignoreUserSet) {
        window.fileAPI.checkBmadInGitignore(projectPath, outputFolder).then((result) => {
          useStore.getState().setBmadInGitignore(result.inGitignore)
        })
      }
    }, 100)
  }, [_hasHydrated, projectPath, projectType, outputFolder, wizardIsActive, remoteViewingBranch, isRemoteProject])

  // File watcher setup - separate effect with minimal deps to avoid repeated start/stop
  useEffect(() => {
    if (!_hasHydrated || !projectPath || !projectType) return

    // Skip file watching if wizard is active (wizard has its own watcher)
    if (wizardIsActive) return

    // For any remote viewing (standalone or attached): watch for changes and auto-revert
    // This allows agents to read files for Q&A while preventing permanent modifications
    if (remoteViewingBranch) {
      // Safety: only auto-revert on cache paths, never the real local project
      const { isRemoteProject: isRemote, attachedLocalProjectPath: attached } = useStore.getState()
      if (!isRemote && !attached) {
        // Inconsistent state — skip remote watcher, fall through to normal watcher
      } else {
        window.fileAPI.startWatching(projectPath, projectType, outputFolder)
        useStore.getState().setIsWatching(true)
        let revertTimer: ReturnType<typeof setTimeout> | null = null
        const cleanup = window.fileAPI.onFilesChanged(() => {
          // Debounce: wait for agent to finish writing before reverting
          if (revertTimer) clearTimeout(revertTimer)
          revertTimer = setTimeout(() => {
            window.gitAPI.resetWorkingTree(projectPath).then(() => {
              console.log('[useProjectData] Auto-reverted remote project changes')
            })
          }, 3000)
        })
        return () => {
          cleanup()
          if (revertTimer) clearTimeout(revertTimer)
          window.fileAPI.stopWatching()
          useStore.getState().setIsWatching(false)
        }
      }
    }

    // Start watching for file changes (all project types including dashboard)
    window.fileAPI.startWatching(projectPath, projectType, outputFolder)
    useStore.getState().setIsWatching(true)

    // Listen for file changes
    const cleanup = window.fileAPI.onFilesChanged(() => {
      // Always bump documents revision so useDocuments refreshes
      useStore.getState().bumpDocumentsRevision()

      // Dashboard projects have no board data to reload
      const { projectType: currentType } = useStore.getState()
      if (currentType === 'dashboard') return

      // Skip reload if user is currently dragging (they already triggered a reload)
      const { isUserDragging, selectedStory: currentStory } = useStore.getState()
      if (isUserDragging) return

      loadProjectData()
      // Also reload story content if a story dialog is open
      if (currentStory?.filePath) {
        loadStoryContent(currentStory)
      }
    })

    // Cleanup watcher and listener on unmount or path change
    return () => {
      cleanup()
      window.fileAPI.stopWatching()
      useStore.getState().setIsWatching(false)
    }
  }, [_hasHydrated, projectPath, projectType, outputFolder, wizardIsActive, remoteViewingBranch, isRemoteProject])

  // Periodic staleness check for remote branch viewing
  useEffect(() => {
    if (!projectPath || !remoteViewingBranch) return

    // Safety: only fetch on cache paths, never the real local project.
    // In attached mode, attachedLocalProjectPath holds the real path and projectPath is the cache.
    // In standalone mode, isRemoteProject is true and projectPath is always a cache clone.
    const { isRemoteProject: isRemote, attachedLocalProjectPath: attached } = useStore.getState()
    if (!isRemote && !attached) return

    // Clear stale flag when branch changes (fresh data just loaded)
    useStore.getState().setRemoteUpdateAvailable(false)

    const check = async () => {
      const result = await window.gitAPI.checkRemoteAhead(projectPath, remoteViewingBranch)
      if (result.ahead) {
        useStore.getState().setRemoteUpdateAvailable(true)
      }
    }

    // Check every 60s
    const timer = setInterval(check, 60_000)
    return () => clearInterval(timer)
  }, [projectPath, remoteViewingBranch])

  // Load story content when selected story changes
  useEffect(() => {
    if (selectedStory) {
      loadStoryContent(selectedStory)
    } else {
      useStore.getState().setStoryContent(null)
    }
  }, [selectedStory])
}

/**
 * Lightweight hook for project switching/selection callbacks.
 * Safe to call from multiple components — no effects, no side effects.
 */
export function useProjectData() {
  const setProjectPath = useStore((s) => s.setProjectPath)
  const setProjectType = useStore((s) => s.setProjectType)
  const setOutputFolder = useStore((s) => s.setOutputFolder)
  const setError = useStore((s) => s.setError)
  const addRecentProject = useStore((s) => s.addRecentProject)
  const setNewProjectDialogOpen = useStore((s) => s.setNewProjectDialogOpen)
  const setPendingNewProject = useStore((s) => s.setPendingNewProject)
  const setViewMode = useStore((s) => s.setViewMode)

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
  }, [setProjectPath, setProjectType, setOutputFolder, setError, addRecentProject, setNewProjectDialogOpen, setPendingNewProject, setViewMode])

  const switchToProject = useCallback((project: import('../store').RecentProject) => {
    if (!project.projectType) return

    // No need to save threads — backend already writes to JSONL during streaming
    const state = useStore.getState()

    // Always save current project to background when switching.
    // Even projects with only loading agents (no messages yet) need to be saved,
    // otherwise IPC events arriving after the switch are silently dropped.
    if (state.projectPath) {
      state.saveToBackground()
    }

    // Re-read background projects AFTER save — the `state` variable captured above
    // is stale after saveToBackground() mutates the store
    const currentBgProjects = useStore.getState().backgroundProjects
    const bgState = currentBgProjects[project.path]

    // Batch all state updates into a single set() to avoid 9 separate persist cycles
    // Each persist cycle reads/writes the 645KB settings file via IPC
    const filtered = state.recentProjects.filter((p) => p.path !== project.path)
    const updatedRecent = [project, ...filtered].slice(0, 10)

    if (bgState) {
      // Restore from background — pop from map and apply saved state
      // Restore chatThreads from background for instant display (status, messages, session IDs).
      // The loadAllAgentStatuses effect will merge in any in-memory updates from the backend.
      const { [project.path]: _, ...restBackground } = currentBgProjects
      useStore.setState({
        backgroundProjects: restBackground,
        projectPath: project.path,
        projectType: project.projectType,
        outputFolder: bgState.outputFolder,
        developerMode: bgState.developerMode,
        baseBranch: bgState.baseBranch,
        enableEpicBranches: bgState.enableEpicBranches,
        allowDirectEpicMerge: project.allowDirectEpicMerge ?? false,
        disableGitBranching: bgState.disableGitBranching,
        colorTheme: project.colorTheme || 'gruvbox-dark',
        selectedEpicId: null,
        recentProjects: updatedRecent,
        // Restore orchestration state from background
        fullCycle: bgState.fullCycle,
        epicCycle: bgState.epicCycle,
        // Restore chatThreads with live typing/activity state from background.
        // Background event routing keeps these up-to-date while the project is in the background.
        chatThreads: { ...bgState.chatThreads },
        stories: bgState.stories,
        epics: bgState.epics,
        aiTool: bgState.aiTool,
        claudeModel: bgState.claudeModel,
        customEndpoint: bgState.customEndpoint,
        fullCycleReviewCount: bgState.fullCycleReviewCount,
        scannedWorkflowConfig: bgState.scannedWorkflowConfig,
        bmadScanResult: bgState.bmadScanResult,
        selectedChatAgent: null,
        gitDiffPanelOpen: false,
        gitDiffPanelBranch: null,
        // Don't show loading — we already have data from background
        loading: false,
        viewMode: project.projectType === 'dashboard' ? 'dashboard' : 'board',
        remoteViewingBranch: null,
        attachedLocalProjectPath: null,
        remoteUpdateAvailable: false,
        isRemoteProject: project.isRemote ?? false,
        remoteProjectUrl: project.remoteUrl ?? null,
        ...(project.isRemote ? { currentBranch: '(remote)' } : {}),
      })
    } else {
      // Clean load — no background state, fresh start
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
        // Show loading immediately so user sees spinner instead of stale "All Epics" board
        loading: true,
        epics: [],
        stories: [],
        // Reset cycle state for clean project
        fullCycle: initialFullCycleState,
        epicCycle: initialEpicCycleState,
        // Set correct viewMode for the target project type
        viewMode: project.projectType === 'dashboard' ? 'dashboard' : 'board',
        // Clear stale scan data so hasBrd computes correctly before new scan completes
        bmadScanResult: null,
        scannedWorkflowConfig: null,
        // Clear remote viewing state when switching projects
        remoteViewingBranch: null,
        attachedLocalProjectPath: null,
        remoteUpdateAvailable: false,
        // Restore remote project state from recent project entry
        isRemoteProject: project.isRemote ?? false,
        remoteProjectUrl: project.remoteUrl ?? null,
        // Remote projects have no local checkout — set placeholder so UI components render
        ...(project.isRemote ? { currentBranch: '(remote)' } : {}),
      })
    }
  }, [])

  return {
    selectProject,
    switchToProject,
    loadProjectData,
    loadStoryContent
  }
}
