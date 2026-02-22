import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { Box, Typography, Button, Stack, Divider, IconButton, Tooltip, Alert, Popover, Badge, LinearProgress } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import ReplayIcon from '@mui/icons-material/Replay'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import DescriptionIcon from '@mui/icons-material/Description'
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'
import { useStore } from '../../store'
import { getWizardSteps } from '../../data/wizardSteps'
import { HUMAN_DEV_FILES, HUMAN_DEV_FILES_VERSION } from '../../data/humanDevFiles'
import { HUMAN_DEV_FILES_GDS } from '../../data/humanDevFilesGds'
import { resolveCommand, mergeWorkflowConfig } from '../../utils/workflowMerge'
import { useWorkflow } from '../../hooks/useWorkflow'
import { transformCommand } from '../../utils/commandTransform'
import type { BmadScanResult } from '../../types/bmadScan'
import type { WizardStep } from '../../types/projectWizard'
import SettingsMenu from '../SettingsMenu/SettingsMenu'
import WizardStepper from './WizardStepper'
import InstallStep from './InstallStep'
import ArtifactViewer from '../HelpPanel/ArtifactViewer'
import { usePlanningArtifacts, getArtifactTypeLabel, getArtifactTypeColor, PlanningArtifact } from '../../hooks/usePlanningArtifacts'
import { registerCompletionCallback, unregisterCompletionCallback } from '../../hooks/useChatMessageHandler'

// Simple path join for renderer (no Node path module available)
function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/')
}

// Detect if a markdown file is an unfilled BMAD template
// Returns a warning message if template markers are found, null if content looks real
function detectTemplateContent(content: string): string | null {
  // Check for {{variable}} template placeholders
  const templateVars = content.match(/\{\{[^}]+\}\}/g)
  if (templateVars && templateVars.length >= 2) {
    return `File contains template placeholders (${templateVars.slice(0, 3).join(', ')}${templateVars.length > 3 ? '...' : ''})`
  }
  // Check for [Add ...] / [Insert ...] / [TODO] instruction markers
  const instructionMarkers = content.match(/\[(Add |Insert |TODO|PLACEHOLDER)[^\]]*\]/g)
  if (instructionMarkers && instructionMarkers.length >= 2) {
    return 'File contains unfilled placeholder instructions'
  }
  // Very small files (< 500 bytes with at least one heading) are likely empty templates
  if (content.length < 500 && content.includes('#')) {
    return 'File appears to be an empty template (very little content)'
  }
  return null
}

// Check if a wizard step's output exists (file or dir+prefix)
// BMAD places some outputs in planning-artifacts/ and others (brainstorming/, research/)
// directly under the output folder, so check both locations.
// Returns { exists, templateWarning } — exists means file is there, templateWarning means it looks unfilled
async function checkStepOutput(step: WizardStep, projectPath: string, outputFolder: string): Promise<{ exists: boolean; templateWarning: string | null }> {
  const outputBase = joinPath(projectPath, outputFolder)
  const searchDirs = [
    joinPath(outputBase, 'planning-artifacts'),
    joinPath(outputBase, 'implementation-artifacts'),
    outputBase
  ]
  if (step.outputFile) {
    for (const dir of searchDirs) {
      const filePath = joinPath(dir, step.outputFile)
      if (await window.wizardAPI.checkFileExists(filePath)) {
        // Check content for template markers
        try {
          const result = await window.fileAPI.readFile(filePath)
          if (result.content) {
            const warning = detectTemplateContent(result.content)
            return { exists: true, templateWarning: warning }
          }
        } catch { /* ignore read errors */ }
        return { exists: true, templateWarning: null }
      }
    }
    return { exists: false, templateWarning: null }
  }
  if (step.outputFilePrefix) {
    for (const dir of searchDirs) {
      if (await window.wizardAPI.checkDirHasPrefix(dir, step.outputFilePrefix)) {
        return { exists: true, templateWarning: null }
      }
    }
    return { exists: false, templateWarning: null }
  }
  if (step.outputDir && step.outputDirPrefix) {
    for (const dir of searchDirs) {
      if (await window.wizardAPI.checkDirHasPrefix(joinPath(dir, step.outputDir), step.outputDirPrefix)) {
        return { exists: true, templateWarning: null }
      }
    }
    return { exists: false, templateWarning: null }
  }
  return { exists: false, templateWarning: null }
}

export default function ProjectWizard() {
  const {
    projectWizard,
    advanceWizardStep,
    skipWizardStep,
    updateWizardStep,
    goToWizardStep,
    rerunWizardStep,
    completeWizard,
    cancelWizard,
    setProjectPath,
    setProjectType,
    addRecentProject,
    setViewMode,
    setSelectedEpicId,
    setSelectedChatAgent,
    setPendingChatMessage,
    clearChatThread,
    bmadScanResult,
    setBmadScanResult,
    setScannedWorkflowConfig,
    aiTool,
    outputFolder,
    setWizardActiveSubStep
  } = useStore()

  const { getAgentName } = useWorkflow()
  const { isActive, projectPath, currentStep, stepStatuses, error } = projectWizard
  const modules = projectWizard.selectedModules || ['bmm']
  const primaryModule = modules.includes('gds') ? 'gds' : 'bmm'
  const ACTIVE_STEPS = useMemo(() => getWizardSteps(primaryModule as 'bmm' | 'gds'), [primaryModule])
  const persistRef = useRef(false)
  const finishingRef = useRef(false) // Guards against save effect re-creating file during finish
  const [docsAnchor, setDocsAnchor] = useState<null | HTMLElement>(null)
  const [selectedArtifact, setSelectedArtifact] = useState<PlanningArtifact | null>(null)
  const { artifacts, refresh: refreshArtifacts } = usePlanningArtifacts()
  const [artifactWarnings, setArtifactWarnings] = useState<Set<string>>(new Set())
  const [stepWarnings, setStepWarnings] = useState<Set<number>>(new Set())
  const resumeChecked = useRef(false)

  // On mount, check for saved wizard state and resume if found
  useEffect(() => {
    if (!isActive || !projectPath || resumeChecked.current) return
    resumeChecked.current = true

    window.wizardAPI.loadState(projectPath, outputFolder).then((savedState) => {
      if (savedState && typeof savedState === 'object' && 'stepStatuses' in (savedState as Record<string, unknown>)) {
        const { resumeWizard } = useStore.getState()
        const ws = savedState as import('../../types/projectWizard').ProjectWizardState
        // Only resume if wizard was active
        if (ws.isActive && ws.projectPath === projectPath) {
          resumeWizard(ws)
        }
      }
    })
  }, [isActive, projectPath, outputFolder])

  // On resume, if install step is already done, trigger a BMAD scan so agent commands resolve.
  // The scan normally runs in handleInstallComplete, but on resume it's skipped.
  useEffect(() => {
    if (!isActive || !projectPath || bmadScanResult) return
    if (!stepStatuses.length || stepStatuses[0] !== 'completed') return
    window.fileAPI.scanBmad(projectPath).then((scanResult) => {
      const result = scanResult as BmadScanResult | null
      setBmadScanResult(result)
      if (result) {
        // Auto-correct project type from scan data (fixes stale recent project entries)
        const scanDetectedType = result.modules.includes('gds') ? 'gds' as const : 'bmm' as const
        const { projectType: currentProjectType, setProjectType: setType } = useStore.getState()
        if (currentProjectType !== scanDetectedType) {
          console.log(`[ProjectWizard] Correcting project type: ${currentProjectType} → ${scanDetectedType}`)
          setType(scanDetectedType)
        }
        const merged = mergeWorkflowConfig(result, scanDetectedType)
        setScannedWorkflowConfig(merged)
      }
    }).catch(() => {})
  }, [isActive, projectPath, bmadScanResult, stepStatuses, setBmadScanResult, setScannedWorkflowConfig])

  // After mount, check if any pending/active steps already have their output file.
  // This handles: (1) resume where agent finished but user didn't click "Mark Complete",
  // (2) resume where files were created externally (e.g., by CLI) while wizard was closed.
  // The file watcher only fires on changes, so pre-existing files need this initial scan.
  const initialFileCheckDone = useRef(false)
  useEffect(() => {
    if (!isActive || !projectPath || initialFileCheckDone.current) return
    if (!stepStatuses.length) return
    // Wait for any resume to settle
    const timer = setTimeout(async () => {
      initialFileCheckDone.current = true
      const { projectWizard: wiz } = useStore.getState()
      for (let i = 0; i < ACTIVE_STEPS.length; i++) {
        const status = wiz.stepStatuses[i]
        if (status !== 'pending' && status !== 'active') continue
        const step = ACTIVE_STEPS[i]
        if (!step.outputFile && !step.outputFilePrefix && !(step.outputDir && step.outputDirPrefix)) continue
        const { exists } = await checkStepOutput(step, projectPath, outputFolder)
        if (exists) {
          const { updateWizardStep, advanceWizardStep, projectWizard: freshWiz } = useStore.getState()
          updateWizardStep(i, 'completed')
          if (i === freshWiz.currentStep) {
            advanceWizardStep()
          }
        }
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [isActive, projectPath, outputFolder, stepStatuses])

  // Persist wizard state on changes
  useEffect(() => {
    if (!isActive || !projectPath) return
    // Skip first render
    if (!persistRef.current) {
      persistRef.current = true
      return
    }
    // Don't save if we're in the process of finishing (prevents re-creating deleted file)
    if (finishingRef.current) return
    window.wizardAPI.saveState(projectPath, projectWizard, outputFolder)
  }, [isActive, projectPath, outputFolder, currentStep, stepStatuses, projectWizard])

  // Start wizard file watcher when active
  useEffect(() => {
    if (!isActive || !projectPath) return
    window.wizardAPI.startWatching(projectPath, outputFolder)
    return () => { window.wizardAPI.stopWatching() }
  }, [isActive, projectPath, outputFolder])

  // Listen for file changes to auto-detect step completion
  useEffect(() => {
    if (!isActive || !projectPath) return

    const cleanup = window.wizardAPI.onFileChanged(async () => {
      // Refresh planning documents list
      refreshArtifacts()

      // Check pending and active steps for output file existence.
      // Pending steps that aren't the current step get auto-completed (pre-existing output).
      // Active steps get auto-completed only if content passes template check.
      const { projectWizard: wiz } = useStore.getState()
      for (let i = 0; i < ACTIVE_STEPS.length; i++) {
        const step = ACTIVE_STEPS[i]
        const status = wiz.stepStatuses[i]
        if (status !== 'pending' && status !== 'active') continue
        // Skip pending current step — the user may have navigated back to re-run it
        if (status === 'pending' && i === wiz.currentStep) continue
        if (!step.outputFile && !step.outputFilePrefix && !(step.outputDir && step.outputDirPrefix)) continue

        const { exists, templateWarning } = await checkStepOutput(step, projectPath, outputFolder)
        if (exists) {
          // For active steps with template content, warn instead of auto-completing
          if (status === 'active' && templateWarning) {
            const { setWizardError } = useStore.getState()
            setWizardError(`⚠ ${step.name}: ${templateWarning}. Complete conversation with agent, re-run this step, or mark it complete manually.`)
            continue
          }
          updateWizardStep(i, 'completed')
          if (i === wiz.currentStep) {
            advanceWizardStep()
          }
        }
      }
    })

    return cleanup
  }, [isActive, projectPath, outputFolder, updateWizardStep, advanceWizardStep])

  // On step navigation, check completed/active steps for missing or template output
  useEffect(() => {
    if (!isActive || !projectPath) return
    const folder = outputFolder || '_bmad-output'
    const warnings: string[] = []

    ;(async () => {
      for (let i = 0; i < ACTIVE_STEPS.length && i < currentStep; i++) {
        const step = ACTIVE_STEPS[i]
        const status = stepStatuses[i]
        // Only check steps that should have output (active or completed, with an output file)
        if (status !== 'active' && status !== 'completed') continue
        if (!step.outputFile && !step.outputFilePrefix && !(step.outputDir && step.outputDirPrefix)) continue

        const { exists, templateWarning } = await checkStepOutput(step, projectPath, folder)
        if (!exists) {
          warnings.push(`⚠ ${step.name}: Output file not found.`)
        } else if (templateWarning) {
          warnings.push(`⚠ ${step.name}: ${templateWarning}. Complete conversation with agent, re-run this step, or mark it complete manually.`)
        }
      }
      const { setWizardError } = useStore.getState()
      if (warnings.length > 0) {
        setWizardError(warnings.join('\n'))
      } else {
        setWizardError(null)
      }
    })()
  }, [isActive, projectPath, outputFolder, currentStep, stepStatuses, ACTIVE_STEPS])

  // Check artifacts for template content — mirrors the bottom warning logic:
  // only flag artifacts whose corresponding step is before the current step
  useEffect(() => {
    if (!isActive || !projectPath) {
      setArtifactWarnings(new Set())
      setStepWarnings(new Set())
      return
    }
    let cancelled = false
    const folder = outputFolder || '_bmad-output'
    ;(async () => {
      const artWarnings = new Set<string>()
      const sWarnings = new Set<number>()
      for (let i = 0; i < ACTIVE_STEPS.length && i < currentStep; i++) {
        const step = ACTIVE_STEPS[i]
        const status = stepStatuses[i]
        if (status !== 'active' && status !== 'completed') continue
        if (!step.outputFile) continue

        const { exists, templateWarning } = await checkStepOutput(step, projectPath, folder)
        if (exists && templateWarning) {
          sWarnings.add(i)
          const match = artifacts.find(a => a.path.endsWith('/' + step.outputFile))
          if (match) artWarnings.add(match.path)
        }
      }
      if (!cancelled) {
        setArtifactWarnings(artWarnings)
        setStepWarnings(sWarnings)
      }
    })()
    return () => { cancelled = true }
  }, [isActive, projectPath, outputFolder, currentStep, stepStatuses, ACTIVE_STEPS, artifacts])

  // Enrich wizard steps with dynamically resolved agent names from scan data
  const resolvedSteps = useMemo(() => {
    return ACTIVE_STEPS.map(step => {
      if (step.type !== 'agent' || !step.commandRef || !bmadScanResult) return step
      const resolved = resolveCommand(step.commandRef, step.commandModule || '', step.commandType || 'workflows', bmadScanResult, step.agentId)
      if (!resolved) return step
      return {
        ...step,
        agentId: resolved.agentId,
        agentName: getAgentName(resolved.agentId)
      }
    })
  }, [ACTIVE_STEPS, bmadScanResult, getAgentName])

  // Build maps from scan data: commandRef -> stepCount, maxStepNumber, stepNames
  const { stepCounts, maxStepNumbers, stepNamesByCommand } = useMemo(() => {
    const counts: Record<string, number> = {}
    const maxSteps: Record<string, number> = {}
    const names: Record<string, string[]> = {}
    if (!bmadScanResult) return { stepCounts: counts, maxStepNumbers: maxSteps, stepNamesByCommand: names }
    for (const wf of bmadScanResult.workflows) {
      counts[wf.name] = wf.stepCount
      maxSteps[wf.name] = wf.maxStepNumber
      if (wf.stepNames?.length) names[wf.name] = wf.stepNames
    }
    const nonZero = Object.entries(counts).filter(([, v]) => v > 0)
    if (nonZero.length > 0) {
      console.log('[WizardProgress] stepCounts:', Object.fromEntries(nonZero))
    }
    return { stepCounts: counts, maxStepNumbers: maxSteps, stepNamesByCommand: names }
  }, [bmadScanResult])

  // Compute weighted progress
  // Only required steps + actively engaged optional steps count toward the total.
  // Skipped and pending-optional steps are excluded so the bar reaches 100%
  // once all required work is done without being deflated by untouched optional steps.
  const { wizardActiveSubStep } = projectWizard
  const progressPercent = useMemo(() => {
    let completedWeight = 0
    let totalWeight = 0

    for (let i = 0; i < ACTIVE_STEPS.length; i++) {
      const status = stepStatuses[i]
      if (status === 'skipped') continue

      const step = ACTIVE_STEPS[i]

      // Exclude pending optional steps — they haven't been engaged with
      if (!step.required && status === 'pending') continue

      const count = step.commandRef ? (stepCounts[step.commandRef] || 0) : 0
      const weight = Math.max(count, 1)
      totalWeight += weight

      if (status === 'completed') {
        completedWeight += weight
      } else if (status === 'active' && count > 0 && wizardActiveSubStep > 0) {
        completedWeight += (wizardActiveSubStep / count) * weight
      }
    }

    return totalWeight > 0 ? Math.min((completedWeight / totalWeight) * 100, 100) : 0
  }, [ACTIVE_STEPS, stepStatuses, stepCounts, wizardActiveSubStep])

  const { appendWizardInstallLog, setWizardError } = useStore()

  const handleInstallComplete = useCallback(async () => {
    // Apply human developer mode files if selected
    const { projectWizard: wizState } = useStore.getState()
    if (wizState.developerMode === 'human' && projectPath) {
      appendWizardInstallLog('Applying human development mode...')

      // After install, scan to get installed BMAD version and check compatibility
      try {
        const scanResult = await window.fileAPI.scanBmad(projectPath)
        const scan = scanResult as BmadScanResult | null
        if (scan?.version && scan.version !== HUMAN_DEV_FILES_VERSION) {
          const major = (v: string) => v.split('.')[0]
          if (major(scan.version) !== major(HUMAN_DEV_FILES_VERSION)) {
            appendWizardInstallLog(
              `Warning: Human dev files target BMAD ${HUMAN_DEV_FILES_VERSION}, ` +
              `but installed version is ${scan.version}. Files may need updating.`
            )
          }
        }
      } catch {
        // Scan failure is non-fatal for this check
      }

      // Use GDS-specific human dev files when GDS module is selected
      const isGds = wizState.selectedModules?.includes('gds')
      const humanDevFiles = isGds ? HUMAN_DEV_FILES_GDS : HUMAN_DEV_FILES
      const result = await window.wizardAPI.writeProjectFiles(projectPath, humanDevFiles)
      if (!result.success) {
        setWizardError(`Human dev mode setup failed: ${result.error}`)
        return
      }
      appendWizardInstallLog(`Human development mode applied (${result.written} files updated)`)
    }

    // Write user profile fields to module config.yaml files
    if (projectPath) {
      const { bmadUserName, bmadLanguage } = useStore.getState()
      if (bmadUserName || bmadLanguage) {
        const fields: Record<string, string> = {}
        if (bmadUserName) fields.user_name = bmadUserName
        if (bmadLanguage) fields.communication_language = bmadLanguage
        await window.wizardAPI.appendConfigFields(projectPath, fields)
      }
    }

    advanceWizardStep()
    // Trigger BMAD scan after install so subsequent steps can resolve dynamically
    if (projectPath) {
      console.log('[Wizard] Install complete, scanning:', projectPath)
      window.fileAPI.scanBmad(projectPath).then((scanResult) => {
        const result = scanResult as BmadScanResult | null
        console.log('[Wizard] Scan result:', result ? `${result.agents.length} agents` : 'null')
        setBmadScanResult(result)
        if (result) {
          const scanDetectedType = result.modules.includes('gds') ? 'gds' as const : 'bmm' as const
          const { projectType: currentProjectType, setProjectType: setType } = useStore.getState()
          if (currentProjectType !== scanDetectedType) {
            console.log(`[Wizard] Correcting project type: ${currentProjectType} → ${scanDetectedType}`)
            setType(scanDetectedType)
          }
          console.log('[Wizard] Merging with projectType:', scanDetectedType)
          const merged = mergeWorkflowConfig(result, scanDetectedType)
          console.log('[Wizard] Merged config agents:', merged.agents.length)
          setScannedWorkflowConfig(merged)
        }
      }).catch((err) => {
        console.error('[Wizard] Scan failed:', err)
      })
    } else {
      console.warn('[Wizard] No projectPath for scan')
    }
  }, [advanceWizardStep, projectPath, setBmadScanResult, setScannedWorkflowConfig, appendWizardInstallLog, setWizardError])

  const handleStartAgentStep = useCallback((stepIndex: number) => {
    const step = ACTIVE_STEPS[stepIndex]
    if (!step || step.type !== 'agent') return

    // Resolve command dynamically from scan data
    let agentId = step.agentId
    let command: string | undefined

    if (step.commandRef && bmadScanResult) {
      const resolved = resolveCommand(step.commandRef, step.commandModule || '', step.commandType || 'workflows', bmadScanResult, step.agentId)
      if (resolved) {
        agentId = resolved.agentId
        command = transformCommand(resolved.command, aiTool)
      }
    }

    if (!agentId) return

    // Reset sub-step tracking for the new step
    setWizardActiveSubStep(0)

    // Register completion callback — auto-complete the step when agent exits successfully
    // and the output file exists. For workflows with step files (e.g., PRD which is built
    // progressively), also require the agent to have reached the last step number.
    const maxStep = step.commandRef ? (maxStepNumbers[step.commandRef] || 0) : 0
    registerCompletionCallback(agentId, async (success) => {
      if (!success) return
      const { projectWizard: wiz, updateWizardStep: update, advanceWizardStep: advance, setWizardActiveSubStep: resetSub } = useStore.getState()
      if (!wiz.isActive || wiz.stepStatuses[stepIndex] !== 'active') return
      const currentProjectPath = wiz.projectPath
      const currentOutputFolder = wiz.outputFolder || '_bmad-output'
      if (!currentProjectPath) return

      // For workflows with step files, require the agent to have reached the last step.
      // This prevents auto-completing when the agent exits mid-workflow (e.g., to ask a question)
      // while the output file already exists but is only partially built.
      if (maxStep > 0 && wiz.wizardActiveSubStep < maxStep) {
        console.log(`[WizardProgress] Skipping auto-complete for step ${stepIndex} (${step.name}) — agent at sub-step ${wiz.wizardActiveSubStep}/${maxStep}`)
        return
      }

      // Check if the step's output artifact exists and has real content
      const { exists, templateWarning } = await checkStepOutput(step, currentProjectPath, currentOutputFolder)
      if (exists) {
        if (templateWarning) {
          // Output file exists but looks like an unfilled template — warn user
          console.log(`[WizardProgress] Template warning for step ${stepIndex} (${step.name}): ${templateWarning}`)
          const { setWizardError } = useStore.getState()
          setWizardError(`⚠ ${step.name}: ${templateWarning}. Complete conversation with agent, re-run this step, or mark it complete manually.`)
          return
        }
        console.log(`[WizardProgress] Auto-completing step ${stepIndex} (${step.name}) — agent exited + output exists`)
        resetSub(0)
        update(stepIndex, 'completed')
        if (stepIndex === wiz.currentStep) {
          advance()
        }
        unregisterCompletionCallback(agentId!)
      }
    })

    // If command couldn't be resolved from scan, open agent chat without a pre-filled command
    updateWizardStep(stepIndex, 'active')
    // Cancel any running process for this agent before clearing
    window.chatAPI.cancelMessage(agentId).catch(() => {})
    clearChatThread(agentId)
    setSelectedChatAgent(agentId)
    setViewMode('chat')
    if (command) {
      setPendingChatMessage({
        agentId,
        message: command
      })
    }
  }, [ACTIVE_STEPS, updateWizardStep, clearChatThread, setSelectedChatAgent, setViewMode, setPendingChatMessage, bmadScanResult, aiTool, setWizardActiveSubStep, maxStepNumbers])

  const handleMarkStepComplete = useCallback((stepIndex: number) => {
    setWizardActiveSubStep(0)
    updateWizardStep(stepIndex, 'completed')
    // If this was the current step, advance
    if (stepIndex === currentStep) {
      advanceWizardStep()
    }
  }, [currentStep, updateWizardStep, advanceWizardStep, setWizardActiveSubStep])

  const handleSkipStep = useCallback((stepIndex: number) => {
    setWizardActiveSubStep(0)
    skipWizardStep(stepIndex)
  }, [skipWizardStep, setWizardActiveSubStep])

  const handleGoToStep = useCallback((stepIndex: number) => {
    goToWizardStep(stepIndex)
    const step = ACTIVE_STEPS[stepIndex]
    if (step?.agentId) {
      setSelectedChatAgent(step.agentId)
    }
  }, [goToWizardStep, ACTIVE_STEPS, setSelectedChatAgent])

  const handleAdvanceStep = useCallback(() => {
    advanceWizardStep()
    const nextStep = ACTIVE_STEPS[currentStep + 1]
    if (nextStep?.agentId) {
      setSelectedChatAgent(nextStep.agentId)
    }
  }, [advanceWizardStep, currentStep, ACTIVE_STEPS, setSelectedChatAgent])

  const setBaseBranch = useStore((state) => state.setBaseBranch)

  const handleFinishSetup = useCallback(async () => {
    if (!projectPath) return

    // Validate that essential project artifacts exist before finishing
    const finalProjectType = modules.includes('gds') ? 'gds' : 'bmm'
    const planningPath = joinPath(projectPath, outputFolder, 'planning-artifacts')
    const implPath = joinPath(projectPath, outputFolder, 'implementation-artifacts')

    const missing: string[] = []
    const outputBase = joinPath(projectPath, outputFolder)

    // Check epics.md or sharded epic-*.md files — check all possible locations
    const epicsLocations = [planningPath, outputBase]
    let epicsFound = false
    for (const loc of epicsLocations) {
      if (await window.wizardAPI.checkFileExists(joinPath(loc, 'epics.md'))) { epicsFound = true; break }
      if (await window.wizardAPI.checkDirHasPrefix(loc, 'epic-')) { epicsFound = true; break }
    }
    if (!epicsFound) missing.push('epics.md (run the ' + (finalProjectType === 'gds' ? 'GDD' : 'Epics & Stories') + ' step)')

    // Check sprint-status.yaml — check both implementation-artifacts and output root
    const statusLocations = [implPath, outputBase]
    let statusFound = false
    for (const loc of statusLocations) {
      if (await window.wizardAPI.checkFileExists(joinPath(loc, 'sprint-status.yaml'))) { statusFound = true; break }
    }
    if (!statusFound) missing.push('sprint-status.yaml (run Sprint Planning)')

    if (missing.length > 0) {
      setWizardError('Missing required artifacts:\n' + missing.map(m => '• ' + m).join('\n'))
      return
    }

    // Clear any previous validation error
    setWizardError(null)

    // Prevent save effect from re-creating the file during finish
    finishingRef.current = true

    // Delete wizard state file
    await window.wizardAPI.deleteState(projectPath, outputFolder)
    await window.wizardAPI.stopWatching()

    // Detect the default branch name from git (could be 'main' or 'master' depending on config)
    let detectedBaseBranch = 'main'
    try {
      const branchResult = await window.gitAPI.getCurrentBranch(projectPath)
      if (branchResult.branch) {
        detectedBaseBranch = branchResult.branch
      }
    } catch { /* fallback to 'main' */ }

    // Set the project as loaded
    const projectName = projectPath.split('/').pop() || 'Unknown'
    setProjectPath(projectPath)
    setProjectType(finalProjectType)
    setBaseBranch(detectedBaseBranch)
    addRecentProject({
      path: projectPath,
      projectType: finalProjectType,
      name: projectName,
      outputFolder,
      developerMode: projectWizard.developerMode,
      baseBranch: detectedBaseBranch
    })

    // Switch to board view and reset epic filter so all stories are visible
    setViewMode('board')
    setSelectedEpicId(null)

    completeWizard()
  }, [projectPath, outputFolder, modules, setProjectPath, setProjectType, setBaseBranch, addRecentProject, setViewMode, setSelectedEpicId, completeWizard, setWizardError])

  const handleCancel = useCallback(async () => {
    if (projectPath) {
      // Keep the wizard state file so the wizard can be resumed later
      await window.wizardAPI.stopWatching()
    }
    cancelWizard()
  }, [projectPath, cancelWizard])

  if (!isActive) return null

  const currentStepData = resolvedSteps[currentStep]
  const isInstallStep = currentStep === 0
  const allRequiredDone = ACTIVE_STEPS.every((step, i) =>
    !step.required || stepStatuses[i] === 'completed'
  )
  const isFinished = currentStep >= ACTIVE_STEPS.length

  return (
    <Box
      sx={{
        width: 360,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexShrink: 0
      }}
    >
      {/* Header */}
      <Box sx={{ pt: 5, px: 2, pb: 2, borderBottom: 1, borderColor: 'divider', position: 'relative' }}>
        {/* Drag region in the top padding area for window movement */}
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, WebkitAppRegion: 'drag' }} />
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <FolderOpenIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={700}>
              New Project Setup
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ position: 'relative', zIndex: 2, WebkitAppRegion: 'no-drag' }}>
            {artifacts.length > 0 && (
              <Tooltip title="Planning Documents">
                <IconButton size="small" onClick={(e) => setDocsAnchor(e.currentTarget)}>
                  <Badge badgeContent={artifacts.length} color="primary" max={99}>
                    <Box sx={{ position: 'relative', display: 'flex' }}>
                      <DescriptionIcon fontSize="small" />
                      {artifactWarnings.size > 0 && (
                        <ReportProblemOutlinedIcon sx={{ position: 'absolute', bottom: -4, right: -4, fontSize: 12, color: 'error.main' }} />
                      )}
                    </Box>
                  </Badge>
                </IconButton>
              </Tooltip>
            )}
            <SettingsMenu compact />
            <Tooltip title="Cancel wizard">
              <IconButton size="small" onClick={handleCancel}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {projectPath?.split('/').pop() || 'Unknown'}
        </Typography>
      </Box>

      {/* Progress Bar */}
      {stepStatuses.some(s => s === 'completed' || s === 'active') && (
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Overall Progress
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {Math.round(progressPercent)}%
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: 'action.hover',
              '& .MuiLinearProgress-bar': { borderRadius: 3 }
            }}
          />
        </Box>
      )}

      {/* Stepper */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <WizardStepper
          steps={resolvedSteps}
          currentStep={currentStep}
          stepStatuses={stepStatuses}
          stepCounts={stepCounts}
          stepNames={stepNamesByCommand}
          activeSubStep={wizardActiveSubStep > 0 && currentStepData?.commandRef ? {
            commandRef: currentStepData.commandRef,
            current: wizardActiveSubStep
          } : undefined}
          stepWarnings={stepWarnings}
          onStartStep={handleStartAgentStep}
          onGoToStep={handleGoToStep}
        />

        {/* Current step detail area */}
        <Divider />
        <Box sx={{ p: 2 }}>
          {isInstallStep && stepStatuses[0] !== 'completed' ? (
            <InstallStep onComplete={handleInstallComplete} />
          ) : currentStepData && !isFinished ? (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                {currentStepData.description}
              </Typography>

              {currentStepData.type === 'agent' && stepStatuses[currentStep] === 'pending' && (
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<PlayArrowIcon />}
                    onClick={() => handleStartAgentStep(currentStep)}
                    sx={{ flex: 1 }}
                  >
                    Start
                  </Button>
                  {!currentStepData.required && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<SkipNextIcon />}
                      onClick={() => handleSkipStep(currentStep)}
                    >
                      Skip
                    </Button>
                  )}
                </Stack>
              )}

              {currentStepData.type === 'agent' && stepStatuses[currentStep] === 'active' && (
                <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                  Chat with {currentStepData.agentName} in the chat panel. When done, return here and mark the step complete.
                </Alert>
              )}

              {stepStatuses[currentStep] === 'active' && (
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CheckIcon />}
                    onClick={() => handleMarkStepComplete(currentStep)}
                    sx={{ flex: 1 }}
                  >
                    Mark Complete
                  </Button>
                  {!currentStepData.required && (
                    <Button
                      variant="outlined"
                      size="small"
                      color="inherit"
                      startIcon={<SkipNextIcon />}
                      onClick={() => handleSkipStep(currentStep)}
                    >
                      Skip
                    </Button>
                  )}
                </Stack>
              )}

              {stepStatuses[currentStep] === 'completed' && (
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    endIcon={<NavigateNextIcon />}
                    onClick={handleAdvanceStep}
                    sx={{ flex: 1 }}
                  >
                    Next Step
                  </Button>
                  {currentStepData.type === 'agent' && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<ReplayIcon />}
                      onClick={() => rerunWizardStep(currentStep)}
                    >
                      Re-run
                    </Button>
                  )}
                </Stack>
              )}

              {(stepStatuses[currentStep] === 'skipped') && currentStepData.type === 'agent' && (
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ReplayIcon />}
                    onClick={() => rerunWizardStep(currentStep)}
                    sx={{ flex: 1 }}
                  >
                    Run this step
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    endIcon={<NavigateNextIcon />}
                    onClick={handleAdvanceStep}
                  >
                    Next Step
                  </Button>
                </Stack>
              )}

              {allRequiredDone && (
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleFinishSetup}
                  fullWidth
                  size="small"
                  sx={{ mt: 1 }}
                >
                  Finish Setup
                </Button>
              )}
            </Stack>
          ) : null}

          {/* Finish button when all required steps done */}
          {isFinished && (
            <Stack spacing={2}>
              <Alert severity="success">
                All required steps are complete! Your project is ready to use.
              </Alert>
              <Button
                variant="contained"
                color="success"
                onClick={handleFinishSetup}
                fullWidth
                size="large"
              >
                Finish Setup
              </Button>
            </Stack>
          )}

          {/* Error display */}
          {error && (
            <Alert severity="error" sx={{ mt: 2, whiteSpace: 'pre-line' }}>
              {error}
            </Alert>
          )}
        </Box>
      </Box>
      {/* Planning Documents Popover */}
      <Popover
        open={Boolean(docsAnchor)}
        anchorEl={docsAnchor}
        onClose={() => setDocsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: { p: 2, maxWidth: 360, maxHeight: 400, overflow: 'auto', borderRadius: 1.5 }
          }
        }}
      >
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
          Planning Documents
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {artifacts.map((artifact) => (
            <Box
              key={artifact.path}
              onClick={() => { setSelectedArtifact(artifact); setDocsAnchor(null) }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 0.75,
                borderRadius: 0.5,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.selected' }
              }}
            >
              {artifactWarnings.has(artifact.path) && (
                <Tooltip title="File appears to be an unfilled template" arrow>
                  <ReportProblemOutlinedIcon sx={{ fontSize: 14, color: 'error.main' }} />
                </Tooltip>
              )}
              <DescriptionIcon sx={{ fontSize: 16, color: getArtifactTypeColor(artifact.type) }} />
              <Typography variant="body2" sx={{ flex: 1 }}>
                {artifact.displayName}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.65rem',
                  px: 0.5,
                  py: 0.125,
                  borderRadius: 0.5,
                  bgcolor: getArtifactTypeColor(artifact.type),
                  color: 'white'
                }}
              >
                {getArtifactTypeLabel(artifact.type)}
              </Typography>
            </Box>
          ))}
        </Box>
      </Popover>

      {/* Planning Artifact Viewer Dialog */}
      <ArtifactViewer
        artifact={selectedArtifact}
        onClose={() => setSelectedArtifact(null)}
      />
    </Box>
  )
}
