import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../../store'
import { useWorkflow } from '../../hooks/useWorkflow'
import { useChatMessageHandlerContext } from '../../hooks/useChatMessageHandler'
import { saveStoryChatHistoryImmediate } from '../../utils/chatUtils'
import { buildFullCycleSteps, FullCycleStep } from '../../types/fullCycle'
import { transformCommand } from '../../utils/commandTransform'

/**
 * FullCycleOrchestrator - Runs the full cycle automation in the background
 *
 * This component should be mounted at the App level so it persists
 * even when the FullCycleDialog is closed. It orchestrates the steps
 * and sends commands to the chat agents in the sidebar.
 *
 * Message handling is delegated to the GlobalChatHandler. This component
 * only handles orchestration logic like detecting questions and auto-responding.
 */
export default function FullCycleOrchestrator() {
  const projectPath = useStore((state) => state.projectPath)
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

  // Chat state (use useStore.getState() for chatThreads to get latest after clear)
  const addChatMessage = useStore((state) => state.addChatMessage)
  const setChatTyping = useStore((state) => state.setChatTyping)
  const setThreadContext = useStore((state) => state.setThreadContext)
  const setChatSessionId = useStore((state) => state.setChatSessionId)
  const clearChatThread = useStore((state) => state.clearChatThread)

  // Full cycle state
  const fullCycle = useStore((state) => state.fullCycle)
  const updateFullCycleStep = useStore((state) => state.updateFullCycleStep)
  const appendFullCycleLog = useStore((state) => state.appendFullCycleLog)
  const setFullCycleError = useStore((state) => state.setFullCycleError)
  const completeFullCycle = useStore((state) => state.completeFullCycle)
  const setFullCycleSessionId = useStore((state) => state.setFullCycleSessionId)
  const skipFullCycleStep = useStore((state) => state.skipFullCycleStep)
  const advanceFullCycleStep = useStore((state) => state.advanceFullCycleStep)

  // Get global handler context for registering message IDs
  const { setPendingMessage, setCurrentMessageId, clearAgentState } = useChatMessageHandlerContext()

  // Track the current run
  const currentRunIdRef = useRef<string | null>(null)
  const isProcessingRef = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Get steps based on project type and review count
  const getSteps = useCallback((): FullCycleStep[] => {
    return buildFullCycleSteps(projectType || 'bmm', fullCycleReviewCount)
  }, [projectType, fullCycleReviewCount])

  // Save chat history before clearing - preserves conversation for story card
  const saveChatHistoryAndClear = useCallback(async (agentId: string, storyId: string) => {
    if (!projectPath) return

    // Read directly from store to get latest state
    const thread = useStore.getState().chatThreads[agentId]
    const agent = agents.find(a => a.id === agentId)
    const story = stories.find(s => s.id === storyId)

    // Save to history if thread has messages
    if (thread && thread.messages.length > 0 && agent) {
      await saveStoryChatHistoryImmediate(
        projectPath,
        storyId,
        story?.title || storyId,
        agentId,
        agent.name,
        agent.role,
        thread.messages,
        thread.branchName,
        outputFolder
      )
      appendFullCycleLog(`Saved ${agentId} chat to history`)
    }

    // Clear the thread
    clearChatThread(agentId)
    // Also clear global handler state for this agent
    clearAgentState(agentId)
  }, [projectPath, outputFolder, agents, stories, clearChatThread, clearAgentState, appendFullCycleLog])

  // Execute an agent step - uses global handler for message processing
  const executeAgentStep = useCallback(async (
    agentId: string,
    command: string,
    storyId: string,
    branchName: string,
    runId: string
  ): Promise<'success' | 'error'> => {
    if (!projectPath) return 'error'

    appendFullCycleLog(`Sending to ${agentId}: ${command}`)

    // Set context for this agent's thread
    setThreadContext(agentId, storyId, branchName)

    // Get current session (if any) - read directly from store to get latest state after clear
    const currentThread = useStore.getState().chatThreads[agentId]
    const hasSession = !!currentThread?.sessionId

    // Add user message to the chat thread
    const userMsgId = `fullcycle-user-${Date.now()}`
    addChatMessage(agentId, {
      id: userMsgId,
      role: 'user',
      content: command,
      timestamp: Date.now(),
      status: 'complete'
    })

    // Add assistant placeholder message
    const assistantMsgId = `fullcycle-assistant-${Date.now()}`
    addChatMessage(agentId, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending'
    })

    // Set typing indicator
    setChatTyping(agentId, true)

    return new Promise<'success' | 'error'>((resolve) => {
      let resolved = false
      let accumulatedOutput = ''
      let currentSessionId = currentThread?.sessionId || null
      let autoResponseSentAt = 0

      const cleanup = () => {
        unsubExit()
        unsubAgentLoaded()
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

      // Subscribe to output for accumulating TEXT content for pattern detection.
      // Raw chunks are stream-json (newlines escaped as \n), so we must parse
      // the JSON and extract actual text — otherwise regexes can't match.
      const unsubOutput = window.chatAPI.onChatOutput((event) => {
        if (event.agentId !== agentId) return
        if (event.isAgentLoad) return
        if (!event.chunk) return

        const lines = event.chunk.split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line)
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              accumulatedOutput += parsed.delta.text
            } else if (parsed.type === 'assistant' && parsed.message?.content) {
              for (const block of parsed.message.content) {
                if (block.type === 'text' && block.text) {
                  accumulatedOutput += block.text
                }
              }
            } else if (parsed.type === 'result' && parsed.result) {
              // Result is the definitive complete response — overwrite
              accumulatedOutput = parsed.result
            }
          } catch {
            // Not valid JSON line — accumulate raw as fallback
            accumulatedOutput += line
          }
        }
      })

      // Handle agent loaded (for first message)
      // Note: The global handler sends the pending message automatically.
      // This handler just logs status and handles failures.
      const unsubAgentLoaded = window.chatAPI.onAgentLoaded(async (event) => {
        if (event.agentId !== agentId) return
        if (currentRunIdRef.current !== runId) {
          cleanup()
          resolve('error')
          return
        }

        if (event.code === 0 && event.sessionId) {
          // Agent loaded successfully - global handler will send the pending message
          appendFullCycleLog(`Agent ${agentId} ready, executing command...`)
          setChatSessionId(agentId, event.sessionId)
          setFullCycleSessionId(event.sessionId)
          currentSessionId = event.sessionId
          // The global handler's onAgentLoaded sends the pending message
        } else if (event.code !== 0) {
          // Agent load failed
          resolved = true
          cleanup()
          setChatTyping(agentId, false)
          clearAgentState(agentId)
          appendFullCycleLog(`Agent load failed: ${event.error}`)
          resolve('error')
        }
      })

      // Handle process exit - orchestrator-specific logic for auto-responses
      const unsubExit = window.chatAPI.onChatExit(async (event) => {
        if (event.agentId !== agentId) return
        if (resolved) return

        // Update session ID if provided
        if (event.sessionId) {
          currentSessionId = event.sessionId
          setChatSessionId(agentId, event.sessionId)
          setFullCycleSessionId(event.sessionId)
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
          appendFullCycleLog(`${agentId} cancelled`)
          resolve('error')
          return
        }

        if (event.code !== 0 && event.code !== null) {
          resolved = true
          cleanup()
          appendFullCycleLog(`${agentId} failed with code: ${event.code}`)
          resolve('error')
          return
        }

        // Helper to send an auto-response
        const sendAutoResponse = async (response: string, logMessage: string): Promise<boolean> => {
          appendFullCycleLog(logMessage)

          // Add auto-response message to chat
          const autoResponseMsgId = `fullcycle-auto-${Date.now()}`
          addChatMessage(agentId, {
            id: autoResponseMsgId,
            role: 'user',
            content: response,
            timestamp: Date.now(),
            status: 'complete'
          })

          // Add new assistant placeholder
          const newAssistantMsgId = `fullcycle-assistant-${Date.now()}`
          addChatMessage(agentId, {
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
          await new Promise(r => setTimeout(r, 150))

          try {
            const result = await window.chatAPI.sendMessage({
              agentId,
              projectPath,
              message: response,
              sessionId: currentSessionId!,
              tool: aiTool,
              model: aiTool === 'claude-code' ? claudeModel : undefined,
              customEndpoint: aiTool === 'custom-endpoint' ? customEndpoint : undefined
            })

            if (!result.success) {
              resolved = true
              cleanup()
              clearAgentState(agentId)
              appendFullCycleLog(`Failed to send auto-response: ${result.error}`)
              resolve('error')
              return false
            } else {
              appendFullCycleLog(`Auto-response sent, waiting for agent to complete...`)
              return true
            }
          } catch (err) {
            resolved = true
            cleanup()
            clearAgentState(agentId)
            appendFullCycleLog(`Failed to send auto-response: ${err}`)
            resolve('error')
            return false
          }
        }

        const cleanOutput = stripAnsi(accumulatedOutput)

        // Check for commit questions - we handle commits directly, so just complete
        if (isCommitQuestion(cleanOutput)) {
          resolved = true
          cleanup()
          appendFullCycleLog(`${agentId} completed (commit handled by app)`)
          resolve('success')
          return
        }

        // Check for BMAD agent menus — always treat as step completion
        if (isBmadMenu(cleanOutput)) {
          resolved = true
          cleanup()
          appendFullCycleLog(`${agentId} completed (BMAD menu detected, step done)`)
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
          appendFullCycleLog(`${agentId} completed (step work done, skipping follow-up prompt)`)
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
          appendFullCycleLog(`${agentId} completed successfully`)
          resolve('success')
          return
        }

        // After auto-response, require substantial output before resolving.
        // This prevents a race where the follow-up process exits quickly
        // with minimal output and the step resolves before work is done.
        if (autoResponseSentAt > 0) {
          const outputLen = cleanOutput.trim().length
          if (outputLen < 200) {
            appendFullCycleLog('Waiting for agent to process auto-response...')
            // Wait for any pending output events to settle
            await new Promise(r => setTimeout(r, 3000))

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
              appendFullCycleLog(`${agentId} completed successfully after auto-response`)
              resolve('success')
              return
            }

            // Still minimal output - resolve but log the situation
            autoResponseSentAt = 0
            appendFullCycleLog(`Agent produced minimal output after auto-response (${stripAnsi(accumulatedOutput).trim().length} chars)`)
          }
          autoResponseSentAt = 0
        }

        // No question detected, mark as complete
        resolved = true
        cleanup()
        appendFullCycleLog(`${agentId} completed successfully`)
        resolve('success')
      })

      cleanupRef.current = cleanup

      // Start the process
      if (!hasSession) {
        // First message - need to load agent first
        appendFullCycleLog(`Loading ${agentId} agent...`)

        // Register pending message with global handler
        setPendingMessage(agentId, command, assistantMsgId)

        // Pass the resolved agent command from workflow config
        const agentDef = agents.find(a => a.id === agentId)
        const agentCommand = agentDef?.commands?.[0]

        window.chatAPI.loadAgent({
          agentId,
          projectPath,
          projectType: projectType || 'bmm',
          tool: aiTool,
          model: aiTool === 'claude-code' ? claudeModel : undefined,
          customEndpoint: aiTool === 'custom-endpoint' ? customEndpoint : undefined,
          agentCommand
        }).catch((err) => {
          if (!resolved) {
            resolved = true
            cleanup()
            setChatTyping(agentId, false)
            clearAgentState(agentId)
            appendFullCycleLog(`Failed to load agent: ${err}`)
            resolve('error')
          }
        })
      } else {
        // Have session - send message directly
        appendFullCycleLog(`Using existing session, executing command...`)

        // Register message ID with global handler for streaming
        setCurrentMessageId(agentId, assistantMsgId)

        window.chatAPI.sendMessage({
          agentId,
          projectPath,
          message: command,
          sessionId: currentThread.sessionId,
          tool: aiTool,
          model: aiTool === 'claude-code' ? claudeModel : undefined,
          customEndpoint: aiTool === 'custom-endpoint' ? customEndpoint : undefined
        }).catch((err) => {
          if (!resolved) {
            resolved = true
            cleanup()
            setChatTyping(agentId, false)
            clearAgentState(agentId)
            appendFullCycleLog(`Failed to send: ${err}`)
            resolve('error')
          }
        })
      }
    })
  }, [
    projectPath,
    projectType,
    aiTool,
    claudeModel,
    appendFullCycleLog,
    addChatMessage,
    setChatTyping,
    setThreadContext,
    setChatSessionId,
    setFullCycleSessionId,
    setPendingMessage,
    setCurrentMessageId,
    clearAgentState
  ])

  // Execute a single step
  const executeStep = useCallback(async (stepIndex: number, runId: string, storyId: string): Promise<'success' | 'skipped' | 'error'> => {
    if (!projectPath) return 'error'
    if (currentRunIdRef.current !== runId) return 'error'

    const steps = getSteps()
    const step = steps[stepIndex]
    const story = stories.find((s) => s.id === storyId)
    if (!step || !story) return 'error'

    const branchName = story.id

    appendFullCycleLog(`\n--- Step ${stepIndex + 1}/${steps.length}: ${step.name} ---`)
    updateFullCycleStep(stepIndex, step.name, step.type)

    try {
      switch (step.type) {
        case 'agent': {
          // Skip create-story if file already exists
          if (step.id === 'create-story' && story.filePath) {
            appendFullCycleLog('Story file already exists, skipping creation')
            return 'skipped'
          }

          // Skip implementation if story is already past ready-for-dev
          if (step.id === 'implement') {
            const skipStatuses = ['in-progress', 'review', 'human-review']
            if (skipStatuses.includes(story.status)) {
              appendFullCycleLog(`Story is in ${story.status}, skipping implementation`)
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
              appendFullCycleLog('Git branching disabled, skipping branch creation')
              return 'skipped'
            }

            appendFullCycleLog(`Creating branch: ${branchName}`)

            const fromBranch = enableEpicBranches ? undefined : baseBranch
            const result = await window.gitAPI.createBranch(projectPath, branchName, fromBranch)

            if (currentRunIdRef.current !== runId) return 'error'

            if (result.alreadyExists) {
              appendFullCycleLog(`Branch ${branchName} already exists, checking out`)
              const checkoutResult = await window.gitAPI.checkoutBranch(projectPath, branchName)
              if (!checkoutResult.success) {
                appendFullCycleLog(`Failed to checkout: ${checkoutResult.error}`)
                return 'error'
              }
            } else if (!result.success) {
              appendFullCycleLog(`Failed to create branch: ${result.error}`)
              return 'error'
            }

            setCurrentBranch(branchName)
            appendFullCycleLog('Branch ready')
            return 'success'
          }

          if (step.gitAction === 'commit') {
            // Small delay to ensure filesystem has synced
            await new Promise(r => setTimeout(r, 500))

            const commitType = step.commitMessage?.startsWith('fix') ? 'fix' : step.commitMessage?.startsWith('docs') ? 'docs' : 'feat'
            const message = `${commitType}(${branchName}): ${step.commitMessage?.replace(/^(fix|docs|feat): /, '') || 'update'}`

            appendFullCycleLog(`Committing: ${message}`)
            // Attempt commit directly - git add . forces content check, avoiding
            // racy git issues where stat cache misses recent writes
            const result = await window.gitAPI.commit(projectPath, message, true)

            if (currentRunIdRef.current !== runId) return 'error'

            if (!result.success) {
              if (result.error?.includes('Nothing to commit') || result.error?.includes('nothing to commit')) {
                appendFullCycleLog('No changes to commit, skipping')
                return 'skipped'
              }
              appendFullCycleLog(`Failed to commit: ${result.error}`)
              return 'error'
            }

            setHasUncommittedChanges(false)
            appendFullCycleLog('Committed successfully')
            return 'success'
          }

          if (step.gitAction === 'merge') {
            // Skip merge when git branching is disabled (already on base branch)
            if (disableGitBranching) {
              appendFullCycleLog('Git branching disabled, skipping merge')
              return 'skipped'
            }

            await new Promise(r => setTimeout(r, 500))
            const preCheckChanges = await window.gitAPI.hasChanges(projectPath)
            if (currentRunIdRef.current !== runId) return 'error'

            if (preCheckChanges.hasChanges) {
              appendFullCycleLog('Found uncommitted changes, committing before merge...')
              const safetyCommit = await window.gitAPI.commit(
                projectPath,
                `chore(${branchName}): auto-commit before merge`,
                true
              )
              if (!safetyCommit.success) {
                appendFullCycleLog(`Failed to commit changes: ${safetyCommit.error}`)
                return 'error'
              }
              setHasUncommittedChanges(false)
            }

            appendFullCycleLog(`Checking out ${baseBranch}...`)
            const checkoutResult = await window.gitAPI.checkoutBranch(projectPath, baseBranch)
            if (currentRunIdRef.current !== runId) return 'error'

            if (!checkoutResult.success) {
              appendFullCycleLog(`Failed to checkout ${baseBranch}: ${checkoutResult.error}`)
              return 'error'
            }

            setCurrentBranch(baseBranch)

            appendFullCycleLog(`Merging ${branchName} into ${baseBranch}...`)
            const mergeResult = await window.gitAPI.mergeBranch(projectPath, branchName)
            if (currentRunIdRef.current !== runId) return 'error'

            if (!mergeResult.success) {
              if (mergeResult.hasConflicts) {
                appendFullCycleLog(`Merge conflicts detected - manual resolution required`)
              } else {
                appendFullCycleLog(`Failed to merge: ${mergeResult.error}`)
              }
              return 'error'
            }

            appendFullCycleLog(`Successfully merged ${branchName} into ${baseBranch}`)
            return 'success'
          }

          return 'success'
        }

        case 'status': {
          if (story.filePath) {
            appendFullCycleLog('Updating story status to done')
            const result = await window.fileAPI.updateStoryStatus(story.filePath, 'done')

            if (currentRunIdRef.current !== runId) return 'error'

            if (!result.success) {
              appendFullCycleLog(`Failed to update status: ${result.error}`)
              return 'error'
            }
            appendFullCycleLog('Story marked as done')
          } else {
            appendFullCycleLog('No story file to update status')
          }
          return 'success'
        }

        default:
          return 'success'
      }
    } catch (error) {
      appendFullCycleLog(`Error: ${error}`)
      return 'error'
    }
  }, [
    projectPath,
    stories,
    aiTool,
    baseBranch,
    enableEpicBranches,
    disableGitBranching,
    getSteps,
    executeAgentStep,
    appendFullCycleLog,
    updateFullCycleStep,
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
        appendFullCycleLog(`Skipping ${steps[i]?.name} (already ${stepStatuses[i]})`)
        continue
      }

      const result = await executeStep(i, runId, storyId)

      if (currentRunIdRef.current !== runId) return

      if (result === 'error') {
        setFullCycleError(`Step "${steps[i]?.name}" failed`)
        return
      } else if (result === 'skipped') {
        skipFullCycleStep(i)
      } else {
        advanceFullCycleStep()
      }
    }

    if (currentRunIdRef.current === runId) {
      appendFullCycleLog('\n=== Full cycle complete! ===')
      completeFullCycle()
    }
  }, [getSteps, executeStep, skipFullCycleStep, advanceFullCycleStep, setFullCycleError, appendFullCycleLog, completeFullCycle])

  // Watch for new full cycle runs to start (or retry)
  useEffect(() => {
    if (!fullCycle.isRunning) return
    if (fullCycle.error) return
    if (!fullCycle.storyId) return
    if (isProcessingRef.current) return

    currentRunIdRef.current = `${fullCycle.storyId}-${Date.now()}`
    isProcessingRef.current = true
    const runId = currentRunIdRef.current
    const storyId = fullCycle.storyId
    const startFromStep = fullCycle.currentStep
    const stepStatuses = [...fullCycle.stepStatuses]

    runAllSteps(runId, storyId, startFromStep, stepStatuses).finally(() => {
      isProcessingRef.current = false
    })
  }, [fullCycle.isRunning, fullCycle.currentStep, fullCycle.error, fullCycle.storyId, fullCycle.stepStatuses, runAllSteps])

  // Reset run ID when cycle completes or is cancelled
  useEffect(() => {
    if (!fullCycle.isRunning) {
      currentRunIdRef.current = null
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
