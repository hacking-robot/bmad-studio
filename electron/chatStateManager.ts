import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import { createHash } from 'crypto'
import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync } from 'fs'

// Types matching the renderer-side ChatMessage and AgentThread shapes
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status: 'pending' | 'streaming' | 'complete' | 'error'
  stats?: LLMStats
  toolCalls?: ToolCall[]
}

export interface LLMStats {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalCostUsd?: number
  durationMs?: number
  apiDurationMs?: number
}

export interface ToolCall {
  name: string
  summary: string
  input?: Record<string, unknown>
}

export interface ThreadMetadata {
  sessionId: string | null
  storyId: string | null
  branchName: string | null
  lastActivity: number
}

export interface ManagedThread {
  agentId: string
  projectPath: string
  sessionId: string | null
  isTyping: boolean
  isInitialized: boolean
  storyId: string | null
  branchName: string | null
  lastActivity: number
  // Stream parsing state
  currentMessageId: string | null
  currentMessage: ChatMessage | null
  streamBuffer: string
  messageCompleted: boolean
  toolUsed: boolean
  pendingMessage: { content: string; assistantMsgId: string } | null
  isLoadingAgent: boolean
}

// Semantic events emitted to the renderer
export interface ChatTextDeltaEvent {
  projectPath: string
  agentId: string
  messageId: string
  text: string
  fullContent: string
}

export interface ChatToolUseEvent {
  projectPath: string
  agentId: string
  messageId: string
  toolName: string
  toolSummary: string
  toolInput?: Record<string, unknown>
}

export interface ChatMessageCompleteEvent {
  projectPath: string
  agentId: string
  messageId: string
  stats?: LLMStats
  cost?: number
}

export interface ChatAgentReadyEvent {
  projectPath: string
  agentId: string
  sessionId: string
}

export interface ChatAgentExitEvent {
  projectPath: string
  agentId: string
  sessionId?: string
  code: number | null
  cancelled: boolean
  error?: string
}

export interface ChatTypingEvent {
  projectPath: string
  agentId: string
  isTyping: boolean
}

export interface ChatActivityEvent {
  projectPath: string
  agentId: string
  activity: string | null
}

export interface ChatWizardStepEvent {
  stepNumber: number
}

// Map Claude tool names to human-readable activity descriptions
function getToolActivity(toolName: string, input?: Record<string, unknown>): string {
  const toolMap: Record<string, (input?: Record<string, unknown>) => string> = {
    Read: (i) => i?.file_path ? `Reading ${(i.file_path as string).split('/').pop()}` : 'Reading file',
    Edit: (i) => i?.file_path ? `Editing ${(i.file_path as string).split('/').pop()}` : 'Editing file',
    Write: (i) => i?.file_path ? `Writing ${(i.file_path as string).split('/').pop()}` : 'Writing file',
    Glob: () => 'Searching for files',
    Grep: (i) => i?.pattern ? `Searching for "${i.pattern}"` : 'Searching code',
    Bash: (i) => i?.command ? `Running: ${(i.command as string).split(' ')[0]}` : 'Running command',
    Task: () => 'Launching subagent',
    WebFetch: () => 'Fetching web content',
    WebSearch: (i) => i?.query ? `Searching: "${i.query}"` : 'Searching web',
    TodoWrite: () => 'Updating task list',
    NotebookEdit: () => 'Editing notebook',
    AskUserQuestion: () => 'Preparing question',
    EnterPlanMode: () => 'Planning approach',
    ExitPlanMode: () => 'Finalizing plan',
  }
  const formatter = toolMap[toolName]
  if (formatter) return formatter(input)
  if (toolName.startsWith('mcp__')) return 'Using MCP tool'
  return `Using ${toolName}`
}

// --- JSONL disk path helpers ---

function hashProjectPath(projectPath: string): string {
  return createHash('md5').update(projectPath).digest('hex').slice(0, 12)
}

function getChatThreadsDir(projectPath: string): string {
  return join(app.getPath('userData'), 'chat-threads', hashProjectPath(projectPath))
}

function getJsonlPath(projectPath: string, agentId: string): string {
  return join(getChatThreadsDir(projectPath), `${agentId}.jsonl`)
}

function getMetaPath(projectPath: string, agentId: string): string {
  return join(getChatThreadsDir(projectPath), `${agentId}.meta.json`)
}

function getOldJsonPath(projectPath: string, agentId: string): string {
  return join(getChatThreadsDir(projectPath), `${agentId}.json`)
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

class ChatStateManager {
  private threads: Map<string, ManagedThread> = new Map()
  private mainWindow: BrowserWindow | null = null

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  private sendToRenderer(channel: string, data: unknown) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    } else {
      console.warn('[ChatStateManager] Cannot send to renderer — mainWindow is', this.mainWindow ? 'destroyed' : 'null', 'channel:', channel)
    }
  }

  private threadKey(projectPath: string, agentId: string): string {
    return `${projectPath}::${agentId}`
  }

  private getOrCreateThread(projectPath: string, agentId: string): ManagedThread {
    const key = this.threadKey(projectPath, agentId)
    let thread = this.threads.get(key)
    if (!thread) {
      thread = {
        agentId,
        projectPath,
        sessionId: null,
        isTyping: false,
        isInitialized: false,
        storyId: null,
        branchName: null,
        lastActivity: Date.now(),
        currentMessageId: null,
        currentMessage: null,
        streamBuffer: '',
        messageCompleted: false,
        toolUsed: false,
        pendingMessage: null,
        isLoadingAgent: false,
      }
      this.threads.set(key, thread)
    }
    return thread
  }

  // Persist the in-flight message (if it has content) and start a new one
  private rotateCurrentMessage(thread: ManagedThread): string {
    if (thread.currentMessage && thread.currentMessage.content) {
      thread.currentMessage.status = 'complete'
      this.appendMessage(thread.projectPath, thread.agentId, thread.currentMessage)
    }
    const id = `msg-${Date.now()}`
    thread.currentMessageId = id
    thread.currentMessage = {
      id,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    }
    thread.streamBuffer = ''
    thread.messageCompleted = false
    thread.toolUsed = false
    return id
  }

  // Process content blocks from a complete assistant message.
  // When forceProcess is true, text blocks are always emitted (used for --resume replay recovery).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processAssistantContent(thread: ManagedThread, projectPath: string, agentId: string, parsed: any, forceProcess: boolean = false) {
    if (!parsed.message?.content) return

    const alreadyStreamed = !forceProcess && !!thread.streamBuffer
    console.log('[ChatStateManager] assistant message:', { agentId, alreadyStreamed, bufferLen: thread.streamBuffer.length, blocks: parsed.message.content.length, msgId: thread.currentMessageId })

    // First pass: text blocks — only emit if we haven't streamed content already (or forced)
    if (!alreadyStreamed) {
      for (const block of parsed.message.content) {
        if (block.type === 'text' && block.text) {
          this.sendToRenderer('chat:activity', { projectPath, agentId, activity: null } as ChatActivityEvent)

          if (!thread.currentMessageId || thread.messageCompleted || thread.toolUsed) {
            this.rotateCurrentMessage(thread)
          }

          thread.streamBuffer = thread.streamBuffer ? thread.streamBuffer + block.text : block.text
          if (thread.currentMessage) thread.currentMessage.content = thread.streamBuffer

          this.sendToRenderer('chat:text-delta', {
            projectPath, agentId,
            messageId: thread.currentMessageId,
            text: block.text,
            fullContent: thread.streamBuffer,
          } as ChatTextDeltaEvent)
        }
      }
    }

    // Second pass: tool_use blocks (always processed)
    let hasToolUse = false
    for (const block of parsed.message.content) {
      if (block.type === 'tool_use' && block.name) {
        hasToolUse = true
        const input = block.input as Record<string, unknown> | undefined
        const activity = getToolActivity(block.name, input)
        this.sendToRenderer('chat:activity', { projectPath, agentId, activity } as ChatActivityEvent)

        // Wizard step detection
        if ((block.name === 'Read' || block.name === 'read_file') && input) {
          const filePath = (input.file_path || input.path || '') as string
          const stepMatch = filePath.match(/step-(\d+)/)
          if (stepMatch) {
            this.sendToRenderer('chat:wizard-step', { stepNumber: parseInt(stepMatch[1], 10) } as ChatWizardStepEvent)
          }
        }

        if (thread.currentMessageId) {
          this.sendToRenderer('chat:tool-use', {
            projectPath, agentId,
            messageId: thread.currentMessageId,
            toolName: block.name, toolSummary: activity, toolInput: input,
          } as ChatToolUseEvent)

          // Track in currentMessage for disk persistence
          if (thread.currentMessage) {
            if (!thread.currentMessage.toolCalls) thread.currentMessage.toolCalls = []
            thread.currentMessage.toolCalls.push({ name: block.name, summary: activity, input })
          }
        }

        if (thread.currentMessageId && thread.streamBuffer) {
          thread.toolUsed = true
        }
      }
    }

    // When this assistant message has tool_use blocks, reset streamBuffer so the
    // NEXT turn's complete assistant message isn't incorrectly skipped by the
    // alreadyStreamed check. Without this, streamBuffer carries over from a previous
    // turn, making alreadyStreamed=true for all subsequent turns and suppressing
    // their text content (the missing intermediate messages bug).
    if (hasToolUse) {
      thread.streamBuffer = ''
    }
  }

  // --- JSONL Disk I/O ---

  appendMessage(projectPath: string, agentId: string, message: ChatMessage): void {
    try {
      ensureDir(getChatThreadsDir(projectPath))
      appendFileSync(getJsonlPath(projectPath, agentId), JSON.stringify(message) + '\n')
    } catch (err) {
      console.error('[ChatStateManager] Failed to append message:', err)
    }
  }

  readMessages(projectPath: string, agentId: string, maxMessages: number = 100): ChatMessage[] {
    const jsonlPath = getJsonlPath(projectPath, agentId)
    const oldJsonPath = getOldJsonPath(projectPath, agentId)

    // Prefer JSONL if it exists
    if (existsSync(jsonlPath)) {
      try {
        const content = readFileSync(jsonlPath, 'utf-8')
        const lines = content.trim().split('\n').filter(Boolean)
        const messages: ChatMessage[] = []
        for (const line of lines) {
          try { messages.push(JSON.parse(line)) } catch { /* skip malformed */ }
        }
        return messages.slice(-maxMessages)
      } catch { return [] }
    }

    // Migration: old .json → .jsonl + .meta.json
    if (existsSync(oldJsonPath)) {
      try {
        const content = readFileSync(oldJsonPath, 'utf-8')
        const oldThread = JSON.parse(content)
        const messages: ChatMessage[] = oldThread.messages || []

        if (messages.length > 0) {
          ensureDir(getChatThreadsDir(projectPath))
          writeFileSync(jsonlPath, messages.map(m => JSON.stringify(m)).join('\n') + '\n')
        }

        const meta: ThreadMetadata = {
          sessionId: oldThread.sessionId || null,
          storyId: oldThread.storyId || null,
          branchName: oldThread.branchName || null,
          lastActivity: oldThread.lastActivity || Date.now(),
        }
        ensureDir(getChatThreadsDir(projectPath))
        writeFileSync(getMetaPath(projectPath, agentId), JSON.stringify(meta))

        try { unlinkSync(oldJsonPath) } catch { /* ignore */ }
        return messages.slice(-maxMessages)
      } catch { return [] }
    }

    return []
  }

  writeMetadata(projectPath: string, agentId: string, meta: ThreadMetadata): void {
    try {
      ensureDir(getChatThreadsDir(projectPath))
      writeFileSync(getMetaPath(projectPath, agentId), JSON.stringify(meta))
    } catch (err) {
      console.error('[ChatStateManager] Failed to write metadata:', err)
    }
  }

  readMetadata(projectPath: string, agentId: string): ThreadMetadata | null {
    const metaPath = getMetaPath(projectPath, agentId)
    if (!existsSync(metaPath)) return null
    try { return JSON.parse(readFileSync(metaPath, 'utf-8')) } catch { return null }
  }

  clearFiles(projectPath: string, agentId: string): void {
    const paths = [getJsonlPath(projectPath, agentId), getMetaPath(projectPath, agentId), getOldJsonPath(projectPath, agentId)]
    for (const p of paths) {
      try { if (existsSync(p)) unlinkSync(p) } catch { /* ignore */ }
    }
  }

  // Read all agent statuses for a project by scanning disk + in-memory state
  readAllAgentStatuses(projectPath: string): Record<string, {
    metadata: ThreadMetadata
    isTyping: boolean
    hasMessages: boolean
  }> {
    const result: Record<string, { metadata: ThreadMetadata; isTyping: boolean; hasMessages: boolean }> = {}
    const dir = getChatThreadsDir(projectPath)
    if (!existsSync(dir)) return result

    try {
      const files = readdirSync(dir)
      // Collect agent IDs from .meta.json, .jsonl, and .json files
      const agentIds = new Set<string>()
      for (const f of files) {
        if (f.endsWith('.meta.json')) agentIds.add(f.replace('.meta.json', ''))
        else if (f.endsWith('.jsonl')) agentIds.add(f.replace('.jsonl', ''))
        else if (f.endsWith('.json')) agentIds.add(f.replace('.json', ''))
      }

      for (const agentId of agentIds) {
        // Read metadata from .meta.json if available
        let metadata = this.readMetadata(projectPath, agentId)

        // If no .meta.json, try extracting from old .json
        if (!metadata && existsSync(getOldJsonPath(projectPath, agentId))) {
          try {
            const content = readFileSync(getOldJsonPath(projectPath, agentId), 'utf-8')
            const oldThread = JSON.parse(content)
            metadata = {
              sessionId: oldThread.sessionId || null,
              storyId: oldThread.storyId || null,
              branchName: oldThread.branchName || null,
              lastActivity: oldThread.lastActivity || 0,
            }
          } catch { /* ignore */ }
        }

        if (!metadata) {
          metadata = { sessionId: null, storyId: null, branchName: null, lastActivity: 0 }
        }

        // Check in-memory state for isTyping
        const thread = this.getThread(projectPath, agentId)
        const isTyping = thread?.isTyping || false

        // Override metadata with in-memory values if they're more current
        if (thread) {
          if (thread.sessionId) metadata.sessionId = thread.sessionId
          if (thread.storyId) metadata.storyId = thread.storyId
          if (thread.branchName) metadata.branchName = thread.branchName
          if (thread.isInitialized && !metadata.sessionId) {
            // Agent is initialized in memory but no sessionId on disk yet
          }
        }

        // Check if there are actual messages
        const hasMessages = existsSync(getJsonlPath(projectPath, agentId)) ||
          existsSync(getOldJsonPath(projectPath, agentId))

        result[agentId] = { metadata, isTyping, hasMessages }
      }
    } catch (err) {
      console.error('[ChatStateManager] Failed to read all agent statuses:', err)
    }

    return result
  }

  // --- Public API ---

  // Called from ChatAgentManager stdout handler
  handleOutput(projectPath: string, agentId: string, chunk: string, isAgentLoad: boolean) {
    console.log('[ChatStateManager] handleOutput:', { agentId, isAgentLoad, chunkLen: chunk.length, hasWindow: !!this.mainWindow })
    const thread = this.getOrCreateThread(projectPath, agentId)

    // Ensure typing is set
    if (!thread.isTyping) {
      thread.isTyping = true
      this.sendToRenderer('chat:typing', { projectPath, agentId, isTyping: true } as ChatTypingEvent)
    }

    // During agent load, just show activity status
    if (isAgentLoad) {
      this.sendToRenderer('chat:activity', { projectPath, agentId, activity: 'Loading agent...' } as ChatActivityEvent)
      return
    }

    // Parse stream-json lines
    const lines = chunk.split('\n').filter(Boolean)

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)

        // Handle content_block_delta with input_json_delta (wizard step tracking)
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
          const partial = parsed.delta.partial_json as string | undefined
          if (partial) {
            const stepMatch = partial.match(/step-(\d+)/)
            if (stepMatch) {
              const stepNum = parseInt(stepMatch[1], 10)
              this.sendToRenderer('chat:wizard-step', { stepNumber: stepNum } as ChatWizardStepEvent)
            }
          }
        }

        // Handle content_block_delta — streaming text
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          const newText = parsed.delta.text

          // Generate new message ID if needed (post-tool text block or first text)
          if (!thread.currentMessageId || thread.messageCompleted || thread.toolUsed) {
            this.rotateCurrentMessage(thread)
          }

          thread.streamBuffer += newText
          if (thread.currentMessage) thread.currentMessage.content = thread.streamBuffer

          // Emit semantic event — renderer lazily creates the message
          this.sendToRenderer('chat:text-delta', {
            projectPath, agentId,
            messageId: thread.currentMessageId,
            text: newText,
            fullContent: thread.streamBuffer,
          } as ChatTextDeltaEvent)
        }

        // Handle content_block_start for text blocks
        if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'text') {
          if (!thread.currentMessageId || thread.messageCompleted || thread.toolUsed) {
            this.rotateCurrentMessage(thread)
          }
        }

        // Handle content_block_start for tool_use blocks
        if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
          const toolName = parsed.content_block.name
          const toolInput = parsed.content_block.input as Record<string, unknown> | undefined
          if (toolName) {
            const activity = getToolActivity(toolName, toolInput)
            this.sendToRenderer('chat:activity', { projectPath, agentId, activity } as ChatActivityEvent)

            // Wizard step detection from tool reads
            if ((toolName === 'Read' || toolName === 'read_file') && toolInput) {
              const filePath = (toolInput.file_path || toolInput.path || '') as string
              if (filePath) {
                const stepMatch = filePath.match(/step-(\d+)/)
                if (stepMatch) {
                  this.sendToRenderer('chat:wizard-step', { stepNumber: parseInt(stepMatch[1], 10) } as ChatWizardStepEvent)
                }
              }
            }

            // Emit tool use event
            if (thread.currentMessageId) {
              this.sendToRenderer('chat:tool-use', {
                projectPath, agentId,
                messageId: thread.currentMessageId,
                toolName, toolSummary: activity, toolInput,
              } as ChatToolUseEvent)

              // Track tool call in currentMessage for disk persistence
              if (thread.currentMessage) {
                if (!thread.currentMessage.toolCalls) thread.currentMessage.toolCalls = []
                thread.currentMessage.toolCalls.push({ name: toolName, summary: activity, input: toolInput })
              }
            }

            // Mark as tool-used so next text block gets a new message
            if (thread.currentMessageId && thread.streamBuffer) {
              thread.toolUsed = true
            }
          }
        }

        // Handle assistant message (complete message format with content blocks).
        if (parsed.type === 'assistant' && parsed.message?.content) {
          this.processAssistantContent(thread, projectPath, agentId, parsed)
        }

        // Handle result — finalize message with stats and persist to JSONL
        if (parsed.type === 'result') {
          this.sendToRenderer('chat:activity', { projectPath, agentId, activity: null } as ChatActivityEvent)

          if (thread.currentMessageId) {
            // Extract stats
            const stats: LLMStats | undefined = parsed.usage ? {
              model: parsed.modelUsage
                ? Object.entries(parsed.modelUsage).sort((a, b) => ((b[1] as Record<string, number>).costUSD || 0) - ((a[1] as Record<string, number>).costUSD || 0))[0]?.[0] || 'unknown'
                : 'unknown',
              inputTokens: parsed.usage.input_tokens || 0,
              outputTokens: parsed.usage.output_tokens || 0,
              cacheReadTokens: parsed.usage.cache_read_input_tokens,
              cacheWriteTokens: parsed.usage.cache_creation_input_tokens,
              totalCostUsd: parsed.total_cost_usd,
              durationMs: parsed.duration_ms,
              apiDurationMs: parsed.duration_api_ms,
            } : undefined

            // Emit message-complete
            this.sendToRenderer('chat:message-complete', {
              projectPath, agentId,
              messageId: thread.currentMessageId,
              stats,
              cost: parsed.total_cost_usd,
            } as ChatMessageCompleteEvent)

            // Persist the completed message to JSONL
            if (thread.currentMessage) {
              thread.currentMessage.status = 'complete'
              thread.currentMessage.stats = stats
              this.appendMessage(projectPath, agentId, thread.currentMessage)
              thread.currentMessage = null
            }
          }

          thread.messageCompleted = true
          thread.streamBuffer = ''
          thread.lastActivity = Date.now()
        }
      } catch {
        // Not JSON, ignore
      }
    }

  }

  // Called when stderr data arrives — log for debugging.
  // Stderr from CLI processes may contain error messages that explain silent failures.
  handleStderr(_projectPath: string, agentId: string, chunk: string, isAgentLoad: boolean) {
    const trimmed = chunk.trim()
    if (trimmed) {
      console.log(`[ChatStateManager] stderr (${agentId}, load=${isAgentLoad}):`, trimmed.substring(0, 500))
    }
  }

  // Called from ChatAgentManager when agent load completes
  handleAgentLoaded(projectPath: string, agentId: string, code: number | null, sessionId?: string, _error?: string) {
    const thread = this.getOrCreateThread(projectPath, agentId)
    thread.isLoadingAgent = false

    // Clear activity
    this.sendToRenderer('chat:activity', { projectPath, agentId, activity: null } as ChatActivityEvent)

    if (sessionId) {
      thread.sessionId = sessionId
      thread.isInitialized = true
    }

    if (code === 0 && sessionId) {
      // Success — emit agent-ready so renderer can send the pending message
      console.log('[ChatStateManager] Agent loaded successfully:', { agentId, sessionId })
      this.sendToRenderer('chat:agent-ready', { projectPath, agentId, sessionId } as ChatAgentReadyEvent)
    } else {
      // Failure or no session — emit agent-exit so renderer can clean up
      console.log('[ChatStateManager] Agent load failed or no session:', { agentId, code, sessionId })
      thread.isTyping = false
      this.sendToRenderer('chat:typing', { projectPath, agentId, isTyping: false } as ChatTypingEvent)
      this.sendToRenderer('chat:agent-exit', {
        projectPath, agentId, code, cancelled: false,
        error: code !== 0 ? 'Agent load failed' : 'No session ID returned',
      } as ChatAgentExitEvent)
    }
  }

  // Called from ChatAgentManager when message process exits
  handleExit(projectPath: string, agentId: string, code: number | null, _signal: string | null, sessionId?: string, cancelled?: boolean) {
    const thread = this.getOrCreateThread(projectPath, agentId)

    // Update session ID
    if (sessionId) {
      thread.sessionId = sessionId
    }

    // Persist any in-flight message before resetting
    if (thread.currentMessage) {
      if (thread.currentMessage.content) {
        thread.currentMessage.status = (code === 0 || code === null) ? 'complete' : 'error'
        this.appendMessage(projectPath, agentId, thread.currentMessage)
      } else if (code !== 0 && code !== null) {
        // Process exited with error but no content was streamed — persist with error status
        thread.currentMessage.content = '*[Agent process exited with no response]*'
        thread.currentMessage.status = 'error'
        this.appendMessage(projectPath, agentId, thread.currentMessage)
      }
      // else: code 0 with no content — agent completed silently, don't persist empty message
      thread.currentMessage = null
    }

    // Write metadata to disk
    this.writeMetadata(projectPath, agentId, {
      sessionId: thread.sessionId,
      storyId: thread.storyId,
      branchName: thread.branchName,
      lastActivity: Date.now(),
    })

    // Reset parse state
    thread.currentMessageId = null
    thread.currentMessage = null
    thread.streamBuffer = ''
    thread.messageCompleted = false
    thread.toolUsed = false
    thread.isTyping = false
    thread.lastActivity = Date.now()

    // Emit semantic events
    this.sendToRenderer('chat:typing', { projectPath, agentId, isTyping: false } as ChatTypingEvent)
    this.sendToRenderer('chat:agent-exit', {
      projectPath, agentId, sessionId, code, cancelled: !!cancelled,
    } as ChatAgentExitEvent)
  }

  // --- Thread CRUD API (called from IPC handlers) ---

  getThread(projectPath: string, agentId: string): ManagedThread | null {
    const key = this.threadKey(projectPath, agentId)
    return this.threads.get(key) || null
  }

  // Return a serializable snapshot of a thread (for IPC transport)
  getThreadSnapshot(projectPath: string, agentId: string): {
    agentId: string
    lastActivity: number
    isTyping: boolean
    isInitialized: boolean
    sessionId?: string
    storyId?: string
    branchName?: string
  } | null {
    const thread = this.getThread(projectPath, agentId)
    if (!thread) return null
    return {
      agentId: thread.agentId,
      lastActivity: thread.lastActivity,
      isTyping: thread.isTyping,
      isInitialized: thread.isInitialized,
      sessionId: thread.sessionId || undefined,
      storyId: thread.storyId || undefined,
      branchName: thread.branchName || undefined,
    }
  }

  getAllThreadSnapshots(projectPath: string): Record<string, ReturnType<ChatStateManager['getThreadSnapshot']>> {
    const result: Record<string, ReturnType<ChatStateManager['getThreadSnapshot']>> = {}
    for (const [, thread] of this.threads) {
      if (thread.projectPath === projectPath) {
        const snap = this.getThreadSnapshot(projectPath, thread.agentId)
        if (snap) result[thread.agentId] = snap
      }
    }
    return result
  }

  setThreadContext(projectPath: string, agentId: string, storyId: string | null, branchName: string | null) {
    const thread = this.getOrCreateThread(projectPath, agentId)
    thread.storyId = storyId
    thread.branchName = branchName
  }

  clearThread(projectPath: string, agentId: string) {
    const key = this.threadKey(projectPath, agentId)
    const thread = this.threads.get(key)
    if (thread) {
      // Reset parse state before deleting
      thread.currentMessageId = null
      thread.currentMessage = null
      thread.streamBuffer = ''
      thread.messageCompleted = false
      thread.toolUsed = false
      thread.isLoadingAgent = false
    }
    this.threads.delete(key)
  }

  setPendingMessage(projectPath: string, agentId: string, content: string, assistantMsgId: string) {
    const thread = this.getOrCreateThread(projectPath, agentId)
    thread.pendingMessage = { content, assistantMsgId }
    thread.isLoadingAgent = true
  }

  // Check if an agent has a pending message (for agent load flow)
  getPendingMessage(projectPath: string, agentId: string): { content: string; assistantMsgId: string } | null {
    const thread = this.getThread(projectPath, agentId)
    return thread?.pendingMessage || null
  }

  // Consume and clear the pending message
  consumePendingMessage(projectPath: string, agentId: string): { content: string; assistantMsgId: string } | null {
    const thread = this.getThread(projectPath, agentId)
    if (!thread?.pendingMessage) return null
    const pending = thread.pendingMessage
    thread.pendingMessage = null
    thread.isLoadingAgent = false
    // Set up the thread for streaming
    thread.currentMessageId = pending.assistantMsgId
    thread.currentMessage = {
      id: pending.assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    }
    thread.streamBuffer = ''
    thread.messageCompleted = false
    thread.toolUsed = false
    return pending
  }

  // Set the current message ID for streaming (when sending directly with existing session)
  setCurrentMessageId(projectPath: string, agentId: string, messageId: string) {
    console.log('[ChatStateManager] setCurrentMessageId:', { agentId, messageId })
    const thread = this.getOrCreateThread(projectPath, agentId)
    thread.currentMessageId = messageId
    thread.currentMessage = {
      id: messageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    }
    thread.streamBuffer = ''
    thread.messageCompleted = false
    thread.toolUsed = false
  }
}

// Singleton
export const chatStateManager = new ChatStateManager()
