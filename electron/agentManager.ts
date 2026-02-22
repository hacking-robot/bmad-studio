import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import { getAugmentedEnv, findBinary } from './envUtils'
import { buildArgs, getToolConfig, supportsHeadless, ClaudeModel, CustomEndpointConfig } from './cliToolManager'

// Supported AI tools
type AITool = 'claude-code' | 'custom-endpoint' | 'cursor' | 'windsurf' | 'roo-code' | 'aider'

export interface AgentInfo {
  id: string
  storyId: string
  storyTitle: string
  command: string
  status: 'running' | 'completed' | 'error'
  startTime: number
  pid: number | undefined
}

interface ManagedAgent {
  id: string
  process: ChildProcess
  storyId: string
  storyTitle: string
  command: string
  startTime: number
}

class AgentManager extends EventEmitter {
  private agents: Map<string, ManagedAgent> = new Map()
  private mainWindow: BrowserWindow | null = null

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  private sendToRenderer(channel: string, data: unknown) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  spawn(options: {
    storyId: string
    storyTitle: string
    projectPath: string
    initialPrompt: string
  }): string {
    const agentId = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    try {
      const args: string[] = ['--output-format', 'stream-json', '--print', '--verbose', '--dangerously-skip-permissions']

      if (options.initialPrompt) {
        args.push('-p', options.initialPrompt)
      }

      console.log('Spawning claude with args:', args, 'in:', options.projectPath)

      // Find the claude binary using augmented PATH
      const claudePath = findBinary('claude') || 'claude'

      const proc = spawn(claudePath, args, {
        cwd: options.projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: getAugmentedEnv()
      })

      const managed: ManagedAgent = {
        id: agentId,
        process: proc,
        storyId: options.storyId,
        storyTitle: options.storyTitle,
        command: options.initialPrompt,
        startTime: Date.now()
      }

      this.agents.set(agentId, managed)

      // Handle stdout
      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        this.sendToRenderer('agent:output', {
          agentId,
          type: 'stdout',
          chunk,
          timestamp: Date.now()
        })
      })

      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        this.sendToRenderer('agent:output', {
          agentId,
          type: 'stderr',
          chunk,
          timestamp: Date.now()
        })
      })

      // Handle process exit
      proc.on('exit', (code, signal) => {
        console.log('Agent exited:', { agentId, code, signal })
        this.sendToRenderer('agent:exit', {
          agentId,
          code,
          signal,
          timestamp: Date.now()
        })
        this.agents.delete(agentId)
      })

      // Handle errors
      proc.on('error', (error) => {
        console.error('Agent error:', error)
        this.sendToRenderer('agent:error', {
          agentId,
          error: error.message,
          timestamp: Date.now()
        })
        this.agents.delete(agentId)
      })

      // Send spawned event
      this.sendToRenderer('agent:spawned', {
        agentId,
        storyId: options.storyId,
        storyTitle: options.storyTitle,
        command: options.initialPrompt,
        pid: proc.pid,
        timestamp: Date.now()
      })

      console.log('Agent spawned successfully:', agentId, 'PID:', proc.pid)
      return agentId
    } catch (error) {
      console.error('Agent spawn failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to spawn agent'
      this.sendToRenderer('agent:error', {
        agentId,
        error: errorMessage,
        timestamp: Date.now()
      })
      throw error
    }
  }

  sendInput(agentId: string, input: string): boolean {
    const managed = this.agents.get(agentId)
    if (!managed || !managed.process.stdin) {
      return false
    }

    try {
      managed.process.stdin.write(input)
      return true
    } catch {
      return false
    }
  }

  kill(agentId: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const managed = this.agents.get(agentId)
    if (!managed) {
      return false
    }

    try {
      managed.process.kill(signal)
      this.agents.delete(agentId)
      return true
    } catch {
      return false
    }
  }

  killAll(): void {
    for (const [agentId, managed] of this.agents) {
      try {
        managed.process.kill('SIGTERM')
      } catch {
        // Ignore errors during cleanup
      }
      this.agents.delete(agentId)
    }
  }

  getAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).map((managed) => ({
      id: managed.id,
      storyId: managed.storyId,
      storyTitle: managed.storyTitle,
      command: managed.command,
      status: 'running' as const,
      startTime: managed.startTime,
      pid: managed.process.pid
    }))
  }

  getAgent(agentId: string): AgentInfo | null {
    const managed = this.agents.get(agentId)
    if (!managed) {
      return null
    }

    return {
      id: managed.id,
      storyId: managed.storyId,
      storyTitle: managed.storyTitle,
      command: managed.command,
      status: 'running',
      startTime: managed.startTime,
      pid: managed.process.pid
    }
  }

  hasAgentForStory(storyId: string): string | null {
    for (const [, managed] of this.agents) {
      if (managed.storyId === storyId) {
        return managed.id
      }
    }
    return null
  }
}

// Singleton instance
export const agentManager = new AgentManager()

// Chat-specific agent manager for the Discord-style chat interface
// Spawns a new Claude process for each message using --print mode
// Uses --resume with session ID for conversation continuity

class ChatAgentManager {
  private mainWindow: BrowserWindow | null = null
  private runningProcesses: Map<string, ChildProcess> = new Map() // Track running processes by agentId

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  private sendToRenderer(channel: string, data: unknown) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  // Load a BMAD agent - spawns the AI tool with just the agent command
  // Returns session ID via chat:exit event for subsequent messages (Claude only)
  loadAgent(
    options: {
      agentId: string
      projectPath: string
      projectType: 'bmm' | 'gds'
      tool?: AITool
      model?: ClaudeModel
      customEndpoint?: CustomEndpointConfig | null
      agentCommand?: string // Pre-resolved agent command from scan data (preferred over hardcoded format)
    }
  ): { success: boolean; error?: string } {
    const tool = options.tool || 'claude-code'

    // Check if tool supports headless operation
    if (!supportsHeadless(tool)) {
      return {
        success: false,
        error: `${tool} does not support headless CLI operation. Use the IDE directly.`
      }
    }

    const toolConfig = getToolConfig(tool)
    if (!toolConfig || !toolConfig.cliCommand) {
      return { success: false, error: `Unknown tool: ${tool}` }
    }

    // Kill any existing process for this agent to prevent stale close events
    const existingProc = this.runningProcesses.get(options.agentId)
    if (existingProc) {
      console.log('[ChatAgentManager] Killing existing process for agent before new load:', options.agentId)
      try { existingProc.kill('SIGTERM') } catch { /* ignore */ }
      this.runningProcesses.delete(options.agentId)
    }

    try {
      // Use pre-resolved command if available, otherwise fall back to stable format
      const agentPrompt = options.agentCommand
        || `/bmad-agent-${options.projectType}-${options.agentId}`
      
      // Build tool-specific args
      let args: string[]
      let binaryName: string
      
      if (tool === 'claude-code' || tool === 'custom-endpoint') {
        // Claude or custom endpoint: use buildArgs for consistency
        args = buildArgs(tool, {
          prompt: agentPrompt,
          verbose: true,
          model: options.model,
          customModelName: options.customEndpoint?.modelName
        })
        binaryName = 'claude'
      } else if (tool === 'cursor') {
        // Cursor: headless mode with message
        args = ['--headless', '--message', agentPrompt]
        binaryName = 'cursor'
      } else if (tool === 'aider') {
        // Aider: non-interactive mode with message
        args = ['--no-auto-commits', '--yes', '--message', agentPrompt]
        binaryName = 'aider'
      } else {
        return { success: false, error: `Unsupported tool for agent loading: ${tool}` }
      }

      console.log('[ChatAgentManager] ================================')
      console.log('[ChatAgentManager] Loading agent:', options.agentId)
      console.log('[ChatAgentManager] Tool:', tool)
      console.log('[ChatAgentManager] Project path (cwd):', options.projectPath)
      console.log(`[ChatAgentManager] Full command: ${binaryName}`, args.join(' '))
      if (tool === 'custom-endpoint' && options.customEndpoint) {
        console.log('[ChatAgentManager] Custom endpoint:', options.customEndpoint.name, '(' + options.customEndpoint.baseUrl + ')')
      }
      console.log('[ChatAgentManager] ================================')

      // Find the binary using augmented PATH
      const binaryPath = findBinary(binaryName) || binaryName

      // Build environment - inject custom endpoint vars if configured
      let env = getAugmentedEnv()
      if (tool === 'custom-endpoint' && options.customEndpoint) {
        env = {
          ...env,
          ANTHROPIC_BASE_URL: options.customEndpoint.baseUrl,
          ANTHROPIC_AUTH_TOKEN: options.customEndpoint.apiKey
        }
      }

      const proc = spawn(binaryPath, args, {
        cwd: options.projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env
      })

      console.log('[ChatAgentManager] Agent load process spawned, PID:', proc.pid)

      // Track running process for potential cancellation
      this.runningProcesses.set(options.agentId, proc)

      // Track session ID from response
      let capturedSessionId: string | undefined

      // Line buffer to handle partial JSON lines split across data chunks
      let loadLineBuffer = ''

      // Handle stdout - capture session ID
      proc.stdout?.on('data', (data: Buffer) => {
        loadLineBuffer += data.toString('utf-8')

        // Split into lines - last element may be incomplete
        const parts = loadLineBuffer.split('\n')
        // Keep the last (potentially incomplete) part in the buffer
        loadLineBuffer = parts.pop() || ''

        // Process only complete lines
        const completeLines = parts.filter(Boolean)

        for (const line of completeLines) {
          try {
            const parsed = JSON.parse(line)
            console.log('[ChatAgentManager] Parsed JSON type:', parsed.type)
            if (parsed.type === 'result' && parsed.session_id) {
              capturedSessionId = parsed.session_id
              console.log('[ChatAgentManager] Agent load captured session ID:', capturedSessionId)
            }
          } catch {
            // Not JSON, ignore
          }
        }

        // Send complete lines to renderer for display
        if (completeLines.length > 0) {
          this.sendToRenderer('chat:output', {
            agentId: options.agentId,
            type: 'stdout',
            chunk: completeLines.join('\n') + '\n',
            timestamp: Date.now(),
            isAgentLoad: true
          })
        }
      })

      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        this.sendToRenderer('chat:output', {
          agentId: options.agentId,
          type: 'stderr',
          chunk,
          timestamp: Date.now(),
          isAgentLoad: true
        })
      })

      // Use 'close' instead of 'exit' to ensure all stdio streams are fully consumed
      // before processing. 'exit' can fire while stdout still has buffered data.
      proc.on('close', (code, signal) => {
        // Guard against stale close events from old processes that were replaced.
        // If another process has taken over this agentId, ignore this event.
        const currentProc = this.runningProcesses.get(options.agentId)
        if (currentProc && currentProc !== proc) {
          console.log('[ChatAgentManager] Ignoring stale agent-load close event for:', options.agentId)
          return
        }

        // Flush any remaining data in the line buffer
        if (loadLineBuffer.trim()) {
          try {
            const parsed = JSON.parse(loadLineBuffer)
            if (parsed.type === 'result' && parsed.session_id) {
              capturedSessionId = parsed.session_id
            }
          } catch {
            // Not JSON, ignore
          }
          this.sendToRenderer('chat:output', {
            agentId: options.agentId,
            type: 'stdout',
            chunk: loadLineBuffer + '\n',
            timestamp: Date.now(),
            isAgentLoad: true
          })
          loadLineBuffer = ''
        }

        console.log('[ChatAgentManager] Agent load completed:', { agentId: options.agentId, code, signal, sessionId: capturedSessionId })
        this.runningProcesses.delete(options.agentId)
        this.sendToRenderer('chat:agent-loaded', {
          agentId: options.agentId,
          code,
          signal,
          sessionId: capturedSessionId,
          timestamp: Date.now()
        })
      })

      // Handle errors
      proc.on('error', (error) => {
        console.error('[ChatAgentManager] Agent load error:', error)
        // Only send error if this process is still the current one
        const currentProc = this.runningProcesses.get(options.agentId)
        if (currentProc && currentProc !== proc) return
        this.sendToRenderer('chat:agent-loaded', {
          agentId: options.agentId,
          code: -1,
          signal: null,
          error: error.message,
          timestamp: Date.now()
        })
      })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load agent'
      return { success: false, error: errorMessage }
    }
  }

  // Send a message to an agent - spawns a new process each time
  // Uses --resume for conversation continuity when sessionId is provided (Claude only)
  sendMessage(
    options: {
      agentId: string
      projectPath: string
      message: string
      sessionId?: string // Session ID from previous response for --resume (Claude only)
      tool?: AITool
      model?: ClaudeModel
      customEndpoint?: CustomEndpointConfig | null
    }
  ): { success: boolean; error?: string } {
    const tool = options.tool || 'claude-code'
    
    // Check if tool supports headless operation
    if (!supportsHeadless(tool)) {
      return { 
        success: false, 
        error: `${tool} does not support headless CLI operation. Use the IDE directly.` 
      }
    }

    const toolConfig = getToolConfig(tool)
    if (!toolConfig || !toolConfig.cliCommand) {
      return { success: false, error: `Unknown tool: ${tool}` }
    }

    // Kill any existing process for this agent to prevent stale close events
    const existingProc = this.runningProcesses.get(options.agentId)
    if (existingProc) {
      console.log('[ChatAgentManager] Killing existing process for agent before new message:', options.agentId)
      try { existingProc.kill('SIGTERM') } catch { /* ignore */ }
      this.runningProcesses.delete(options.agentId)
    }

    try {
      const prompt = options.message

      // Build tool-specific args
      let args: string[]
      let binaryName: string
      
      if (tool === 'claude-code' || tool === 'custom-endpoint') {
        // Claude or custom endpoint: use buildArgs, supports --resume for session continuity
        args = buildArgs(tool, {
          prompt,
          sessionId: options.sessionId,
          verbose: true,
          model: options.model,
          customModelName: options.customEndpoint?.modelName
        })
        binaryName = 'claude'
      } else if (tool === 'cursor') {
        // Cursor: headless mode with message (no session support)
        args = ['--headless', '--message', prompt]
        binaryName = 'cursor'
      } else if (tool === 'aider') {
        // Aider: non-interactive mode with message (no session support)
        args = ['--no-auto-commits', '--yes', '--message', prompt]
        binaryName = 'aider'
      } else {
        return { success: false, error: `Unsupported tool for messaging: ${tool}` }
      }

      console.log('[ChatAgentManager] ================================')
      console.log('[ChatAgentManager] Sending message')
      console.log('[ChatAgentManager] Tool:', tool)
      console.log('[ChatAgentManager] Project path (cwd):', options.projectPath)
      console.log('[ChatAgentManager] Session ID:', options.sessionId || 'none (or not supported)')
      console.log(`[ChatAgentManager] Full command: ${binaryName}`, args.join(' '))
      if (tool === 'custom-endpoint' && options.customEndpoint) {
        console.log('[ChatAgentManager] Custom endpoint:', options.customEndpoint.name, '(' + options.customEndpoint.baseUrl + ')')
      }
      console.log('[ChatAgentManager] ================================')

      // Find the binary using augmented PATH
      const binaryPath = findBinary(binaryName) || binaryName

      // Build environment - inject custom endpoint vars if configured
      let env = getAugmentedEnv()
      if (tool === 'custom-endpoint' && options.customEndpoint) {
        env = {
          ...env,
          ANTHROPIC_BASE_URL: options.customEndpoint.baseUrl,
          ANTHROPIC_AUTH_TOKEN: options.customEndpoint.apiKey
        }
      }

      const proc = spawn(binaryPath, args, {
        cwd: options.projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env
      })

      console.log('[ChatAgentManager] Process spawned, PID:', proc.pid)

      // Track running process for potential cancellation
      this.runningProcesses.set(options.agentId, proc)

      // Track session ID from response
      let capturedSessionId: string | undefined

      // Line buffer to handle partial JSON lines split across data chunks
      let msgLineBuffer = ''

      // Handle stdout - also capture session ID from result message
      proc.stdout?.on('data', (data: Buffer) => {
        msgLineBuffer += data.toString('utf-8')

        // Split into lines - last element may be incomplete
        const parts = msgLineBuffer.split('\n')
        // Keep the last (potentially incomplete) part in the buffer
        msgLineBuffer = parts.pop() || ''

        // Process only complete lines
        const completeLines = parts.filter(Boolean)

        for (const line of completeLines) {
          try {
            const parsed = JSON.parse(line)
            console.log('[ChatAgentManager] Message JSON type:', parsed.type)
            // Session ID typically comes in the result message
            if (parsed.type === 'result' && parsed.session_id) {
              capturedSessionId = parsed.session_id
              console.log('[ChatAgentManager] Captured session ID:', capturedSessionId)
            }
          } catch {
            console.log('[ChatAgentManager] Non-JSON line:', line.substring(0, 100))
          }
        }

        // Send complete lines to renderer
        if (completeLines.length > 0) {
          this.sendToRenderer('chat:output', {
            agentId: options.agentId,
            type: 'stdout',
            chunk: completeLines.join('\n') + '\n',
            timestamp: Date.now()
          })
        }
      })

      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        this.sendToRenderer('chat:output', {
          agentId: options.agentId,
          type: 'stderr',
          chunk,
          timestamp: Date.now()
        })
      })

      // Use 'close' instead of 'exit' to ensure all stdio streams are fully consumed
      // before processing. 'exit' can fire while stdout still has buffered data.
      proc.on('close', (code, signal) => {
        // Guard against stale close events from old processes that were replaced.
        const currentProc = this.runningProcesses.get(options.agentId)
        if (currentProc && currentProc !== proc) {
          console.log('[ChatAgentManager] Ignoring stale message close event for:', options.agentId)
          return
        }

        // Flush any remaining data in the line buffer
        if (msgLineBuffer.trim()) {
          try {
            const parsed = JSON.parse(msgLineBuffer)
            if (parsed.type === 'result' && parsed.session_id) {
              capturedSessionId = parsed.session_id
            }
          } catch {
            // Not JSON, ignore
          }
          this.sendToRenderer('chat:output', {
            agentId: options.agentId,
            type: 'stdout',
            chunk: msgLineBuffer + '\n',
            timestamp: Date.now()
          })
          msgLineBuffer = ''
        }

        const wasCancelled = signal === 'SIGTERM' || signal === 'SIGKILL'
        console.log('[ChatAgentManager] Process closed:', { agentId: options.agentId, code, signal, sessionId: capturedSessionId, wasCancelled })
        this.runningProcesses.delete(options.agentId)
        this.sendToRenderer('chat:exit', {
          agentId: options.agentId,
          code,
          signal,
          sessionId: capturedSessionId,
          cancelled: wasCancelled,
          timestamp: Date.now()
        })
      })

      // Handle errors
      proc.on('error', (error) => {
        console.error('[ChatAgentManager] Process error:', error)
        const currentProc = this.runningProcesses.get(options.agentId)
        if (currentProc && currentProc !== proc) return
        this.sendToRenderer('chat:exit', {
          agentId: options.agentId,
          code: -1,
          signal: null,
          error: error.message,
          timestamp: Date.now()
        })
      })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message'
      return { success: false, error: errorMessage }
    }
  }

  // Cancel an ongoing message/agent load for a specific agent
  cancelMessage(agentId: string): boolean {
    const proc = this.runningProcesses.get(agentId)
    if (!proc) {
      console.log('[ChatAgentManager] No running process to cancel for agent:', agentId)
      return false
    }

    try {
      console.log('[ChatAgentManager] Cancelling process for agent:', agentId, 'PID:', proc.pid)
      proc.kill('SIGTERM')
      this.runningProcesses.delete(agentId)
      return true
    } catch (error) {
      console.error('[ChatAgentManager] Failed to cancel process:', error)
      return false
    }
  }

  // Check if an agent has a running process
  isRunning(agentId: string): boolean {
    return this.runningProcesses.has(agentId)
  }

  // These methods are no longer needed but kept for API compatibility
  hasSession(): boolean {
    return false
  }

  isSessionReady(): boolean {
    return false
  }

  killSession(): boolean {
    return true
  }

  killAll(): void {
    // Kill all running processes
    for (const [, proc] of this.runningProcesses) {
      try {
        proc.kill('SIGTERM')
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.runningProcesses.clear()
  }

  // Get list of active agent sessions (stub - no persistent sessions in this implementation)
  getActiveSessions(): string[] {
    return []
  }
}

// Singleton instance for chat agents
export const chatAgentManager = new ChatAgentManager()
