import { Epic, Story } from '../types'
import type { SprintStatusData } from './parseSprintStatus'
import { getStoryStatus, getEpicStatus } from './parseSprintStatus'

interface ParsedStory {
  title: string
  storyNumber: number
  description: string // User story from epics.md (As a... I want... So that...)
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

export function parseBmmEpics(
  markdownContent: string,
  sprintStatus: SprintStatusData
): Epic[] {
  const lines = markdownContent.split('\n')
  const epics: ParsedEpic[] = []
  let currentEpic: ParsedEpic | null = null
  let currentStory: ParsedStory | null = null
  let storyDescriptionLines: string[] = []
  let inStoriesSection = false
  let numberedStoryCount = 0

  const finishCurrentStory = () => {
    if (currentStory && currentEpic) {
      const fullText = storyDescriptionLines.join('\n')

      // Extract the user story description (before any section headers)
      const description = fullText
        .split(/\*\*Acceptance Criteria:\*\*/i)[0]
        .split(/\*\*Technical Notes:\*\*/i)[0]
        .split(/\*\*FRs addressed:\*\*/i)[0]
        .trim()
      currentStory.description = description

      // Extract Acceptance Criteria section
      const acMatch = fullText.match(/\*\*Acceptance Criteria:\*\*\s*([\s\S]*?)(?=\*\*Technical Notes:\*\*|\*\*FRs addressed:\*\*|$)/i)
      if (acMatch) {
        const acText = acMatch[1].trim()
        // Parse bullet points (lines starting with - or *)
        const acItems = acText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('-') || line.startsWith('*'))
          .map(line => line.replace(/^[-*]\s*/, '').trim())
          .filter(Boolean)
        if (acItems.length > 0) {
          currentStory.acceptanceCriteriaPreview = acItems.slice(0, 3) // First 3 items
        }
      }

      // Extract Technical Notes section
      const techMatch = fullText.match(/\*\*Technical Notes:\*\*\s*([\s\S]*?)(?=\*\*Acceptance Criteria:\*\*|\*\*FRs addressed:\*\*|$)/i)
      if (techMatch) {
        const techText = techMatch[1].trim()
        if (techText) {
          currentStory.technicalNotes = techText
        }
      }

      // Extract FRs addressed section
      const frsMatch = fullText.match(/\*\*FRs addressed:\*\*\s*([\s\S]*?)(?=\*\*Acceptance Criteria:\*\*|\*\*Technical Notes:\*\*|$)/i)
      if (frsMatch) {
        const frsText = frsMatch[1].trim()
        // Parse as comma-separated or line-separated list
        const frsItems = frsText
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

    // Match Epic header: ## Epic 1: Name or # Epic 1: Name (sharded)
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
      numberedStoryCount = 0
      continue
    }

    // Match BMM Goal format: **Goal:** text here or ### Goal section
    if (currentEpic && line.startsWith('**Goal:**')) {
      currentEpic.goal = line.replace('**Goal:**', '').trim()
      continue
    }
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
    // Sharded format: **Epic Goal:** text on same line
    if (currentEpic && !currentStory && line.match(/^\*\*Epic Goal:\*\*/)) {
      currentEpic.goal = line.replace(/^\*\*Epic Goal:\*\*\s*/, '').trim()
      continue
    }

    // Match Stories section header (for numbered list format)
    if (currentEpic && (line.startsWith('### Stories') || line.startsWith('## Stories'))) {
      finishCurrentStory()
      inStoriesSection = true
      continue
    }

    // Match BMM Story header: ### Story 1.1: Title Here
    const storyMatch = line.match(/^### Story (\d+)\.(\d+): (.+)$/)
    if (storyMatch && currentEpic) {
      finishCurrentStory()
      inStoriesSection = true
      const epicNumber = parseInt(storyMatch[1])
      const storyNumber = parseInt(storyMatch[2])
      const title = stripMarkdown(storyMatch[3].trim())

      // Only add if this story belongs to the current epic
      if (epicNumber === currentEpic.id) {
        currentStory = { title, storyNumber, description: '' }
      }
      continue
    }

    // Match numbered story lines (inside ### Stories section)
    if (currentEpic && inStoriesSection && !currentStory) {
      const numberedMatch = line.match(/^\d+\.\s+(.+)$/)
      if (numberedMatch) {
        numberedStoryCount++
        const fullText = stripMarkdown(numberedMatch[1].trim())
        const title = extractStoryTitle(fullText)
        currentEpic.stories.push({ title, storyNumber: numberedStoryCount, description: fullText })
        continue
      }
    }

    // Stop stories section on a new ## heading
    if (currentEpic && inStoriesSection && line.match(/^## /) && !line.match(/^## Stories/)) {
      finishCurrentStory()
      inStoriesSection = false
      numberedStoryCount = 0
    }

    // Collect story description lines
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
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
}

function extractStoryTitle(text: string): string {
  const clean = stripMarkdown(text)
  const userStoryMatch = clean.match(/^As a .+?, I (?:can |want to |see |use |have |am able to |no longer |clearly )?(.+?)(?:,| so that|$)/)
  if (userStoryMatch) {
    let title = userStoryMatch[1].trim()
    title = title.replace(/^to\s+/, '')
    title = title.charAt(0).toUpperCase() + title.slice(1)
    return title
  }
  return clean.length > 80 ? clean.substring(0, 77) + '...' : clean
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50)
}
