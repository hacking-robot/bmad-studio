import { AITool, AI_TOOLS } from '../types'

/**
 * Check if tool uses Claude CLI syntax (slash commands)
 */
function usesClaudeSyntax(aiTool: AITool): boolean {
  return aiTool === 'claude-code' || aiTool === 'custom-endpoint'
}

/**
 * Transform a BMAD command based on the selected AI tool.
 *
 * Commands in flow JSON are stored in Claude Code format:
 * - Agent commands: /bmad:bmm:agents:pm
 * - Workflow commands: /bmad:bmm:workflows:dev-story
 *
 * Transformations:
 * - Claude Code/Custom Endpoint: Keep as-is (slash commands)
 * - Cursor/Windsurf/Roo: Convert to universal * syntax
 */
export function transformCommand(command: string | null | undefined, aiTool: AITool): string {
  if (!command) return ''

  const tool = AI_TOOLS.find(t => t.id === aiTool)

  if (usesClaudeSyntax(aiTool)) {
    // Claude CLI uses slash commands as-is
    return command
  }

  // For other tools, convert slash commands to universal * syntax
  // /bmad:bmm:workflows:dev-story -> *dev-story
  // /bmad:bmm:agents:pm -> @pm (agent invocation uses @ prefix)

  // Alpha agent: /bmad:bmm:agents:pm
  const agentMatch = command.match(/^\/bmad:[^:]+:agents:(.+)$/)
  if (agentMatch) {
    return `${tool?.agentPrefix || '@'}${agentMatch[1]}`
  }

  // Stable agent: /bmad-agent-bmm-pm
  const stableAgentMatch = command.match(/^\/bmad-agent-([^-]+)-(.+)$/)
  if (stableAgentMatch) {
    return `${tool?.agentPrefix || '@'}${stableAgentMatch[2]}`
  }

  // Alpha workflow: /bmad:bmm:workflows:dev-story
  const workflowMatch = command.match(/^\/bmad:[^:]+:workflows:(.+)$/)
  if (workflowMatch) {
    return `*${workflowMatch[1]}`
  }

  // Stable workflow: /bmad-bmm-dev-story
  const stableWorkflowMatch = command.match(/^\/bmad-(?!agent-)([^-]+)-(.+)$/)
  if (stableWorkflowMatch) {
    return `*${stableWorkflowMatch[2]}`
  }

  // Fallback: just replace leading / with *
  return command.replace(/^\//, '*')
}

/**
 * Get the agent prefix for the current AI tool
 */
export function getAgentPrefix(aiTool: AITool): string {
  const tool = AI_TOOLS.find(t => t.id === aiTool)
  return tool?.agentPrefix || '@'
}

/**
 * Get display name for the AI tool
 */
export function getToolName(aiTool: AITool): string {
  const tool = AI_TOOLS.find(t => t.id === aiTool)
  return tool?.name || aiTool
}
