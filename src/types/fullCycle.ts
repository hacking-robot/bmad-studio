// Full Cycle Automation Types

export type FullCycleStepType = 'git' | 'agent' | 'status'

export type FullCycleStepStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'error'

export interface FullCycleStep {
  id: string
  name: string
  type: FullCycleStepType
  description: string
  // For agent steps
  agentId?: string
  command?: string
  // For git steps
  gitAction?: 'create-branch' | 'commit' | 'merge'
  commitMessage?: string
}

export interface FullCycleState {
  isRunning: boolean
  storyId: string | null
  currentStep: number
  totalSteps: number
  stepName: string
  stepType: FullCycleStepType
  stepStatus: FullCycleStepStatus
  error: string | null
  logs: string[]
  sessionId: string | null // For Claude session continuity
  minimized: boolean
  // Track step statuses for the stepper
  stepStatuses: FullCycleStepStatus[]
  // Timestamps for duration tracking
  startTime: number | null
  stepStartTime: number | null
}

// Initial state for the full cycle
export const initialFullCycleState: FullCycleState = {
  isRunning: false,
  storyId: null,
  currentStep: 0,
  totalSteps: 0,
  stepName: '',
  stepType: 'agent',
  stepStatus: 'pending',
  error: null,
  logs: [],
  sessionId: null,
  minimized: false,
  stepStatuses: [],
  startTime: null,
  stepStartTime: null
}

// Epic Cycle types
export type EpicStoryStatus = 'pending' | 'running' | 'completed' | 'error'

export interface EpicCycleState {
  isRunning: boolean
  epicId: number | null
  storyQueue: string[]          // ordered story IDs to process
  currentStoryIndex: number     // index into storyQueue
  storyStatuses: EpicStoryStatus[]  // per-story status
  startTime: number | null
  error: string | null
}

export const initialEpicCycleState: EpicCycleState = {
  isRunning: false,
  epicId: null,
  storyQueue: [],
  currentStoryIndex: 0,
  storyStatuses: [],
  startTime: null,
  error: null
}

// Helper to build a stable-format command path
function buildCommand(module: string, type: 'workflows' | 'agents', name: string): string {
  return type === 'agents'
    ? `/bmad-agent-${module}-${name}`
    : `/bmad-${module}-${name}`
}

// Build full cycle steps dynamically based on project type and review count
export function buildFullCycleSteps(projectType: 'bmm' | 'gds', reviewCount: number): FullCycleStep[] {
  const isGds = projectType === 'gds'
  const module = isGds ? 'gds' : 'bmm'
  const devAgentId = isGds ? 'game-dev' : 'dev'
  const smAgentId = isGds ? 'game-scrum-master' : 'sm'
  const createStoryCommand = buildCommand(module, 'workflows', 'create-story')
  const devStoryCommand = buildCommand(module, 'workflows', 'dev-story')
  const codeReviewCommand = buildCommand(module, 'workflows', 'code-review')
  const smDesc = isGds ? 'Game Scrum Master' : 'SM'
  const devDesc = isGds ? 'Game DEV' : 'DEV'

  const steps: FullCycleStep[] = [
    {
      id: 'create-story',
      name: 'Create Story File',
      type: 'agent',
      description: `${smDesc} agent creates story markdown with acceptance criteria`,
      agentId: smAgentId,
      command: createStoryCommand
    },
    {
      id: 'create-branch',
      name: 'Create Git Branch',
      type: 'git',
      description: 'Create a feature branch for this story',
      gitAction: 'create-branch'
    },
    {
      id: 'commit-story',
      name: 'Commit Story',
      type: 'git',
      description: 'Commit the new story file',
      gitAction: 'commit',
      commitMessage: 'docs: add story file'
    },
    {
      id: 'implement',
      name: 'Implement Story',
      type: 'agent',
      description: `${devDesc} agent implements the feature`,
      agentId: devAgentId,
      command: devStoryCommand
    },
    {
      id: 'commit-implementation',
      name: 'Commit Implementation',
      type: 'git',
      description: 'Commit all implementation changes',
      gitAction: 'commit',
      commitMessage: 'feat: implement story'
    }
  ]

  // Add review rounds
  for (let i = 1; i <= reviewCount; i++) {
    const isLast = i === reviewCount
    steps.push({
      id: `code-review-${i}`,
      name: `Code Review #${i}`,
      type: 'agent',
      description: i === 1 ? `${devDesc} agent reviews the code` : `${devDesc} review #${i} for verification`,
      agentId: devAgentId,
      command: codeReviewCommand
    })
    steps.push({
      id: `commit-review-${i}`,
      name: isLast && i > 1 ? 'Commit Final Fixes' : 'Commit Review Fixes',
      type: 'git',
      description: isLast && i > 1 ? 'Commit any remaining fixes' : `Commit any fixes from review #${i}`,
      gitAction: 'commit',
      commitMessage: isLast && i > 1 ? 'fix: final review fixes' : 'fix: address code review feedback'
    })
  }

  // Suffix steps
  steps.push(
    {
      id: 'mark-done',
      name: 'Mark Done',
      type: 'status',
      description: 'Update story status to done'
    },
    {
      id: 'commit-done',
      name: 'Commit Status',
      type: 'git',
      description: 'Commit the done status update',
      gitAction: 'commit',
      commitMessage: 'docs: mark story as done'
    },
    {
      id: 'merge-to-base',
      name: 'Merge to Base',
      type: 'git',
      description: 'Merge story branch back to base branch',
      gitAction: 'merge'
    }
  )

  return steps
}

