import { useMemo } from 'react'
import flowBmm from '../data/flow-bmm-stable.json'
import flowGds from '../data/flow-gds.json'
import { useStore } from '../store'
import type { StoryStatus, ProjectType } from '../types'
import type { WorkflowConfig, StatusDefinition, AgentDefinition, NextStepAction, ProjectWorkflowPhase } from '../types/flow'

// Cast the imported JSON to our typed configs
const workflowBmm = flowBmm as unknown as WorkflowConfig
const workflowGds = flowGds as unknown as WorkflowConfig

// Get workflow config for a specific project type
function getWorkflowForType(projectType: ProjectType | null): WorkflowConfig {
  if (projectType === 'gds') {
    return workflowGds
  }
  return workflowBmm
}

export function useWorkflow() {
  const projectType = useStore((state) => state.projectType)
  const scannedConfig = useStore((state) => state.scannedWorkflowConfig)

  // Memoize the helper functions based on project type
  const helpers = useMemo(() => {
    // Prefer scanned config when available, fall back to static
    const workflow = scannedConfig || getWorkflowForType(projectType)

    return {
      // Get all statuses
      statuses: workflow.statuses,

      // Get all agents
      agents: workflow.agents,

      // Get all transitions
      transitions: workflow.transitions,

      // Get a specific status definition
      getStatus: (id: StoryStatus): StatusDefinition | undefined => {
        return workflow.statuses.find((s) => s.id === id)
      },

      // Get visible statuses for the board (in display order)
      getVisibleStatuses: (): StatusDefinition[] => {
        return workflow.statuses
          .filter((s) => s.visible)
          .sort((a, b) => a.displayOrder - b.displayOrder)
      },

      // Get next steps for a status
      getNextSteps: (status: StoryStatus): NextStepAction[] => {
        return workflow.statusActions[status]?.nextSteps || []
      },

      // Get the primary next step for a status (if any)
      getPrimaryNextStep: (status: StoryStatus): NextStepAction | undefined => {
        const steps = workflow.statusActions[status]?.nextSteps || []
        return steps.find((s) => s.primary) || steps[0]
      },

      // Get an agent by ID
      getAgent: (id: string): AgentDefinition | undefined => {
        return workflow.agents.find((a) => a.id === id)
      },

      // Get agent name by ID (for display)
      getAgentName: (id: string): string => {
        const agent = workflow.agents.find((a) => a.id === id)
        return agent ? `${agent.role} (${agent.name})` : id
      },

      // Get valid transitions from a status
      getValidTransitions: (fromStatus: StoryStatus): StoryStatus[] => {
        return workflow.transitions
          .filter((t) => t.from === fromStatus)
          .map((t) => t.to as StoryStatus)
      },

      // Check if a transition is valid
      isValidTransition: (from: StoryStatus, to: StoryStatus): boolean => {
        return workflow.transitions.some((t) => t.from === from && t.to === to)
      },

      // Get project-level workflows grouped by phase
      getProjectWorkflows: (): Record<string, ProjectWorkflowPhase> => {
        return workflow.projectWorkflows || {}
      }
    }
  }, [projectType, scannedConfig])

  return helpers
}

// Export functions for direct access when needed
export function getWorkflow(projectType: ProjectType | null): WorkflowConfig {
  return getWorkflowForType(projectType)
}

// Export workflow configs for components that need direct access
export { workflowBmm, workflowGds }
