import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../../store'
import { useWorkflow } from '../../hooks/useWorkflow'
import { useChatMessageHandlerContext } from '../../hooks/useChatMessageHandler'
import { saveStoryChatHistoryImmediate } from '../../utils/chatUtils'
import { buildFullCycleSteps, FullCycleStep, FullCycleState } from '../../types/fullCycle'
import { transformCommand } from '../../utils/commandTransform'
import type { AgentThread, ChatMessage } from '../../types'

/**
 * FullCycleOrchestrator - Runs the full cycle automation in the background
 *
 * This component should be mounted at the App level so it persists
 * even when the FullCycleDialog is closed. It orchestrates the steps
 * and sends commands to the chat agents in the sidebar.
 *
 * Message handling is delegated to the GlobalChatHandler. This component
 * only handles orchestration logic like detecting questions and auto-responding.
 *
 * Project-aware: When the user switches to a different project while a cycle
 * is running, state updates are routed to backgroundProjects instead of the
 * foreground state, ensuring the cycle's progress is preserved correctly.
 */
export default function FullCycleOrchestrator() {
  const projectType = useStore((state) => state.projectType)
  const outputFolder = useStore((state) => state.outputFolder)
  const stories = useStore((state) => state.stories)
  const aiTool = useStore((state) => state.aiTool)
  const customEndpoint = useStore((state) => state.customEndpoint)

  // Get agent definitions from workflow
  const { agents } = useWorkflow()
  const claudeModel = useStore((state) => state.claudeModel)
  const baseBranch = useStore((state) => state.baseBranch)
  const enableEpicBranches = useStore((state) => state.enableEpicBranches)
  const disableGitBranching = useStore((state) => state.disableGitBranching)
  const fullCycleReviewCount = useStore((state) => state.fullCycleReviewCount)
  const setCurrentBranch = useStore((state) => state.setCurrentBranch)
  const setHasUncommittedChanges = useStore((state) => state.setHasUncommittedChanges)

  // Full cycle state (for watching triggers only — updates go through routing helpers)
  const fullCycle = useStore((state) => state.fullCycle)

  // Get global handler context for registering message IDs
  const { setPendingMessage, setCurrentMessageId, clearAgentState } = useChatMessageHandlerContext()

  // Track the current run and its originating project
  const currentRunIdRef = useRef<string | null>(null)
  const cycleProjectPathRef = useRef<string | null>(null)
  const isProcessingRef = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  // --- Project-aware routing helpers ---
  // These check whether the cycle's project is still the foreground project.
  // If not, updates are routed to backgroundProjects to keep the cycle's state correct.

  const updateCycleFC = useCallback((updater: (fc: FullCycleState) => FullCycleState) => {
    const cyclePath = cycleProjectPathRef.current
    if (!cyclePath) return
    useStore.setState(state => {
      if (cyclePath === state.projectPath) {
        return { fullCycle: updater(state.fullCycle) }
      }
      const bg = state.backgroundProjects[cyclePath]
      if (!bg) return state
      return {
        backgroundProjects: {
          ...state.backgroundProjects,
          [cyclePath]: { ...bg, fullCycle: updater(bg.fullCycle) },
        },
      }
    })
  }, [])

  const defaultThread: AgentThread = {
    agentId: '', messages: [], lastActivity: Date.now(),
    unreadCount: 0, isTyping: false, isInitialized: false,
  }

  const updateCycleChat = useCallback((agentId: string, updater: (thread: AgentThread) => AgentThread) => {
    const cyclePath = cycleProjectPathRef.current
    if (!cyclePath) return
    useStore.setState(state => {
      if (cyclePath === state.projectPath) {
        const thread = state.chatThreads[agentId] || { ...defaultThread, agentId }
        return { chatThreads: { ...state.chatThreads, [agentId]: updater(thread) } }
      }
      const bg = state.backgroundProjects[cyclePath]
      if (!bg) return state
      const thread = bg.chatThreads[agentId] || { ...defaultThread, agentId }
      return {
        backgroundProjects: {
          ...state.backgroundProjects,
          [cyclePath]: { ...bg, chatThreads: { ...bg.chatThreads, [agentId]: updater(thread) } },
        },
      }
    })
  }, [])

  // Read the cycle's chat thread (foreground or background)
  const getCycleChatThread = useCallback((agentId: string): AgentThread | undefined => {
    const cyclePath = cycleProjectPathRef.current
    if (!cyclePath) return undefined
    const state = useStore.getState()
    if (cyclePath === state.projectPath) return state.chatThreads[agentId]
    return state.backgroundProjects[cyclePath]?.chatThreads[agentId]
  }, [])

  // Convenience wrappers matching the old store action signatures
  const fcAppendLog = useCallback((log: string) => {
    updateCycleFC(fc => ({ ...fc, logs: [...fc.logs, log] }))
  }, [updateCycleFC])

  const fcUpdateStep = useCallback((step: number, name: string, type: string) => {
    updateCycleFC(fc => {
      const newStatuses = [...fc.stepStatuses]
      newStatuses[step] = 'running'
      return { ...fc, currentStep: step, stepName: name, stepType: type as FullCycleState['stepType'], stepStatus: 'running', stepStatuses: newStatuses, stepStartTime: Date.now() }
    })
  }, [updateCycleFC])

  const fcAdvance = useCallback(() => {
    updateCycleFC(fc => {
      const newStatuses = [...fc.stepStatuses]
      if (fc.currentStep < newStatuses.length) newStatuses[fc.currentStep] = 'completed'
      return { ...fc, currentStep: fc.currentStep + 1, stepStatus: 'completed', stepStatuses: newStatuses }
    })
  }, [updateCycleFC])

  const fcSkip = useCallback((stepIndex: number) => {
    updateCycleFC(fc => {
      const newStatuses = [...fc.stepStatuses]
      newStatuses[stepIndex] = 'skipped'
      return { ...fc, currentStep: stepIndex + 1, stepStatus: 'skipped', stepStatuses: newStatuses }
    })
  }, [updateCycleFC])

  const fcSetError = useCallback((error: string) => {
    updateCycleFC(fc => {
      const newStatuses = [...fc.stepStatuses]
      if (fc.currentStep < newStatuses.length) newStatuses[fc.currentStep] = 'error'
      return { ...fc, error, stepStatus: 'error', stepStatuses: newStatuses }
    })
  }, [updateCycleFC])

  const fcComplete = useCallback(() => {
    updateCycleFC(fc => ({
      ...fc,
      isRunning: false,
      stepStatus: 'completed',
      stepStatuses: fc.stepStatuses.map(s => s === 'running' ? 'completed' : s),
    }))
  }, [updateCycleFC])

  const fcSetSessionId = useCallback((sessionId: string) => {
    updateCycleFC(fc => ({ ...fc, sessionId }))
  }, [updateCycleFC])

  const chatAddMessage = useCallback((agentId: string, msg: ChatMessage) => {
    const maxMsgs = useStore.getState().maxThreadMessages
    updateCycleChat(agentId, thread => ({
      ...thread,
      messages: [...thread.messages, msg].slice(-maxMsgs),
      lastActivity: Date.now(),
    }))
  }, [updateCycleChat])

  const chatSetTyping = useCallback((agentId: string, isTyping: boolean) => {
    updateCycleChat(agentId, thread => ({ ...thread, isTyping }))
  }, [updateCycleChat])

  const chatSetSessionId = useCallback((agentId: string, sessionId: string) => {
    updateCycleChat(agentId, thread => ({ ...thread, sessionId }))
  }, [updateCycleChat])

  const chatSetContext = useCallback((agentId: string, storyId: string | undefined, branchName: string | undefined) => {
    const cyclePath = cycleProjectPathRef.current
    if (cyclePath) {
      const thread = getCycleChatThread(agentId)
      window.chatAPI?.setThreadMetadata(cyclePath, agentId, {
        sessionId: thread?.sessionId || null,
        storyId: storyId || null,
        branchName: branchName || null,
        lastActivity: Date.now(),
      })
    }
    updateCycleChat(agentId, thread => ({ ...thread, storyId, branchName }))
  }, [updateCycleChat, getCycleChatThread])

  const chatClear = useCallback((agentId: string) => {
    updateCycleChat(agentId, () => ({
      agentId, messages: [], lastActivity: Date.now(),
      unreadCount: 0, isTyping: false, isInitialized: false,
      sessionId: undefined,
    }))
  }, [updateCycleChat])

  // Get steps based on project type and review count
  const getSteps = useCallback((): FullCycleStep[] => {
    const pt = projectType === 'dashboard' ? 'bmm' : (projectType || 'bmm')
    return buildFullCycleSteps(pt, fullCycleReviewCount)
  }, [projectType, fullCycleReviewCount])

  // Save chat history before clearing - preserves conversation for story card
  // Preserves sessionId so the next step can reuse the agent session via --resume
  const saveChatHistoryAndClear = useCallback(async (agentId: string, storyId: string) => {
    const cyclePath = cycleProjectPathRef.current
    if (!cyclePath) return

    // Read from the cycle's project (foreground or background)
    const thread = getCycleChatThread(agentId)
    const agent = agents.find(a => a.id === agentId)
    const story = stories.find(s => s.id === storyId)

    // Preserve session ID before clearing so next step can reuse via --resume
    const savedSessionId = thread?.sessionId

    // Save to history if thread has messages
    if (thread && thread.messages.length > 0 && agent) {
      await saveStoryChatHistoryImmediate(
        cyclePath,
        storyId,
        story?.title || storyId,
        agentId,
        agent.name,
        agent.role,
        thread.messages,
        thread.branchName,
        outputFolder
      )
      fcAppendLog(`Saved ${agentId} chat to history`)
    }

    // Clear the thread
    chatClear(agentId)
    // Also clear global handler state for this agent
    clearAgentState(agentId)

    // Restore session ID so next step can use --resume (single process instead of two)
    if (savedSessionId) {
      chatSetSessionId(agentId, savedSessionId)
    }
  }, [outputFolder, agents, stories, getCycleChatThread, chatClear, clearAgentState, fcAppendLog, chatSetSessionId])

  // Execute an agent step - uses global handler for message processing
  const executeAgentStep = useCallback(async (
    agentId: string,
    command: string,
    storyId: string,
    branchName: string,
    runId: string
  ): Promise<'success' | 'error'> => {
    const cyclePath = cycleProjectPathRef.current
    if (!cyclePath) return 'error'

    fcAppendLog(`Sending to ${agentId}: ${command}`)

    // Set context for this agent's thread
    chatSetContext(agentId, storyId, branchName)

    // Get current session (if any) from the cycle's project
    const currentThread = getCycleChatThread(agentId)
    const hasSession = !!currentThread?.sessionId

    // Add user message to the chat thread and persist to JSONL
    const userMsgId = `fullcycle-user-${Date.now()}`
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: command,
      timestamp: Date.now(),
      status: 'complete'
    }
    chatAddMessage(agentId, userMsg)
    window.chatAPI.writeUserMessage(cyclePath, agentId, userMsg)

    // Add assistant placeholder message
    const assistantMsgId = `fullcycle-assistant-${Date.now()}`
    chatAddMessage(agentId, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending'
    })

    // Set typing indicator
    chatSetTyping(agentId, true)

    return new Promise<'success' | 'error'>((resolve) => {
      let resolved = false
      let accumulatedOutput = ''
      let currentSessionId = currentThread?.sessionId || null
      let autoResponseSentAt = 0

      const cleanup = () => {
        unsubExit()
        unsubAgentReady()
        unsubOutput()
        if (cleanupRef.current === cleanup) {
          cleanupRef.current = null
        }
      }

      // Strip ANSI escape codes from text for reliable pattern matching
      const stripAnsi = (text: string): string =>
        text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][\s\S]*?\x07/g, '')

      // Detect BMAD agent menus — these are interactive menus the agent
      // displays (e.g. "[MH] Redisplay Menu", "[DS] Dev Story") that should
      // always be treated as step completion, never auto-responded to.
      const isBmadMenu = (text: string): boolean => {
        const clean = stripAnsi(text.slice(-2000))
        // BMAD menus use [XX] two-letter code format for options
        return /\[[A-Z]{2}\]\s+\S/m.test(clean)
      }

      // Detect if output contains a prompt about an issue/error that needs
      // a fix selection. Only auto-respond to prompts where the agent has
      // encountered a problem and is offering resolution options — NOT to
      // conversational "what should I do next?" or BMAD agent menu prompts.
      const isPromptForInput = (text: string): boolean => {
        const clean = stripAnsi(text.slice(-2000))

        // Never auto-respond to BMAD agent menus
        if (isBmadMenu(clean)) return false

        // Has numbered options: "1." "2." or "[1]" "[2]" style
        const hasNumberedOptions = /(?:^|\n)\s*(?:\d+\.|[\[(]\d+[\])])\s*\S/m.test(clean)
        // Has lettered options: "[a]" "[c]" style (but NOT [XX] BMAD codes)
        const hasLetteredOptions = /[\[(][a-z][\])]\s*\S/i.test(clean)
        if (!hasNumberedOptions && !hasLetteredOptions) return false

        // Only match prompts that indicate an issue/error/conflict needing resolution
        if (/(?:fix|resolve|repair|correct|error|issue|conflict|problem|fail|broken|invalid|mismatch|bug|violation)/i.test(clean)) return true
        if (/(?:how (?:should|do you want) (?:me to|I)|which (?:approach|fix|solution|option))/i.test(clean)) return true
        if (/(?:linting|type|build|test|compilation) (?:error|issue|failure)/i.test(clean)) return true

        return false
      }

      // Detect if output asks about committing
      const isCommitQuestion = (text: string): boolean => {
        const clean = stripAnsi(text.slice(-1500))
        const patterns = [
          /do you want me to commit/i,
          /should I commit/i,
          /want me to commit/i,
          /shall I commit/i,
          /commit these changes\?/i
        ]
        return patterns.some(p => p.test(clean))
      }

      // Detect if first option is a fix/action option (so we auto-respond "1")
      const hasFixAsFirstOption = (text: string): boolean => {
        const clean = stripAnsi(text.slice(-2000))
        // Option 1 contains fix/update/resolve/apply/auto keywords
        return /(?:^|\n)\s*(?:1\.|[\[(]1[\])])\s*[*]*\s*(?:fix|update|resolve|apply|auto|correct|repair)/im.test(clean)
      }

      // Subscribe to semantic text events for pattern detection.
      // Backend handles stream-JSON parsing — we just get clean text.
      const unsubOutput = window.chatAPI.onTextDelta((event) => {
        if (event.agentId !== agentId) return
        if (event.projectPath !== cyclePath) return
        accumulatedOutput = event.fullContent
      })

      // Handle agent ready (for first message — success only)
      // Note: The global handler sends the pending message automatically.
      // Load failures come through onAgentExit with code !== 0.
      const unsubAgentReady = window.chatAPI.onAgentReady((event) => {
        if (event.agentId !== agentId) return
        if (event.projectPath !== cyclePath) return
        if (currentRunIdRef.current !== runId) {
          cleanup()
          resolve('error')
          return
        }

        fcAppendLog(`Agent ${agentId} ready, executing command...`)
        chatSetSessionId(agentId, event.sessionId)
        fcSetSessionId(event.sessionId)
        currentSessionId = event.sessionId
      })

      // Handle agent exit - orchestrator-specific logic for auto-responses
      const unsubExit = window.chatAPI.onAgentExit(async (event) => {
        if (event.agentId !== agentId) return
        if (event.projectPath !== cyclePath) return
        if (resolved) return

        // Update session ID if provided
        if (event.sessionId) {
          currentSessionId = event.sessionId
          chatSetSessionId(agentId, event.sessionId)
          fcSetSessionId(event.sessionId)
        }

        if (currentRunIdRef.current !== runId) {
          resolved = true
          cleanup()
          resolve('error')
          return
        }

        if (event.cancelled) {
          resolved = true
          cleanup()
          fcAppendLog(`${agentId} cancelled`)
          resolve('error')
          return
        }

        if (event.code !== 0 && event.code !== null) {
          resolved = true
          cleanup()
          fcAppendLog(`${agentId} failed with code: ${event.code}`)
          resolve('error')
          return
        }

        // Helper to send an auto-response
        const sendAutoResponse = async (response: string, logMessage: string): Promise<boolean> => {
          fcAppendLog(logMessage)

          // Add auto-response message to chat and persist to JSONL
          const autoResponseMsgId = `fullcycle-auto-${Date.now()}`
          const autoResponseMsg: ChatMessage = {
            id: autoResponseMsgId,
            role: 'user',
            content: response,
            timestamp: Date.now(),
            status: 'complete'
          }
          chatAddMessage(agentId, autoResponseMsg)
          window.chatAPI.writeUserMessage(cyclePath, agentId, autoResponseMsg)

          // Add new assistant placeholder
          const newAssistantMsgId = `fullcycle-assistant-${Date.now()}`
          chatAddMessage(agentId, {
            id: newAssistantMsgId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            status: 'pending'
          })

          // Register new message ID with global handler
          setCurrentMessageId(agentId, newAssistantMsgId)

          // Track that we sent an auto-response (for race condition detection)
          autoResponseSentAt = Date.now()

          // Clear accumulated output for next round
          accumulatedOutput = ''

          // Send the auto-response

          try {
            const result = await window.chatAPI.sendMessage({
              agentId,
              projectPath: cyclePath,
              message: response,
              sessionId: currentSessionId!,
              tool: aiTool,
              model: aiTool === 'claude-code' ? claudeModel : undefined,
              customEndpoint: aiTool === 'custom-endpoint' ? customEndpoint : undefined,
              assistantMsgId: newAssistantMsgId,
            })

            if (!result.success) {
              resolved = true
              cleanup()
              clearAgentState(agentId)
              fcAppendLog(`Failed to send auto-response: ${result.error}`)
              resolve('error')
              return false
            } else {
              fcAppendLog(`Auto-response sent, waiting for agent to complete...`)
              return true
            }
          } catch (err) {
            resolved = true
            cleanup()
            clearAgentState(agentId)
            fcAppendLog(`Failed to send auto-response: ${err}`)
            resolve('error')
            return false
          }
        }

        const cleanOutput = stripAnsi(accumulatedOutput)

        // Check for commit questions - we handle commits directly, so just complete
        if (isCommitQuestion(cleanOutput)) {
          resolved = true
          cleanup()
          fcAppendLog(`${agentId} completed (commit handled by app)`)
          resolve('success')
          return
        }

        // Check for BMAD agent menus — always treat as step completion
        if (isBmadMenu(cleanOutput)) {
          resolved = true
          cleanup()
          fcAppendLog(`${agentId} completed (BMAD menu detected, step done)`)
          resolve('success')
          return
        }

        // Check for "what's next?" type prompts FIRST - agent has completed,
        // just mark done. These take priority over isPromptForInput because
        // the agent is offering follow-up suggestions (often with numbered
        // story options) rather than asking a question that requires input.
        // A review output will naturally contain words like "issue"/"error" in
        // its findings, which would falsely trigger isPromptForInput if checked
        // first — so we must detect navigation prompts before issue prompts.
        const cleanTail = cleanOutput.slice(-1500)
        const isWhatNextPrompt = /What.?s next\??/i.test(cleanTail) ||
          /(?<!what )would you like (?:me to|to)\b/i.test(cleanTail) ||
          /Next Steps:/i.test(cleanTail) ||
          /Which (?:story|stories|task|epic)/i.test(cleanTail) ||
          /Shall I (?:continue|proceed|move on|start)/i.test(cleanTail) ||
          /Ready (?:for|to) (?:\w+ )*next/i.test(cleanTail) ||
          /Where (?:should|shall|do) (?:we|I) go/i.test(cleanTail) ||
          /Enter your choice:/i.test(cleanTail)

        if (isWhatNextPrompt) {
          resolved = true
          cleanup()
          fcAppendLog(`${agentId} completed (step work done, skipping follow-up prompt)`)
          resolve('success')
          return
        }

        // Only after ruling out navigation prompts, check for issue/error
        // prompts where the agent found problems and is offering fix options
        if (isPromptForInput(cleanOutput) && currentSessionId) {
          const label = hasFixAsFirstOption(cleanOutput) ? 'fix option' : 'option 1'
          const sent = await sendAutoResponse('1', `Detected issue prompt, auto-selecting ${label}`)
          if (sent) return // Wait for next exit event
          return // Error already handled
        }

        // Check if output ends with a completion message (not a question/prompt)
        const endsWithCompletion = /(?:ready for commit|story is clean|completed|done|finished|no (?:issues|errors|problems)|all (?:good|set|done))[^?:]*$/i.test(cleanOutput.slice(-500))

        if (endsWithCompletion) {
          resolved = true
          cleanup()
          fcAppendLog(`${agentId} completed successfully`)
          resolve('success')
          return
        }

        // After auto-response, require substantial output before resolving.
        // This prevents a race where the follow-up process exits quickly
        // with minimal output and the step resolves before work is done.
        if (autoResponseSentAt > 0) {
          const outputLen = cleanOutput.trim().length
          if (outputLen < 200) {
            fcAppendLog('Waiting for agent to process auto-response...')
            // Wait for any pending output events to settle
            await new Promise(r => setTimeout(r, 1000))

            // Re-evaluate with fresh accumulated output
            const freshClean = stripAnsi(accumulatedOutput)

            // Check if a new prompt appeared during the wait
            if (isPromptForInput(freshClean) && currentSessionId) {
              const label = hasFixAsFirstOption(freshClean) ? 'fix option' : 'option 1'
              const sent = await sendAutoResponse('1', `Detected prompt after wait, auto-selecting ${label}`)
              if (sent) return
              return
            }

            // Check for completion indicators in fresh output
            const freshTail = freshClean.slice(-500)
            const freshComplete = /(?:ready for commit|story is clean|completed|done|finished|no (?:issues|errors|problems)|all (?:good|set|done))[^?:]*$/i.test(freshTail)
            if (freshComplete) {
              autoResponseSentAt = 0
              resolved = true
              cleanup()
              fcAppendLog(`${agentId} completed successfully after auto-response`)
              resolve('success')
              return
            }

            // Still minimal output - resolve but log the situation
            autoResponseSentAt = 0
            fcAppendLog(`Agent produced minimal output after auto-response (${stripAnsi(accumulatedOutput).trim().length} chars)`)
          }
          autoResponseSentAt = 0
        }

        // No question detected, mark as complete
        resolved = true
        cleanup()
        fcAppendLog(`${agentId} completed successfully`)
        resolve('success')
      })

      cleanupRef.current = cleanup

      // Start the process
      if (!hasSession) {
        // First message - need to load agent first
        fcAppendLog(`Loading ${agentId} agent...`)

        // Register pending message with global handler
        setPendingMessage(agentId, command, assistantMsgId)

        // Pass the resolved agent command from workflow config
        const agentDef = agents.find(a => a.id === agentId)
        const agentCommand = agentDef?.commands?.[0]

        window.chatAPI.loadAgent({
          agentId,
          projectPath: cyclePath,
          projectType: projectType || 'bmm',
          tool: aiTool,
          model: aiTool === 'claude-code' ? claudeModel : undefined,
          customEndpoint: aiTool === 'custom-endpoint' ? customEndpoint : undefined,
          agentCommand
        }).catch((err) => {
          if (!resolved) {
            resolved = true
            cleanup()
            chatSetTyping(agentId, false)
            clearAgentState(agentId)
            fcAppendLog(`Failed to load agent: ${err}`)
            resolve('error')
          }
        })
      } else {
        // Have session - send message directly
        fcAppendLog(`Using existing session, executing command...`)

        // Register message ID with global handler for streaming
        setCurrentMessageId(agentId, assistantMsgId)

        window.chatAPI.sendMessage({
          agentId,
          projectPath: cyclePath,
          message: command,
          sessionId: currentThread!.sessionId,
          tool: aiTool,
          model: aiTool === 'claude-code' ? claudeModel : undefined,
          customEndpoint: aiTool === 'custom-endpoint' ? customEndpoint : undefined,
          assistantMsgId,
        }).catch((err) => {
          if (!resolved) {
            resolved = true
            cleanup()
            chatSetTyping(agentId, false)
            clearAgentState(agentId)
            fcAppendLog(`Failed to send: ${err}`)
            resolve('error')
          }
        })
      }
    })
  }, [
    projectType,
    aiTool,
    claudeModel,
    fcAppendLog,
    chatAddMessage,
    chatSetTyping,
    chatSetContext,
    chatSetSessionId,
    fcSetSessionId,
    setPendingMessage,
    setCurrentMessageId,
    clearAgentState,
    getCycleChatThread,
  ])

  // Execute a single step
  const executeStep = useCallback(async (stepIndex: number, runId: string, storyId: string): Promise<'success' | 'skipped' | 'error'> => {
    const cyclePath = cycleProjectPathRef.current
    if (!cyclePath) return 'error'
    if (currentRunIdRef.current !== runId) return 'error'

    const steps = getSteps()
    const step = steps[stepIndex]
    const story = stories.find((s) => s.id === storyId)
    if (!step || !story) return 'error'

    const branchName = story.id

    fcAppendLog(`\n--- Step ${stepIndex + 1}/${steps.length}: ${step.name} ---`)
    fcUpdateStep(stepIndex, step.name, step.type)

    try {
      switch (step.type) {
        case 'agent': {
          // Skip create-story if file already exists
          if (step.id === 'create-story' && story.filePath) {
            fcAppendLog('Story file already exists, skipping creation')
            return 'skipped'
          }

          // Skip implementation if story is already past ready-for-dev
          if (step.id === 'implement') {
            const skipStatuses = ['in-progress', 'review', 'human-review']
            if (skipStatuses.includes(story.status)) {
              fcAppendLog(`Story is in ${story.status}, skipping implementation`)
              return 'skipped'
            }
          }

          const agentId = step.agentId!

          // Save chat history and clear thread before each agent step for fresh LLM context
          await saveChatHistoryAndClear(agentId, story.id)

          const command = transformCommand(step.command!, aiTool)
          const fullCommand = `${command} ${story.id}`

          const result = await executeAgentStep(agentId, fullCommand, story.id, branchName, runId)
          return result === 'success' ? 'success' : 'error'
        }

        case 'git': {
          if (step.gitAction === 'create-branch') {
            // Skip branch creation when git branching is disabled
            if (disableGitBranching) {
              fcAppendLog('Git branching disabled, skipping branch creation')
              return 'skipped'
            }

            fcAppendLog(`Creating branch: ${branchName}`)

            const fromBranch = enableEpicBranches ? undefined : baseBranch
            const result = await window.gitAPI.createBranch(cyclePath, branchName, fromBranch)

            if (currentRunIdRef.current !== runId) return 'error'

            if (result.alreadyExists) {
              fcAppendLog(`Branch ${branchName} already exists, checking out`)
              const checkoutResult = await window.gitAPI.checkoutBranch(cyclePath, branchName)
              if (!checkoutResult.success) {
                fcAppendLog(`Failed to checkout: ${checkoutResult.error}`)
                return 'error'
              }
            } else if (!result.success) {
              fcAppendLog(`Failed to create branch: ${result.error}`)
              return 'error'
            }

            setCurrentBranch(branchName)
            fcAppendLog('Branch ready')
            return 'success'
          }

          if (step.gitAction === 'commit') {
            // Small delay to ensure filesystem has synced
            await new Promise(r => setTimeout(r, 200))

            const commitType = step.commitMessage?.startsWith('fix') ? 'fix' : step.commitMessage?.startsWith('docs') ? 'docs' : 'feat'
            const message = `${commitType}(${branchName}): ${step.commitMessage?.replace(/^(fix|docs|feat): /, '') || 'update'}`

            fcAppendLog(`Committing: ${message}`)
            // Attempt commit directly - git add . forces content check, avoiding
            // racy git issues where stat cache misses recent writes
            const result = await window.gitAPI.commit(cyclePath, message, true)

            if (currentRunIdRef.current !== runId) return 'error'

            if (!result.success) {
              if (result.error?.includes('Nothing to commit') || result.error?.includes('nothing to commit')) {
                fcAppendLog('No changes to commit, skipping')
                return 'skipped'
              }
              fcAppendLog(`Failed to commit: ${result.error}`)
              return 'error'
            }

            setHasUncommittedChanges(false)
            fcAppendLog('Committed successfully')
            return 'success'
          }

          if (step.gitAction === 'merge') {
            // Skip merge when git branching is disabled (already on base branch)
            if (disableGitBranching) {
              fcAppendLog('Git branching disabled, skipping merge')
              return 'skipped'
            }

            await new Promise(r => setTimeout(r, 200))
            const preCheckChanges = await window.gitAPI.hasChanges(cyclePath)
            if (currentRunIdRef.current !== runId) return 'error'

            if (preCheckChanges.hasChanges) {
              fcAppendLog('Found uncommitted changes, committing before merge...')
              const safetyCommit = await window.gitAPI.commit(
                cyclePath,
                `chore(${branchName}): auto-commit before merge`,
                true
              )
              if (!safetyCommit.success) {
                fcAppendLog(`Failed to commit changes: ${safetyCommit.error}`)
                return 'error'
              }
              setHasUncommittedChanges(false)
            }

            fcAppendLog(`Checking out ${baseBranch}...`)
            const checkoutResult = await window.gitAPI.checkoutBranch(cyclePath, baseBranch)
            if (currentRunIdRef.current !== runId) return 'error'

            if (!checkoutResult.success) {
              fcAppendLog(`Failed to checkout ${baseBranch}: ${checkoutResult.error}`)
              return 'error'
            }

            setCurrentBranch(baseBranch)

            fcAppendLog(`Merging ${branchName} into ${baseBranch}...`)
            const mergeResult = await window.gitAPI.mergeBranch(cyclePath, branchName)
            if (currentRunIdRef.current !== runId) return 'error'

            if (!mergeResult.success) {
              if (mergeResult.hasConflicts) {
                fcAppendLog(`Merge conflicts detected - manual resolution required`)
              } else {
                fcAppendLog(`Failed to merge: ${mergeResult.error}`)
              }
              return 'error'
            }

            fcAppendLog(`Successfully merged ${branchName} into ${baseBranch}`)
            return 'success'
          }

          return 'success'
        }

        case 'status': {
          if (story.filePath) {
            fcAppendLog('Updating story status to done')
            const result = await window.fileAPI.updateStoryStatus(story.filePath, 'done')

            if (currentRunIdRef.current !== runId) return 'error'

            if (!result.success) {
              fcAppendLog(`Failed to update status: ${result.error}`)
              return 'error'
            }
            fcAppendLog('Story marked as done')
          } else {
            fcAppendLog('No story file to update status')
          }
          return 'success'
        }

        default:
          return 'success'
      }
    } catch (error) {
      fcAppendLog(`Error: ${error}`)
      return 'error'
    }
  }, [
    stories,
    aiTool,
    baseBranch,
    enableEpicBranches,
    disableGitBranching,
    getSteps,
    executeAgentStep,
    fcAppendLog,
    fcUpdateStep,
    setCurrentBranch,
    setHasUncommittedChanges,
    saveChatHistoryAndClear
  ])

  // Run all steps sequentially
  const runAllSteps = useCallback(async (runId: string, storyId: string, startFromStep: number, stepStatuses: string[]) => {
    const steps = getSteps()

    for (let i = startFromStep; i < steps.length; i++) {
      if (currentRunIdRef.current !== runId) return

      if (stepStatuses[i] === 'completed' || stepStatuses[i] === 'skipped') {
        fcAppendLog(`Skipping ${steps[i]?.name} (already ${stepStatuses[i]})`)
        continue
      }

      const result = await executeStep(i, runId, storyId)

      if (currentRunIdRef.current !== runId) return

      if (result === 'error') {
        fcSetError(`Step "${steps[i]?.name}" failed`)
        return
      } else if (result === 'skipped') {
        fcSkip(i)
      } else {
        fcAdvance()
      }
    }

    if (currentRunIdRef.current === runId) {
      fcAppendLog('\n=== Full cycle complete! ===')
      fcComplete()
    }
  }, [getSteps, executeStep, fcSkip, fcAdvance, fcSetError, fcAppendLog, fcComplete])

  // Watch for new full cycle runs to start (or retry)
  useEffect(() => {
    if (!fullCycle.isRunning) return
    if (fullCycle.error) return
    if (!fullCycle.storyId) return
    if (isProcessingRef.current) return
    // Prevent full cycle in read-only mode
    if (useStore.getState().isReadOnly()) {
      fcSetError('Cannot run full cycle in read-only mode')
      return
    }

    // Capture the project path for this cycle — all state updates and IPC calls
    // will use this path, even if the user switches to a different project.
    cycleProjectPathRef.current = useStore.getState().projectPath

    currentRunIdRef.current = `${fullCycle.storyId}-${Date.now()}`
    isProcessingRef.current = true
    const runId = currentRunIdRef.current
    const storyId = fullCycle.storyId
    const startFromStep = fullCycle.currentStep
    const stepStatuses = [...fullCycle.stepStatuses]

    runAllSteps(runId, storyId, startFromStep, stepStatuses).finally(() => {
      isProcessingRef.current = false
    })
  }, [fullCycle.isRunning, fullCycle.currentStep, fullCycle.error, fullCycle.storyId, fullCycle.stepStatuses, runAllSteps, fcSetError])

  // Reset run ID when cycle completes or is cancelled
  useEffect(() => {
    if (!fullCycle.isRunning) {
      currentRunIdRef.current = null
      cycleProjectPathRef.current = null
    }
  }, [fullCycle.isRunning])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
      }
    }
  }, [])

  return null
}
