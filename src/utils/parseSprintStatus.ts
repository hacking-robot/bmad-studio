import { parse } from 'yaml'
import { StoryStatus, normalizeStatus } from '../types'

export interface SprintStatusData {
  generated: string
  project: string
  projectKey: string
  trackingSystem: string
  storyLocation: string
  developmentStatus: Record<string, StoryStatus>
}

export function parseSprintStatus(yamlContent: string): SprintStatusData {
  const parsed = parse(yamlContent)

  const developmentStatus: Record<string, StoryStatus> = {}

  if (parsed.development_status) {
    for (const [key, value] of Object.entries(parsed.development_status)) {
      // Normalize statuses - unrecognized values default to 'backlog'
      developmentStatus[key] = normalizeStatus(value as string) ?? 'backlog'
    }
  }

  return {
    generated: parsed.generated || '',
    project: parsed.project || '',
    projectKey: parsed.project_key || '',
    trackingSystem: parsed.tracking_system || '',
    storyLocation: parsed.story_location || '',
    developmentStatus
  }
}

export function getStoryStatus(
  sprintStatus: SprintStatusData,
  storyKey: string
): StoryStatus {
  return sprintStatus.developmentStatus[storyKey] || 'backlog'
}

export function getEpicStatus(
  sprintStatus: SprintStatusData,
  epicNumber: number
): StoryStatus {
  return sprintStatus.developmentStatus[`epic-${epicNumber}`] || 'backlog'
}
