import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store'

export interface PlanningArtifact {
  name: string
  path: string
  type: 'epics' | 'prd' | 'architecture' | 'design' | 'gdd' | 'brief' | 'other'
  displayName: string
}

// Infer artifact type from filename
function inferArtifactType(filename: string): PlanningArtifact['type'] {
  const lower = filename.toLowerCase()
  if (lower === 'epics.md' || lower.includes('epics')) return 'epics'
  if (lower.includes('prd') || lower.includes('requirements') || lower.includes('product-requirements')) return 'prd'
  if (lower.includes('arch') || lower.includes('architecture') || lower.includes('technical-spec')) return 'architecture'
  if (lower.includes('gdd') || lower.includes('game-design')) return 'gdd'
  if (lower.includes('design') || lower.includes('ux') || lower.includes('ui')) return 'design'
  if (lower.includes('brief') || lower.includes('project-brief')) return 'brief'
  return 'other'
}

// Generate a display name from filename
function generateDisplayName(filename: string): string {
  // Remove .md extension and convert kebab-case to Title Case
  return filename
    .replace(/\.md$/i, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Get the type label for display
export function getArtifactTypeLabel(type: PlanningArtifact['type']): string {
  switch (type) {
    case 'epics': return 'Epics'
    case 'prd': return 'PRD'
    case 'architecture': return 'Architecture'
    case 'gdd': return 'GDD'
    case 'design': return 'Design'
    case 'brief': return 'Brief'
    default: return 'Document'
  }
}

// Get the type color for badges
export function getArtifactTypeColor(type: PlanningArtifact['type']): string {
  switch (type) {
    case 'epics': return '#e91e63' // pink
    case 'prd': return '#1976d2' // blue
    case 'architecture': return '#7b1fa2' // purple
    case 'gdd': return '#00838f' // cyan
    case 'design': return '#f57c00' // orange
    case 'brief': return '#388e3c' // green
    default: return '#757575' // grey
  }
}

export function usePlanningArtifacts() {
  const projectPath = useStore((state) => state.projectPath)
  const projectType = useStore((state) => state.projectType)
  const outputFolder = useStore((state) => state.outputFolder)
  const [artifacts, setArtifacts] = useState<PlanningArtifact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadArtifacts = useCallback(async () => {
    if (!projectPath || !projectType) {
      setArtifacts([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Try multiple possible locations for planning artifacts
      // Order matters - first found wins for duplicate filenames
      const possiblePaths = [
        // Primary BMAD output locations
        `${projectPath}/${outputFolder}/planning-artifacts`,
        `${projectPath}/${outputFolder}`,
        // Alternative docs locations
        `${projectPath}/docs/planning-artifacts`,
        `${projectPath}/docs/planning`,
        `${projectPath}/docs`,
        // Root level (some projects keep docs here)
        projectPath
      ]

      const foundArtifacts: PlanningArtifact[] = []
      const seenPaths = new Set<string>() // Avoid duplicates

      for (const dirPath of possiblePaths) {
        const result = await window.fileAPI.listDirectory(dirPath)
        if (!result.files || result.files.length === 0) continue

        // Process markdown files and discover subdirectories
        const mdFiles = result.files.filter(f => f.endsWith('.md'))
        const subDirs = result.dirs || []

        for (const file of mdFiles) {
          const filePath = `${dirPath}/${file}`

          // Skip if we've already found this file in a higher priority location
          if (seenPaths.has(file)) continue

          // Skip story files and certain non-planning files
          if (file.startsWith('story-')) continue
          if (file === 'README.md' || file === 'CHANGELOG.md' || file === 'CONTRIBUTING.md') continue
          if (file === 'CLAUDE.md' || file === 'LICENSE.md') continue

          // Skip files in implementation-artifacts (those are story files)
          if (dirPath.includes('implementation-artifacts')) continue

          // Only include files that look like planning documents
          const type = inferArtifactType(file)
          // For 'other' type at root/docs level, be more selective
          if (type === 'other' && (dirPath === projectPath || dirPath === `${projectPath}/docs`)) {
            // Only include if it has planning-related keywords
            const lower = file.toLowerCase()
            if (!lower.includes('spec') && !lower.includes('plan') && !lower.includes('doc')) continue
          }

          seenPaths.add(file)
          foundArtifacts.push({
            name: file,
            path: filePath,
            type,
            displayName: generateDisplayName(file)
          })
        }

        // Scan subdirectories for planning artifacts.
        // BMAD places brainstorming/ and research/ as siblings to planning-artifacts/
        // (i.e. directly under the output folder), so scan subdirs for both
        // the planning-artifacts dir and the output folder itself.
        const isOutputFolder = dirPath === `${projectPath}/${outputFolder}`
        if (dirPath.includes('planning-artifacts') || isOutputFolder) {
          for (const subDir of subDirs) {
            if (subDir === 'implementation-artifacts') continue
            if (subDir === 'planning-artifacts') continue
            // Skip hidden dirs and node_modules
            if (subDir.startsWith('.') || subDir === 'node_modules') continue
            const subResult = await window.fileAPI.listDirectory(`${dirPath}/${subDir}`)
            if (!subResult.files) continue
            const subMdFiles = subResult.files.filter(f => f.endsWith('.md') && f !== 'CLAUDE.md' && f !== 'README.md')
            for (const file of subMdFiles) {
              const filePath = `${dirPath}/${subDir}/${file}`
              const qualifiedName = `${subDir}/${file}`
              if (seenPaths.has(qualifiedName)) continue
              seenPaths.add(qualifiedName)
              foundArtifacts.push({
                name: file,
                path: filePath,
                type: inferArtifactType(file),
                displayName: `${generateDisplayName(subDir)}: ${generateDisplayName(file)}`
              })
            }
          }
        }
      }

      // Sort by type priority, then by name
      const typePriority: Record<PlanningArtifact['type'], number> = {
        epics: 0,
        brief: 1,
        prd: 2,
        gdd: 3,
        architecture: 4,
        design: 5,
        other: 6
      }

      foundArtifacts.sort((a, b) => {
        const priorityDiff = typePriority[a.type] - typePriority[b.type]
        if (priorityDiff !== 0) return priorityDiff
        return a.displayName.localeCompare(b.displayName)
      })

      setArtifacts(foundArtifacts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load planning artifacts')
    } finally {
      setLoading(false)
    }
  }, [projectPath, projectType, outputFolder])

  // Load artifacts when project changes
  useEffect(() => {
    loadArtifacts()
  }, [loadArtifacts])

  return {
    artifacts,
    loading,
    error,
    refresh: loadArtifacts
  }
}
