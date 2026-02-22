import { StoryContent, AcceptanceCriterion, Task, FileChanges } from '../types'

export function parseStoryContent(markdown: string): StoryContent {
  const lines = markdown.split('\n')

  let description = ''
  const acceptanceCriteria: AcceptanceCriterion[] = []
  const tasks: Task[] = []
  let devNotes = ''
  let fileChanges: FileChanges | undefined

  let currentSection = ''
  let currentTask: Task | null = null
  let descriptionLines: string[] = []
  let devNotesLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track current section
    if (line.startsWith('## Story')) {
      currentSection = 'story'
      continue
    }
    if (line.startsWith('## Acceptance Criteria')) {
      currentSection = 'ac'
      continue
    }
    if (line.startsWith('## Tasks')) {
      currentSection = 'tasks'
      continue
    }
    if (line.startsWith('## Dev Notes')) {
      currentSection = 'devnotes'
      continue
    }
    if (line.startsWith('## Dev Agent Record') || line.startsWith('## Development Record') || line.startsWith('### File List')) {
      // Parse file changes
      if (line.startsWith('### File List')) {
        fileChanges = parseFileChanges(lines.slice(i))
      }
      currentSection = 'agent'
      continue
    }
    if (line.startsWith('## ') || line.startsWith('# ')) {
      currentSection = ''
      continue
    }

    // Parse content based on section
    switch (currentSection) {
      case 'story':
        if (line.trim()) {
          descriptionLines.push(line)
        }
        break

      case 'ac':
        // Match: 1. **AC1: Title** - Description
        const acMatch = line.match(/^\d+\.\s+\*\*([^*]+)\*\*\s*[-–]?\s*(.*)/)
        if (acMatch) {
          const [, titlePart, desc] = acMatch
          const titleMatch = titlePart.match(/AC\d+:\s*(.+)/)
          acceptanceCriteria.push({
            id: `ac-${acceptanceCriteria.length + 1}`,
            title: titleMatch ? titleMatch[1].trim() : titlePart.trim(),
            description: desc.trim()
          })
        }
        break

      case 'tasks':
        // Match task: - [x] Task 1: Description
        const taskMatch = line.match(/^- \[([ xX])\]\s+(?:Task \d+:\s*)?(.+)/)
        if (taskMatch) {
          currentTask = {
            id: `task-${tasks.length + 1}`,
            title: taskMatch[2].trim(),
            completed: taskMatch[1].toLowerCase() === 'x',
            subtasks: []
          }
          tasks.push(currentTask)
        }
        // Match subtask:   - [x] Subtask description
        const subtaskMatch = line.match(/^\s+- \[([ xX])\]\s+(.+)/)
        if (subtaskMatch && currentTask) {
          currentTask.subtasks.push({
            id: `${currentTask.id}-sub-${currentTask.subtasks.length + 1}`,
            title: subtaskMatch[2].trim(),
            completed: subtaskMatch[1].toLowerCase() === 'x'
          })
        }
        break

      case 'devnotes':
        devNotesLines.push(line)
        break
    }
  }

  description = descriptionLines.join('\n').trim()
  devNotes = devNotesLines.join('\n').trim()

  return {
    rawMarkdown: markdown,
    description,
    acceptanceCriteria,
    tasks,
    devNotes,
    fileChanges
  }
}

function parseFileChanges(lines: string[]): FileChanges {
  const created: string[] = []
  const modified: string[] = []
  const verified: string[] = []

  let currentCategory = ''

  for (const line of lines) {
    if (line.includes('**Files Created:**') || line.includes('**Created:**')) {
      currentCategory = 'created'
      continue
    }
    if (line.includes('**Files Modified:**') || line.includes('**Modified:**')) {
      currentCategory = 'modified'
      continue
    }
    if (line.includes('**Verified')) {
      currentCategory = 'verified'
      continue
    }
    if (line.startsWith('### ') || line.startsWith('## ')) {
      currentCategory = ''
      continue
    }

    // Match file path: - `path/to/file.ts`
    const fileMatch = line.match(/^-\s+`([^`]+)`/)
    if (fileMatch && currentCategory) {
      const filePath = fileMatch[1]
      switch (currentCategory) {
        case 'created':
          created.push(filePath)
          break
        case 'modified':
          modified.push(filePath)
          break
        case 'verified':
          verified.push(filePath)
          break
      }
    }
  }

  return { created, modified, verified }
}
