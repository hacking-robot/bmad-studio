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
  let acLines: string[] = []
  let devNotesLines: string[] = []
  let developmentRecordLines: string[] = []
  let inFileList = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track current section (supports both ## headings and **bold:** markers)
    const trimmed = line.trim()
    if (line.startsWith('## Story') || /^### Story\s+\d/.test(line)) {
      currentSection = 'story'
      continue
    }
    if (line.startsWith('## Acceptance Criteria') || /^\*\*Acceptance\s+Criteria/.test(trimmed)) {
      currentSection = 'ac'
      continue
    }
    if (line.startsWith('## Tasks') || /^\*\*Tasks/.test(trimmed)) {
      currentSection = 'tasks'
      continue
    }
    if (line.startsWith('## Dev Notes') || /^\*\*Technical\s+Notes/.test(trimmed)) {
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
        acLines.push(line)
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

      case 'agent':
        // Skip lines inside ### File List (already parsed into fileChanges)
        if (line.startsWith('### File List')) {
          inFileList = true
          continue
        }
        if (inFileList && (line.startsWith('### ') || line.startsWith('## '))) {
          inFileList = false
        }
        if (!inFileList) {
          developmentRecordLines.push(line)
        }
        break
    }
  }

  description = descriptionLines.join('\n').trim()
  devNotes = devNotesLines.join('\n').trim()
  const developmentRecord = developmentRecordLines.join('\n').trim() || undefined
  const acceptanceCriteriaRaw = acceptanceCriteria.length === 0 ? acLines.join('\n').trim() || undefined : undefined

  return {
    rawMarkdown: markdown,
    description,
    acceptanceCriteria,
    acceptanceCriteriaRaw,
    tasks,
    devNotes,
    fileChanges,
    developmentRecord
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
