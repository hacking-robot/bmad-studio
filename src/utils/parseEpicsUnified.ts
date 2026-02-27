import { Epic } from '../types'
import type { SprintStatusData } from './parseSprintStatus'
import { parseEpics as parseBmgdEpics, getAllStories } from './parseEpics'
import { parseBmmEpics } from './parseBmmEpics'
import type { ProjectType } from './projectTypes'

export function parseEpicsUnified(
  markdownContent: string,
  sprintStatus: SprintStatusData,
  projectType: ProjectType
): Epic[] {
  if (projectType === 'bmm') {
    return parseBmmEpics(markdownContent, sprintStatus)
  } else {
    return parseBmgdEpics(markdownContent, sprintStatus)
  }
}

// Re-export for convenience
export { getAllStories }
