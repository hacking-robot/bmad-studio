import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'child_process'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Locate claude binary — skip tests if not found
let claudePath: string
try {
  claudePath = execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim()
} catch {
  console.error('claude CLI not found — skipping e2e tests')
  process.exit(0)
}

let tempDir: string

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bmadboard-e2e-'))
})

afterAll(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

interface AgentResult {
  content: string
  sessionId: string | undefined
  exitCode: number | null
}

/**
 * Spawn claude CLI and parse stream-json output.
 * Mirrors ChatAgentManager.sendMessage (agentManager.ts:500-594):
 *   args: --output-format stream-json --print --verbose --dangerously-skip-permissions -p <message>
 *   line-buffer parsing: split on \n, keep incomplete tail, JSON.parse each complete line
 */
function sendMessage(message: string): Promise<AgentResult> {
  return new Promise((resolve) => {
    const args = [
      '--output-format', 'stream-json',
      '--print',
      '--verbose',
      '--dangerously-skip-permissions',
      '-p', message,
    ]

    // Strip CLAUDECODE env var so nested sessions are allowed
    const env = { ...process.env }
    delete env.CLAUDECODE

    const proc = spawn(claudePath, args, {
      cwd: tempDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    })

    let content = ''
    let sessionId: string | undefined
    let lineBuffer = ''

    // Same line-buffer pattern as agentManager.ts:563-586
    proc.stdout.on('data', (data: Buffer) => {
      lineBuffer += data.toString('utf-8')

      const parts = lineBuffer.split('\n')
      lineBuffer = parts.pop() || ''

      for (const line of parts.filter(Boolean)) {
        try {
          const parsed = JSON.parse(line)

          // Claude CLI stream-json emits:
          //   type:"assistant" → message.content[].text (streamed chunks)
          //   type:"content_block_delta" → delta.text (Anthropic API style)
          //   type:"result" → result (full text), session_id
          if (parsed.type === 'assistant' && parsed.message?.content) {
            for (const block of parsed.message.content) {
              if (block.type === 'text' && block.text) {
                content += block.text
              }
            }
          }

          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            content += parsed.delta.text
          }

          if (parsed.type === 'result') {
            if (parsed.session_id) sessionId = parsed.session_id
            // Use result text as fallback if no content captured from streaming
            if (!content && parsed.result) content = parsed.result
          }
        } catch {
          // Non-JSON line, ignore
        }
      }
    })

    proc.on('close', (code) => {
      // Flush remaining buffer
      if (lineBuffer.trim()) {
        try {
          const parsed = JSON.parse(lineBuffer)
          if (parsed.type === 'assistant' && parsed.message?.content) {
            for (const block of parsed.message.content) {
              if (block.type === 'text' && block.text) content += block.text
            }
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            content += parsed.delta.text
          }
          if (parsed.type === 'result') {
            if (parsed.session_id) sessionId = parsed.session_id
            if (!content && parsed.result) content = parsed.result
          }
        } catch {
          // Not JSON, ignore
        }
      }

      resolve({ content, sessionId, exitCode: code })
    })
  })
}

describe('Parallel Agent Chat', () => {
  it('spawns 2 agents in parallel and both respond', async () => {
    const [agent1, agent2] = await Promise.all([
      sendMessage('Say hello briefly'),
      sendMessage('Say hello briefly'),
    ])

    // Log responses for visibility
    console.log('Agent 1:', { content: agent1.content, sessionId: agent1.sessionId, exitCode: agent1.exitCode })
    console.log('Agent 2:', { content: agent2.content, sessionId: agent2.sessionId, exitCode: agent2.exitCode })

    // Both should exit cleanly
    expect(agent1.exitCode).toBe(0)
    expect(agent2.exitCode).toBe(0)

    // Both should produce content
    expect(agent1.content.length).toBeGreaterThan(0)
    expect(agent2.content.length).toBeGreaterThan(0)

    // Both should have session IDs
    expect(agent1.sessionId).toBeTruthy()
    expect(agent2.sessionId).toBeTruthy()

    // Sessions should be independent
    expect(agent1.sessionId).not.toBe(agent2.sessionId)
  })
})
