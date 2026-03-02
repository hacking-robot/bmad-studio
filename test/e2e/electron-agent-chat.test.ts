/**
 * E2E Test: Playwright Electron Agent Chat
 *
 * Launches the real Electron app via Playwright, sends messages through the
 * IPC bridge (window.chatAPI.sendMessage), and asserts that semantic events
 * (text-delta, typing, message-complete, agent-exit) flow back correctly.
 *
 * Prerequisites:
 *   - `npm run build:test` must have been run (dist-electron/main.js exists)
 *   - `claude` CLI must be on PATH
 *
 * Run: npm run test:e2e:electron
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { join } from 'path'
import { mkdtempSync, rmSync, existsSync, copyFileSync, writeFileSync } from 'fs'
import { tmpdir, homedir, platform } from 'os'
import { execFileSync } from 'child_process'
import { v4 as uuidv4 } from 'uuid'

const ROOT = join(__dirname, '..', '..')
const MAIN_JS = join(ROOT, 'dist-electron', 'main.js')

// Settings file location (matches electron/main.ts getSettingsPath)
function getSettingsPath(): string {
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'bmad-studio', 'settings.json')
  } else if (platform() === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'bmad-studio', 'settings.json')
  }
  return join(homedir(), '.config', 'bmad-studio', 'settings.json')
}

const SETTINGS_PATH = getSettingsPath()
const SETTINGS_BACKUP = SETTINGS_PATH + '.e2e-backup'

// Pre-check: skip if claude CLI not found
try {
  execFileSync('which', ['claude'], { encoding: 'utf-8' })
} catch {
  console.error('claude CLI not found — skipping Electron e2e tests')
  process.exit(0)
}

// Pre-check: skip if built app not found
if (!existsSync(MAIN_JS)) {
  console.error(`Built app not found at ${MAIN_JS} — run "npm run build:test" first`)
  process.exit(0)
}

let electronApp: ElectronApplication
let page: Page
let tempProjectDir: string

// Tracker interface matching what we attach to window.__e2eTracker
interface EventTracker {
  textDeltas: string[]
  typingEvents: boolean[]
  messageCompleted: boolean
  agentExited: boolean
  exitCode: number | null
  fullContent: string
  sessionId: string | null
  error: string | null
}

beforeAll(async () => {
  // Create temp project directory with git init
  tempProjectDir = mkdtempSync(join(tmpdir(), 'bmadboard-electron-e2e-'))
  execFileSync('git', ['init'], { cwd: tempProjectDir })
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempProjectDir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tempProjectDir })
  writeFileSync(join(tempProjectDir, 'README.md'), '# Test Project\n')
  execFileSync('git', ['add', '.'], { cwd: tempProjectDir })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: tempProjectDir })

  // Backup real settings
  if (existsSync(SETTINGS_PATH)) {
    copyFileSync(SETTINGS_PATH, SETTINGS_BACKUP)
  }

  // Launch Electron app
  electronApp = await electron.launch({
    args: [MAIN_JS],
    env: {
      ...process.env,
      CLAUDECODE: undefined,          // allow nested sessions
      NODE_ENV: 'test',
    },
    timeout: 60_000,
  })

  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // Bypass startup dialogs by saving settings with temp project path
  // Use string-based evaluate to avoid vitest transform issues
  const escapedPath = tempProjectDir.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  await page.evaluate(`
    window.fileAPI.saveSettings({
      projectPath: '${escapedPath}',
      projectType: 'bmm',
      envCheckCompletedOnce: true,
      hasConfiguredProfile: true,
      disableGitBranching: true,
    })
  `)

  // Reload to pick up new settings
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Wait for the app to settle (store rehydration)
  await page.waitForTimeout(3000)
}, 60_000)

afterAll(async () => {
  // Kill any lingering agents
  if (page) {
    try {
      await page.evaluate(`
        (async function() {
          var t = window.__e2eTracker;
          if (t) {
            var keys = Object.keys(t);
            for (var i = 0; i < keys.length; i++) {
              try { await window.chatAPI.cancelMessage(keys[i]); } catch(e) {}
            }
          }
        })()
      `)
    } catch { /* app may already be closing */ }
  }

  if (electronApp) {
    await electronApp.close()
  }

  // Restore real settings
  if (existsSync(SETTINGS_BACKUP)) {
    copyFileSync(SETTINGS_BACKUP, SETTINGS_PATH)
    rmSync(SETTINGS_BACKUP, { force: true })
  }

  // Clean up temp directory
  if (tempProjectDir) {
    rmSync(tempProjectDir, { recursive: true, force: true })
  }
})

/**
 * Register event listeners for a specific agentId via page.evaluate.
 * Uses string-based evaluate to avoid vitest/esbuild transform issues
 * with Playwright's function serialization.
 */
async function setupEventTracker(agentId: string): Promise<void> {
  await page.evaluate(`
    (function() {
      var tracker = {
        textDeltas: [],
        typingEvents: [],
        messageCompleted: false,
        agentExited: false,
        exitCode: null,
        fullContent: '',
        sessionId: null,
        error: null
      };

      if (!window.__e2eTracker) window.__e2eTracker = {};
      window.__e2eTracker['${agentId}'] = tracker;

      window.chatAPI.onTextDelta(function(e) {
        if (e.agentId === '${agentId}') {
          tracker.textDeltas.push(e.text);
          tracker.fullContent = e.fullContent;
        }
      });

      window.chatAPI.onTyping(function(e) {
        if (e.agentId === '${agentId}') {
          tracker.typingEvents.push(e.isTyping);
        }
      });

      window.chatAPI.onMessageComplete(function(e) {
        if (e.agentId === '${agentId}') {
          tracker.messageCompleted = true;
        }
      });

      window.chatAPI.onAgentExit(function(e) {
        if (e.agentId === '${agentId}') {
          tracker.agentExited = true;
          tracker.exitCode = e.code;
          tracker.sessionId = e.sessionId || null;
          tracker.error = e.error || null;
        }
      });
    })()
  `)
}

/**
 * Read the event tracker for a specific agentId.
 */
async function getTracker(agentId: string): Promise<EventTracker> {
  return await page.evaluate(`
    (function() {
      var t = window.__e2eTracker && window.__e2eTracker['${agentId}'];
      return t || null;
    })()
  `) as EventTracker
}

/**
 * Send a chat message through the IPC bridge.
 */
async function sendChatMessage(agentId: string, projectPath: string, message: string): Promise<{ success: boolean; error?: string }> {
  const escapedPath = projectPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const escapedMsg = message.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return await page.evaluate(`
    window.chatAPI.sendMessage({
      agentId: '${agentId}',
      projectPath: '${escapedPath}',
      message: '${escapedMsg}'
    })
  `) as { success: boolean; error?: string }
}

/**
 * Wait for agent exit event for a given agentId.
 */
async function waitForAgentExit(agentId: string, timeout = 90_000): Promise<void> {
  await page.waitForFunction(`
    window.__e2eTracker &&
    window.__e2eTracker['${agentId}'] &&
    window.__e2eTracker['${agentId}'].agentExited === true
  `, undefined, { timeout })
}

describe('Electron Agent Chat E2E', () => {
  it('single agent round-trip: send message and receive all events', async () => {
    const agentId = `e2e-agent-${uuidv4().slice(0, 8)}`

    // Set up event tracking before sending message
    await setupEventTracker(agentId)

    // Send a message through the IPC bridge
    const result = await sendChatMessage(agentId, tempProjectDir, 'Say hello briefly. Respond with just a greeting, nothing else.')
    expect(result.success).toBe(true)

    // Wait for agent-exit event (indicates process completed)
    await waitForAgentExit(agentId)

    // Read final tracker state
    const tracker = await getTracker(agentId)

    console.log('Single agent result:', {
      contentLength: tracker.fullContent.length,
      textDeltaCount: tracker.textDeltas.length,
      typingEvents: tracker.typingEvents.length,
      messageCompleted: tracker.messageCompleted,
      exitCode: tracker.exitCode,
      sessionId: tracker.sessionId,
      error: tracker.error,
    })

    // Assert all events fired correctly
    expect(tracker.fullContent.length).toBeGreaterThan(0)
    expect(tracker.textDeltas.length).toBeGreaterThan(0)
    expect(tracker.typingEvents).toContain(true)
    expect(tracker.messageCompleted).toBe(true)
    expect(tracker.exitCode).toBe(0)
    expect(tracker.error).toBeNull()
  }, 120_000)

  it('parallel agents: two independent agents respond with different sessions', async () => {
    const agentId1 = `e2e-parallel-a-${uuidv4().slice(0, 8)}`
    const agentId2 = `e2e-parallel-b-${uuidv4().slice(0, 8)}`

    // Set up event tracking for both agents
    await setupEventTracker(agentId1)
    await setupEventTracker(agentId2)

    // Fire both messages in parallel
    const [result1, result2] = await Promise.all([
      sendChatMessage(agentId1, tempProjectDir, 'Say hello briefly. Respond with just a greeting, nothing else.'),
      sendChatMessage(agentId2, tempProjectDir, 'Say hi briefly. Respond with just a greeting, nothing else.'),
    ])

    expect(result1.success).toBe(true)
    expect(result2.success).toBe(true)

    // Wait for both agents to exit
    await Promise.all([
      waitForAgentExit(agentId1),
      waitForAgentExit(agentId2),
    ])

    const tracker1 = await getTracker(agentId1)
    const tracker2 = await getTracker(agentId2)

    console.log('Parallel agent 1:', {
      contentLength: tracker1.fullContent.length,
      textDeltaCount: tracker1.textDeltas.length,
      exitCode: tracker1.exitCode,
      sessionId: tracker1.sessionId,
    })
    console.log('Parallel agent 2:', {
      contentLength: tracker2.fullContent.length,
      textDeltaCount: tracker2.textDeltas.length,
      exitCode: tracker2.exitCode,
      sessionId: tracker2.sessionId,
    })

    // Both should have produced content
    expect(tracker1.fullContent.length).toBeGreaterThan(0)
    expect(tracker2.fullContent.length).toBeGreaterThan(0)

    // Both should have streamed text deltas
    expect(tracker1.textDeltas.length).toBeGreaterThan(0)
    expect(tracker2.textDeltas.length).toBeGreaterThan(0)

    // Both should have completed messages
    expect(tracker1.messageCompleted).toBe(true)
    expect(tracker2.messageCompleted).toBe(true)

    // Both should have exited cleanly
    expect(tracker1.exitCode).toBe(0)
    expect(tracker2.exitCode).toBe(0)

    // Sessions should be independent (different session IDs)
    expect(tracker1.sessionId).toBeTruthy()
    expect(tracker2.sessionId).toBeTruthy()
    expect(tracker1.sessionId).not.toBe(tracker2.sessionId)
  }, 120_000)
})
