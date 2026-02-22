// Merge BMAD scan results with board overlay config to produce WorkflowConfig

import type { BmadScanResult, ScannedAgent } from '../types/bmadScan'
import type { WorkflowConfig, AgentDefinition, NextStepAction, StatusActions, StatusDefinition, StatusTransition, ProjectWorkflowPhase } from '../types/flow'
import type { ProjectType, StoryStatus } from '../types'
import overlayBmm from '../data/board-overlay-bmm.json'
import overlayGds from '../data/board-overlay-gds.json'

// Board overlay types (from JSON)
// Note: agentId is NOT in the overlay — it's auto-discovered from scan data
interface OverlayNextStep {
  label: string
  commandRef: string
  commandModule: string
  commandType: 'workflows' | 'agents'
  description: string
  primary?: boolean
}

interface OverlayStatusActions {
  nextSteps: OverlayNextStep[]
}

interface OverlayAgentOverride {
  avatar: string
  color: string
  whenToUse: string
  examplePrompts: string[]
}

interface OverlayProjectWorkflow {
  label: string
  commandRef: string
  commandModule: string
  commandType: 'workflows'
  description: string
  tooltip?: string
}

interface OverlayProjectWorkflowPhase {
  label: string
  icon: string
  description?: string
  workflows: OverlayProjectWorkflow[]
}

interface BoardOverlay {
  statuses: StatusDefinition[]
  transitions: StatusTransition[]
  statusActions: Record<string, OverlayStatusActions>
  agentOverrides: Record<string, OverlayAgentOverride>
  projectWorkflows?: Record<string, OverlayProjectWorkflowPhase>
}

function selectOverlay(projectType: ProjectType | null): BoardOverlay {
  if (projectType === 'gds') {
    return overlayGds as unknown as BoardOverlay
  }
  return overlayBmm as unknown as BoardOverlay
}

/**
 * Build a stable-format slash command path.
 * Core module commands omit the module prefix: `/bmad-{name}` and `/bmad-agent-{id}`.
 * Other modules include it: `/bmad-{module}-{name}` and `/bmad-agent-{module}-{id}`.
 */
function stableCmd(module: string, name: string, type: 'workflows' | 'agents'): string {
  if (type === 'agents') {
    return module === 'core' ? `/bmad-agent-${name}` : `/bmad-agent-${module}-${name}`
  }
  return module === 'core' ? `/bmad-${name}` : `/bmad-${module}-${name}`
}

/**
 * Build the full command path list for an agent from its scanned menu items.
 */
function buildAgentCommands(agent: ScannedAgent): string[] {
  // Agent invocation command first
  const agentCmd = stableCmd(agent.module, agent.id, 'agents')

  // Then workflow commands from menu
  const workflowCmds = agent.commands
    .filter(c => c.type === 'workflows')
    .map(c => stableCmd(c.module, c.name, 'workflows'))

  return [agentCmd, ...workflowCmds]
}

/**
 * Find which scanned agent offers a given workflow in its menu.
 * Returns the agent ID and the actual module from scan data, or null if not found.
 * Tries exact module match first, then falls back to name-only match.
 * This handles cases where the overlay's module hint differs from the scan's actual module
 * (e.g. overlay says "core" but the BMAD install has it under "bmm").
 */
function findAgentForWorkflow(
  commandRef: string,
  commandModule: string,
  scan: BmadScanResult
): { agentId: string; actualModule: string } | null {
  // First try exact match (name + module)
  for (const agent of scan.agents) {
    const cmd = agent.commands.find(
      c => c.name === commandRef && c.module === commandModule && c.type === 'workflows'
    )
    if (cmd) return { agentId: agent.id, actualModule: cmd.module }
  }
  // Fallback: match by name only (module might differ across BMAD versions)
  for (const agent of scan.agents) {
    const cmd = agent.commands.find(
      c => c.name === commandRef && c.type === 'workflows'
    )
    if (cmd) return { agentId: agent.id, actualModule: cmd.module }
  }
  return null
}

/**
 * Resolve overlay statusActions references to full command paths.
 * Auto-discovers which agent offers each workflow by checking scan data.
 * Silently skips actions whose workflow or agent doesn't exist in the scan.
 */
function resolveStatusActions(
  overlay: BoardOverlay,
  scan: BmadScanResult,
  agents: AgentDefinition[]
): Record<StoryStatus, StatusActions> {
  const result: Record<string, StatusActions> = {}

  for (const [status, actions] of Object.entries(overlay.statusActions)) {
    const resolved: NextStepAction[] = []

    for (const step of actions.nextSteps) {
      if (step.commandType === 'agents') {
        // For agent-type commands, commandRef IS the agent ID
        const agentExists = agents.some(a => a.id === step.commandRef)
        if (!agentExists) continue

        const command = stableCmd(step.commandModule, step.commandRef, 'agents')

        resolved.push({
          label: step.label,
          agentId: step.commandRef,
          command,
          description: step.description,
          ...(step.primary && { primary: true })
        })
      } else {
        // For workflow commands, auto-discover which agent has this in its menu
        const match = findAgentForWorkflow(step.commandRef, step.commandModule, scan)
        if (!match) continue
        // Also verify the agent made it into the merged agents list
        if (!agents.some(a => a.id === match.agentId)) continue

        // Use the scan's actual module for the command path (not the overlay's hint)
        const command = stableCmd(match.actualModule, step.commandRef, step.commandType)

        resolved.push({
          label: step.label,
          agentId: match.agentId,
          command,
          description: step.description,
          ...(step.primary && { primary: true })
        })
      }
    }

    result[status] = { nextSteps: resolved }
  }

  return result as Record<StoryStatus, StatusActions>
}

/**
 * Resolve overlay projectWorkflows references to full command paths.
 * Same pattern as resolveStatusActions — auto-discovers agents from scan data.
 */
function resolveProjectWorkflows(
  overlay: BoardOverlay,
  scan: BmadScanResult,
  agents: AgentDefinition[]
): Record<string, ProjectWorkflowPhase> {
  if (!overlay.projectWorkflows) return {}

  const result: Record<string, ProjectWorkflowPhase> = {}

  for (const [phaseId, phase] of Object.entries(overlay.projectWorkflows)) {
    const resolved: NextStepAction[] = []

    for (const wf of phase.workflows) {
      const match = findAgentForWorkflow(wf.commandRef, wf.commandModule, scan)
      if (!match) continue
      if (!agents.some(a => a.id === match.agentId)) continue

      // Use the scan's actual module for the command path (not the overlay's hint)
      const command = stableCmd(match.actualModule, wf.commandRef, wf.commandType)

      resolved.push({
        label: wf.label,
        agentId: match.agentId,
        command,
        description: wf.description,
        ...(wf.tooltip && { tooltip: wf.tooltip })
      })
    }

    if (resolved.length > 0) {
      result[phaseId] = {
        label: phase.label,
        icon: phase.icon,
        ...(phase.description && { description: phase.description }),
        workflows: resolved
      }
    }
  }

  return result
}

/**
 * Merge scan results with a board overlay to produce a WorkflowConfig.
 * Components consume the same WorkflowConfig interface regardless of data source.
 */
export function mergeWorkflowConfig(
  scan: BmadScanResult,
  projectType: ProjectType | null
): WorkflowConfig {
  const overlay = selectOverlay(projectType)

  // Build agents: only include agents that have an overlay entry for this project type
  // This naturally excludes core agents (bmad-master) and cross-module agents (e.g. BMM agents in a BMGD project)
  const agents: AgentDefinition[] = scan.agents
    .filter(a => !!overlay.agentOverrides[a.id])
    .map(scanned => {
      const ui = overlay.agentOverrides[scanned.id]
      const commands = buildAgentCommands(scanned)

      return {
        id: scanned.id,
        name: scanned.name,
        role: ui?.avatar ? scanned.title || scanned.id : scanned.title,
        avatar: ui?.avatar || scanned.id.slice(0, 2).toUpperCase(),
        description: scanned.identity || scanned.role || scanned.title,
        whenToUse: ui?.whenToUse || '',
        color: ui?.color || '#6B7280',
        commands,
        examplePrompts: ui?.examplePrompts || []
      }
    })

  // Build statusActions: resolve commandRef to full path, skip missing
  const statusActions = resolveStatusActions(overlay, scan, agents)

  // Build projectWorkflows: resolve commandRef to full path, skip missing
  const projectWorkflows = resolveProjectWorkflows(overlay, scan, agents)

  return {
    version: scan.version || '1.0',
    statuses: overlay.statuses,
    transitions: overlay.transitions,
    statusActions,
    agents,
    ...(Object.keys(projectWorkflows).length > 0 && { projectWorkflows })
  }
}

/**
 * Resolve a single workflow command from scan data.
 * Used by the wizard to dynamically discover the correct agent and command path.
 * Returns null if the workflow doesn't exist in the scan.
 *
 * When `fallbackAgentId` is provided and no agent has the workflow in its menu,
 * the command path is still constructed using the provided module info.
 * This handles workflows that exist as command files but aren't listed in
 * any agent's `<menu>` section.
 */
export function resolveCommand(
  commandRef: string,
  commandModule: string,
  commandType: 'workflows' | 'agents',
  scan: BmadScanResult,
  fallbackAgentId?: string
): { agentId: string; command: string } | null {
  if (commandType === 'agents') {
    // Agent command — the commandRef IS the agent ID
    const agent = scan.agents.find(a => a.id === commandRef)
    if (!agent) return null
    return { agentId: commandRef, command: stableCmd(commandModule, commandRef, 'agents') }
  }

  // Workflow command — find which agent has it in their menu
  const match = findAgentForWorkflow(commandRef, commandModule, scan)
  if (match) {
    return { agentId: match.agentId, command: stableCmd(match.actualModule, commandRef, commandType) }
  }

  // No agent has this workflow in their menu — use fallback if provided.
  // The command file may still exist in .claude/commands/ even if no agent menu lists it.
  if (fallbackAgentId) {
    return { agentId: fallbackAgentId, command: stableCmd(commandModule, commandRef, commandType) }
  }

  return null
}
