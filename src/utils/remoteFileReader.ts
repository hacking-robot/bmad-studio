/**
 * Virtual filesystem abstraction for reading project files.
 * Provides a unified interface for local filesystem and git ref reads,
 * allowing parsers to work identically regardless of data source.
 */

export interface VirtualFileReader {
  readFile: (path: string) => Promise<{ content?: string; error?: string }>
  listDirectory: (path: string) => Promise<{ files?: string[]; dirs?: string[]; error?: string }>
}

/**
 * Creates a reader that reads from the local filesystem via Electron IPC.
 * This is the default reader used for normal project viewing.
 */
export function createLocalReader(): VirtualFileReader {
  return {
    readFile: (path) => window.fileAPI.readFile(path),
    listDirectory: (path) => window.fileAPI.listDirectory(path),
  }
}

/**
 * Creates a reader that reads files from a specific git ref (branch/tag/commit).
 * Converts absolute paths to project-relative paths for git operations.
 *
 * Requires `gitAPI.listDirectoryAtRef` (added by electron backend).
 */
export function createRemoteBranchReader(projectPath: string, ref: string): VirtualFileReader {
  const toRelative = (absolutePath: string): string => {
    if (absolutePath.startsWith(projectPath + '/')) {
      return absolutePath.slice(projectPath.length + 1)
    }
    return absolutePath
  }

  return {
    readFile: async (absolutePath) => {
      try {
        const relativePath = toRelative(absolutePath)
        const result = await window.gitAPI.getFileContent(projectPath, relativePath, ref)
        return { content: result.content }
      } catch (err) {
        return { error: err instanceof Error ? err.message : `Failed to read file at ref ${ref}` }
      }
    },
    listDirectory: async (absolutePath) => {
      try {
        const relativePath = toRelative(absolutePath)
        // listDirectoryAtRef will be added to gitAPI by the electron backend task
        const gitAPIExt = window.gitAPI as typeof window.gitAPI & {
          listDirectoryAtRef: (projectPath: string, dirPath: string, ref: string) => Promise<{ files?: string[]; dirs?: string[] }>
        }
        const result = await gitAPIExt.listDirectoryAtRef(projectPath, relativePath, ref)
        return { files: result.files || [], dirs: result.dirs || [] }
      } catch (err) {
        return { error: err instanceof Error ? err.message : `Failed to list directory at ref ${ref}` }
      }
    },
  }
}
