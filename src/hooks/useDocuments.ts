import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store'
import type { VirtualFileReader } from '../utils/remoteFileReader'

// Extended type union covering all artifact/document types
export type DocumentType =
  | 'epics' | 'prd' | 'architecture' | 'design' | 'gdd' | 'brief'
  | 'test' | 'story' | 'sprint' | 'review' | 'creative' | 'other'

export interface DocumentFile {
  name: string
  path: string
  displayName: string
  type: DocumentType
}

export interface DocumentFolder {
  id: string             // e.g. "planning-artifacts", "test-artifacts"
  label: string          // e.g. "Planning Artifacts", "Test Artifacts"
  module: string | null  // e.g. "bmm", "tea", null for mixed/unknown
  path: string           // absolute path
  files: DocumentFile[]
}

// Re-export as PlanningArtifact for backward compatibility
export type PlanningArtifact = DocumentFile

// Module-to-subfolder mapping (derived from BMAD module config analysis)
const MODULE_FOLDERS: Record<string, { subfolders: string[], label: string }> = {
  bmm: { subfolders: ['planning-artifacts', 'implementation-artifacts'], label: 'BMM' },
  gds: { subfolders: ['planning-artifacts', 'implementation-artifacts'], label: 'GDS' },
  bmb: { subfolders: ['bmb-creations'], label: 'Builder' },
  tea: { subfolders: ['test-artifacts'], label: 'TEA' },
}

// Folder display labels
const FOLDER_LABELS: Record<string, string> = {
  'planning-artifacts': 'Planning Artifacts',
  'implementation-artifacts': 'Implementation Artifacts',
  'bmb-creations': 'BMB Creations',
  'test-artifacts': 'Test Artifacts',
  'docs': 'Project Knowledge',
}

// Folder priority for sorting
const FOLDER_PRIORITY: Record<string, number> = {
  'planning-artifacts': 0,
  'implementation-artifacts': 1,
  'test-artifacts': 2,
  'bmb-creations': 3,
  'docs': 4,
}

// Infer artifact type from filename
export function inferArtifactType(filename: string): DocumentType {
  const lower = filename.toLowerCase()
  if (lower === 'epics.md' || lower.includes('epics')) return 'epics'
  if (lower.includes('prd') || lower.includes('requirements') || lower.includes('product-requirements')) return 'prd'
  if (lower.includes('arch') || lower.includes('architecture') || lower.includes('technical-spec')) return 'architecture'
  if (lower.includes('gdd') || lower.includes('game-design')) return 'gdd'
  if (lower.includes('design-thinking') || lower.includes('brainstorm') || lower.includes('ideation')) return 'creative'
  if (lower.includes('design') || lower.includes('ux') || lower.includes('ui')) return 'design'
  if (lower.includes('brief') || lower.includes('project-brief')) return 'brief'
  if (lower.includes('test') || lower.includes('traceability') || lower.includes('qa')) return 'test'
  if (lower.includes('sprint') || lower.includes('status')) return 'sprint'
  if (lower.includes('review')) return 'review'
  if (lower.startsWith('story-')) return 'story'
  return 'other'
}

// Generate a display name from filename
export function generateDisplayName(filename: string): string {
  return filename
    .replace(/\.(md|yaml|yml)$/i, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Get the type label for display
export function getArtifactTypeLabel(type: DocumentType): string {
  switch (type) {
    case 'epics': return 'Epics'
    case 'prd': return 'PRD'
    case 'architecture': return 'Architecture'
    case 'gdd': return 'GDD'
    case 'design': return 'Design'
    case 'brief': return 'Brief'
    case 'test': return 'Test'
    case 'sprint': return 'Sprint'
    case 'review': return 'Review'
    case 'creative': return 'Creative'
    case 'story': return 'Story'
    default: return 'Document'
  }
}

// Get the type color for badges
export function getArtifactTypeColor(type: DocumentType): string {
  switch (type) {
    case 'epics': return '#e91e63'    // pink
    case 'prd': return '#1976d2'      // blue
    case 'architecture': return '#7b1fa2' // purple
    case 'gdd': return '#00838f'      // cyan
    case 'design': return '#f57c00'   // orange
    case 'brief': return '#388e3c'    // green
    case 'test': return '#0097a7'     // teal
    case 'sprint': return '#5c6bc0'   // indigo
    case 'review': return '#ab47bc'   // light purple
    case 'creative': return '#ff7043' // deep orange
    case 'story': return '#78909c'    // blue-grey
    default: return '#757575'         // grey
  }
}

const SKIP_FILES = new Set(['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'CLAUDE.md', 'LICENSE.md'])

// Which module owns a given subfolder
function findModuleForFolder(subfolder: string, modules: string[]): string | null {
  for (const mod of modules) {
    const mapping = MODULE_FOLDERS[mod]
    if (mapping && mapping.subfolders.includes(subfolder)) {
      return mod
    }
  }
  return null
}

function getModuleLabel(mod: string | null): string | null {
  if (!mod) return null
  return MODULE_FOLDERS[mod]?.label || mod.toUpperCase()
}

async function scanFolder(dirPath: string, reader?: VirtualFileReader): Promise<{ mdFiles: string[], yamlFiles: string[], subDirs: string[] }> {
  try {
    const result = reader
      ? await reader.listDirectory(dirPath)
      : await window.fileAPI.listDirectory(dirPath)
    const files = result.files || []
    const dirs = result.dirs || []
    return {
      mdFiles: files.filter(f => f.endsWith('.md') && !SKIP_FILES.has(f)),
      yamlFiles: files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml')),
      subDirs: dirs.filter(d => !d.startsWith('.') && d !== 'node_modules'),
    }
  } catch {
    return { mdFiles: [], yamlFiles: [], subDirs: [] }
  }
}

function buildDocumentFile(filename: string, filePath: string, parentLabel?: string): DocumentFile {
  const displayName = parentLabel
    ? `${parentLabel}: ${generateDisplayName(filename)}`
    : generateDisplayName(filename)
  return {
    name: filename,
    path: filePath,
    type: inferArtifactType(filename),
    displayName,
  }
}

export function useDocuments() {
  const projectPath = useStore((state) => state.projectPath)
  const projectType = useStore((state) => state.projectType)
  const outputFolder = useStore((state) => state.outputFolder)
  const bmadScanResult = useStore((state) => state.bmadScanResult)
  const documentsRevision = useStore((state) => state.documentsRevision)
  const [folders, setFolders] = useState<DocumentFolder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDocuments = useCallback(async () => {
    if (!projectPath || !projectType) {
      setFolders([])
      return
    }

    setLoading(true)
    setError(null)

    // Both modes now have checked-out working trees, so no custom reader needed
    const reader = undefined

    try {
      const modules = bmadScanResult?.modules || []
      const outputBase = `${projectPath}/${outputFolder}`
      const foundFolders: DocumentFolder[] = []

      // Build set of known subfolders from installed modules
      const knownSubfolders = new Set<string>()
      for (const mod of modules) {
        const mapping = MODULE_FOLDERS[mod]
        if (mapping) {
          for (const sf of mapping.subfolders) knownSubfolders.add(sf)
        }
      }

      // Scan the output folder root to discover all subfolders and root-level files
      const rootScan = await scanFolder(outputBase, reader)

      // Scan each known subfolder (from installed modules)
      for (const subDir of rootScan.subDirs) {
        const subDirPath = `${outputBase}/${subDir}`
        const scan = await scanFolder(subDirPath, reader)
        const allFiles: DocumentFile[] = []

        // Collect files in this subfolder
        for (const f of [...scan.mdFiles, ...scan.yamlFiles]) {
          allFiles.push(buildDocumentFile(f, `${subDirPath}/${f}`))
        }

        // Scan one level deeper for nested subdirs (e.g. test-artifacts/test-design/)
        for (const nestedDir of scan.subDirs) {
          const nestedPath = `${subDirPath}/${nestedDir}`
          const nestedScan = await scanFolder(nestedPath, reader)
          const nestedLabel = generateDisplayName(nestedDir)
          for (const f of [...nestedScan.mdFiles, ...nestedScan.yamlFiles]) {
            allFiles.push(buildDocumentFile(f, `${nestedPath}/${f}`, nestedLabel))
          }
        }

        if (allFiles.length === 0) continue

        // Sort files by type priority then name
        allFiles.sort((a, b) => a.displayName.localeCompare(b.displayName))

        const mod = findModuleForFolder(subDir, modules)
        foundFolders.push({
          id: subDir,
          label: FOLDER_LABELS[subDir] || generateDisplayName(subDir),
          module: mod,
          path: subDirPath,
          files: allFiles,
        })
      }

      // Collect root-level output files (e.g. CIS design-thinking-*.md)
      const rootFiles: DocumentFile[] = []
      for (const f of [...rootScan.mdFiles, ...rootScan.yamlFiles]) {
        rootFiles.push(buildDocumentFile(f, `${outputBase}/${f}`))
      }
      if (rootFiles.length > 0) {
        rootFiles.sort((a, b) => a.displayName.localeCompare(b.displayName))
        foundFolders.push({
          id: '_root',
          label: 'Other',
          module: null,
          path: outputBase,
          files: rootFiles,
        })
      }

      // If bmm or gds is installed, also scan {projectPath}/docs for project knowledge
      const hasBmmOrGds = modules.some(m => m === 'bmm' || m === 'gds')
      if (hasBmmOrGds) {
        const docsPath = `${projectPath}/docs`
        const docsScan = await scanFolder(docsPath, reader)
        const docsFiles: DocumentFile[] = []

        for (const f of [...docsScan.mdFiles, ...docsScan.yamlFiles]) {
          // Skip story files and implementation artifacts in docs
          if (f.startsWith('story-')) continue
          docsFiles.push(buildDocumentFile(f, `${docsPath}/${f}`))
        }

        // Scan subdirs in docs (but skip known non-doc dirs)
        const skipDocsDirs = new Set(['stories', 'planning-artifacts', 'implementation-artifacts', 'node_modules'])
        for (const subDir of docsScan.subDirs) {
          if (skipDocsDirs.has(subDir)) continue
          const subPath = `${docsPath}/${subDir}`
          const subScan = await scanFolder(subPath, reader)
          const subLabel = generateDisplayName(subDir)
          for (const f of [...subScan.mdFiles, ...subScan.yamlFiles]) {
            docsFiles.push(buildDocumentFile(f, `${subPath}/${f}`, subLabel))
          }
        }

        if (docsFiles.length > 0) {
          docsFiles.sort((a, b) => a.displayName.localeCompare(b.displayName))
          foundFolders.push({
            id: 'docs',
            label: 'Project Knowledge',
            module: null,
            path: docsPath,
            files: docsFiles,
          })
        }
      }

      // Sort folders by priority
      foundFolders.sort((a, b) => {
        const pa = FOLDER_PRIORITY[a.id] ?? 99
        const pb = FOLDER_PRIORITY[b.id] ?? 99
        return pa - pb
      })

      setFolders(foundFolders)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [projectPath, projectType, outputFolder, bmadScanResult, documentsRevision])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  // Flat list of all files across all folders
  const allFiles = folders.flatMap(f => f.files)

  return {
    folders,
    allFiles,
    loading,
    error,
    refresh: loadDocuments,
    // Backward compatibility
    artifacts: allFiles,
    getModuleLabel,
  }
}

// Backward-compatible re-export
export const usePlanningArtifacts = useDocuments
