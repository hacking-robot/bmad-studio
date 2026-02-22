import { Epic, Story } from '../types'
import type { SprintStatusData } from './parseSprintStatus'
import { getStoryStatus, getEpicStatus } from './parseSprintStatus'

interface ParsedStory {
  title: string
  storyNumber: number
  description: string // Full user story text from epics.md
  acceptanceCriteriaPreview?: string[]  // First 3 AC items
  technicalNotes?: string               // Technical Notes section
  frsAddressed?: string[]               // FRs addressed list
}

interface ParsedEpic {
  id: number
  name: string
  goal: string
  stories: ParsedStory[]
}

export function parseEpics(
  markdownContent: string,
  sprintStatus: SprintStatusData
): Epic[] {
  const lines = markdownContent.split('\n')
  const epics: ParsedEpic[] = []
  let currentEpic: ParsedEpic | null = null
  let currentStory: ParsedStory | null = null
  let storyDescriptionLines: string[] = []
  let inStoriesSection = false
  let storyNumber = 0

  const finishCurrentStory = () => {
    if (currentStory && currentEpic) {
      const fullText = storyDescriptionLines.join('\n')

      // Extract the user story description (before any section headers)
      const description = fullText
        .split(/\*\*Acceptance Criteria:?\*\*/i)[0]
        .split(/\*\*Technical Notes:?\*\*/i)[0]
        .split(/\*\*FRs addressed:?\*\*/i)[0]
        .split(/\*\*Requirements:?\*\*/i)[0]
        .trim()
      if (description) {
        currentStory.description = description
      }

      // Extract Acceptance Criteria section
      const acMatch = fullText.match(/\*\*Acceptance Criteria:?\*\*\s*([\s\S]*?)(?=\*\*Technical Notes:?\*\*|\*\*FRs addressed:?\*\*|\*\*Requirements:?\*\*|---\s*$|$)/i)
      if (acMatch) {
        const acItems = acMatch[1].trim()
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('-') || line.startsWith('*') || line.startsWith('- ['))
          .map(line => line.replace(/^[-*]\s*(\[.\]\s*)?/, '').trim())
          .filter(Boolean)
        if (acItems.length > 0) {
          currentStory.acceptanceCriteriaPreview = acItems.slice(0, 3)
        }
      }

      // Extract Technical Notes section
      const techMatch = fullText.match(/\*\*Technical Notes:?\*\*\s*([\s\S]*?)(?=\*\*Acceptance Criteria:?\*\*|\*\*FRs addressed:?\*\*|\*\*Requirements:?\*\*|---\s*$|$)/i)
      if (techMatch) {
        const techText = techMatch[1].trim()
        if (techText) {
          currentStory.technicalNotes = techText
        }
      }

      // Extract FRs addressed section
      const frsMatch = fullText.match(/\*\*FRs addressed:?\*\*\s*([\s\S]*?)(?=\*\*Acceptance Criteria:?\*\*|\*\*Technical Notes:?\*\*|\*\*Requirements:?\*\*|---\s*$|$)/i)
      if (frsMatch) {
        const frsItems = frsMatch[1].trim()
          .split(/[,\n]/)
          .map(item => item.trim())
          .filter(Boolean)
        if (frsItems.length > 0) {
          currentStory.frsAddressed = frsItems
        }
      }

      currentEpic.stories.push(currentStory)
      currentStory = null
      storyDescriptionLines = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Match Epic header: ## Epic 1: Name (combined) or # Epic 1: Name (sharded)
    const epicMatch = line.match(/^#{1,2} Epic (\d+): (.+)$/)
    if (epicMatch) {
      finishCurrentStory()
      if (currentEpic) {
        epics.push(currentEpic)
      }
      currentEpic = {
        id: parseInt(epicMatch[1]),
        name: epicMatch[2].trim(),
        goal: '',
        stories: []
      }
      inStoriesSection = false
      storyNumber = 0
      continue
    }

    // Match Goal section: ### Goal (multi-line) or **Goal:** / **Epic Goal:** inline
    if (currentEpic && !currentStory && line.startsWith('### Goal')) {
      let goalLines: string[] = []
      for (let j = i + 1; j < lines.length && !lines[j].startsWith('#'); j++) {
        if (lines[j].trim()) {
          goalLines.push(lines[j].trim())
        }
        if (goalLines.length >= 2) break
      }
      currentEpic.goal = goalLines.join(' ')
      continue
    }
    if (currentEpic && !currentStory && line.startsWith('**Goal:**')) {
      currentEpic.goal = line.replace('**Goal:**', '').trim()
      continue
    }
    if (currentEpic && !currentStory && line.match(/^\*\*Epic Goal:\*\*/)) {
      currentEpic.goal = line.replace(/^\*\*Epic Goal:\*\*\s*/, '').trim()
      continue
    }

    // Match Stories section
    if (currentEpic && (line.startsWith('### Stories') || line.startsWith('## Stories'))) {
      finishCurrentStory()
      inStoriesSection = true
      continue
    }

    // Match heading format: ### Story 1.3: Title
    // This works with or without a ### Stories section header
    if (currentEpic) {
      const headingMatch = line.match(/^### Story \d+\.(\d+):\s*(.+)$/)
      if (headingMatch) {
        finishCurrentStory()
        inStoriesSection = true
        storyNumber = parseInt(headingMatch[1])
        const title = stripMarkdown(headingMatch[2].trim())
        currentStory = { title, storyNumber, description: title }
        continue
      }
    }

    // Match numbered story lines (only inside ### Stories section, not while collecting story body)
    if (currentEpic && inStoriesSection && !currentStory) {
      const numberedMatch = line.match(/^\d+\.\s+(.+)$/)
      if (numberedMatch) {
        storyNumber++
        const fullText = stripMarkdown(numberedMatch[1].trim())
        const title = extractStoryTitle(fullText)
        currentEpic.stories.push({ title, storyNumber, description: fullText })
        continue
      }
    }

    // Stop stories section on a new ## heading (but not ### which are story headers)
    if (currentEpic && inStoriesSection && line.match(/^## /) && !line.match(/^## Stories/)) {
      finishCurrentStory()
      inStoriesSection = false
      storyNumber = 0
    }

    // Collect story description lines (for ### Story heading format)
    if (currentStory) {
      storyDescriptionLines.push(line)
    }
  }

  // Don't forget the last story and epic
  finishCurrentStory()
  if (currentEpic) {
    epics.push(currentEpic)
  }

  // Convert to Epic[] with status information
  return epics.map((epic) => {
    const epicStatus = getEpicStatus(sprintStatus, epic.id)

    const stories: Story[] = epic.stories.map((story) => {
      // Generate the story key for status lookup
      const slug = generateSlug(story.title)
      const storyKey = `${epic.id}-${story.storyNumber}-${slug}`

      return {
        id: storyKey,
        epicId: epic.id,
        storyNumber: story.storyNumber,
        title: story.title,
        slug,
        status: getStoryStatus(sprintStatus, storyKey),
        epicDescription: story.description || undefined,
        acceptanceCriteriaPreview: story.acceptanceCriteriaPreview,
        technicalNotes: story.technicalNotes,
        frsAddressed: story.frsAddressed
      }
    })

    return {
      id: epic.id,
      name: epic.name,
      goal: epic.goal,
      status: epicStatus,
      stories
    }
  })
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold** → bold
    .replace(/\*(.+?)\*/g, '$1')     // *italic* → italic
    .replace(/__(.+?)__/g, '$1')     // __bold__ → bold
    .replace(/_(.+?)_/g, '$1')       // _italic_ → italic
    .replace(/`(.+?)`/g, '$1')       // `code` → code
}

function extractStoryTitle(text: string): string {
  // Strip markdown formatting before parsing
  const clean = stripMarkdown(text)
  // Try to extract action from "As a X, I [verb] Y so that Z" format
  // Matches common verbs: can, want, see, use, have, am able to, etc.
  const userStoryMatch = clean.match(/^As a .+?, I (?:can |want to |see |use |have |am able to |no longer |clearly )?(.+?)(?:,| so that|$)/)
  if (userStoryMatch) {
    let title = userStoryMatch[1].trim()
    title = title.replace(/^to\s+/, '') // Remove leading "to"
    title = title.charAt(0).toUpperCase() + title.slice(1) // Capitalize
    return title
  }
  // Fall back to full text (truncated if too long)
  return clean.length > 80 ? clean.substring(0, 77) + '...' : clean
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50) // Limit length
}

export function getAllStories(epics: Epic[]): Story[] {
  return epics.flatMap((epic) => epic.stories)
}
