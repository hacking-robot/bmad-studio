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

