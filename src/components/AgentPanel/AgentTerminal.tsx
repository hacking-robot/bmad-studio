import { useEffect, useRef, useMemo, useCallback } from 'react'
import { Box, Typography, Link } from '@mui/material'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { useThemedSyntax } from '../../hooks/useThemedSyntax'
import anser from 'anser'
import BuildIcon from '@mui/icons-material/Build'
import EditIcon from '@mui/icons-material/Edit'
import TerminalIcon from '@mui/icons-material/Terminal'
import SearchIcon from '@mui/icons-material/Search'
import FolderIcon from '@mui/icons-material/Folder'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'

interface AgentTerminalProps {
  output: string[]
}

interface ParsedMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'system' | 'thinking' | 'raw'
  content: string
  toolName?: string
  toolInput?: string
}

// Filter out internal system data that shouldn't be shown to users
function shouldFilterContent(content: string): boolean {
  const filterPatterns = [
    /\| ID \| Time \|/,           // Memory tables
    /\| Read \| Work \|/,          // Token columns
    /Read: ~\d+/,                  // Read token counts
    /Work: 🔍|Work: 🛠️/,          // Work token counts
    /\*\*#\d+\*\*/,               // Observation IDs
    /<claude-mem-context>/,        // Memory context markers
    /<\/claude-mem-context>/,
    /\\n\\n/,                      // Escaped newlines in context
    /\| ID \| Time \| T \| Title/, // Full table headers
    /# Recent Activity/,           // Memory section headers
    /<!-- This section is auto-generated/,  // Memory auto-gen comments
    /^\s*\d+→/,                    // File content lines with line numbers (e.g., "   514→")
    /\d+→.*\\n\s*\d+→/,            // Multiple file content lines with escaped newlines
    /\\n\s*\d+→/,                  // Escaped newline followed by line number
    /^\s*\d+\|/,                   // Alternative line number format
    /"tool_use_id":/,              // Tool result metadata
    /"type":"tool_result"/,        // Tool result type markers
    /"content":\s*"\s*\d+→/,       // Tool result content with line numbers
  ]
  return filterPatterns.some(pattern => pattern.test(content))
}

// Check if content looks like file/code dump (lots of line numbers)
function isFileContentDump(content: string): boolean {
  // Count line number patterns (e.g., "  130→" or "\\n   130→")
  // Also match escaped versions and alternative patterns
  const lineNumberPatterns = [
    /\d+→/g,           // Standard: 130→
    /\d+\|/g,          // Alternative: 130|
    /^\s+\d+\s+/gm,    // Line number with spaces: "    130    "
  ]

  let totalMatches = 0
  for (const pattern of lineNumberPatterns) {
    const matches = content.match(pattern)
    totalMatches += matches?.length ?? 0
  }

  // If there are many line numbers, it's likely a file dump
  return totalMatches >= 3
}

// Check if text content should be filtered (file dumps, tool results with file content)
function shouldFilterTextContent(content: string): boolean {
  // Skip empty content
  if (!content.trim()) return true

  // Skip file content dumps
  if (isFileContentDump(content)) return true

  // Skip content that looks like raw tool results with file paths and content
  if (content.includes('file_path') && content.includes('→')) return true

  // Skip content that's mostly line-numbered code
  const lines = content.split('\n')
  const lineNumberedLines = lines.filter(l => /^\s*\d+[→|]\s*/.test(l))
  if (lineNumberedLines.length > lines.length * 0.5 && lineNumberedLines.length >= 3) return true

  return false
}

// Parse ANSI codes and convert to styled spans
function parseAnsi(text: string): React.ReactNode[] {
  const parsed = anser.ansiToJson(text, { use_classes: false })

  return parsed.map((part, i) => {
    const style: React.CSSProperties = {}

    if (part.fg) {
      style.color = `rgb(${part.fg})`
    }
    if (part.bg) {
      style.backgroundColor = `rgb(${part.bg})`
    }
    if (part.decoration === 'bold') {
      style.fontWeight = 'bold'
    }
    if (part.decoration === 'italic') {
      style.fontStyle = 'italic'
    }
    if (part.decoration === 'underline') {
      style.textDecoration = 'underline'
    }

    return (
      <span key={i} style={style}>
        {part.content}
      </span>
    )
  })
}

// Parse text and linkify URLs
function linkifyText(text: string): React.ReactNode[] {
  const urlPattern = /(https?:\/\/[^\s<>]+)/g
  const parts = text.split(urlPattern)

  return parts.map((part, i) => {
    if (urlPattern.test(part)) {
      // Reset lastIndex since we're reusing the regex
      urlPattern.lastIndex = 0
      return (
        <Link
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            color: '#4fc3f7',
            textDecoration: 'underline',
            '&:hover': {
              color: '#81d4fa'
            }
          }}
        >
          {part}
        </Link>
      )
    }
    // Parse ANSI codes in non-URL parts
    return <span key={i}>{parseAnsi(part)}</span>
  })
}

// Map common file extensions to language names for syntax highlighting
function getLanguageFromExtension(lang: string): string {
  const langMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'py': 'python',
    'rb': 'ruby',
    'rs': 'rust',
    'go': 'go',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'cs': 'csharp',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sql': 'sql',
    'md': 'markdown',
    'markdown': 'markdown',
  }
  return langMap[lang.toLowerCase()] || lang.toLowerCase() || 'text'
}

// Code block component with copy button
function CodeBlock({ code, language }: { code: string; language: string }) {
  const { prismStyle } = useThemedSyntax()
  const handleCopy = () => {
    navigator.clipboard.writeText(code)
  }

  return (
    <Box sx={{ position: 'relative', my: 1 }}>
      <Box
        sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}
      >
        {language && (
          <Typography
            variant="caption"
            sx={{
              color: '#888',
              fontSize: '0.65rem',
              textTransform: 'uppercase'
            }}
          >
            {language}
          </Typography>
        )}
        <Box
          component="button"
          onClick={handleCopy}
          sx={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: 1,
            p: 0.5,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            '&:hover': {
              background: 'rgba(255,255,255,0.2)'
            }
          }}
          title="Copy code"
        >
          <ContentCopyIcon sx={{ fontSize: 14, color: '#888' }} />
        </Box>
      </Box>
      <SyntaxHighlighter
        language={getLanguageFromExtension(language)}
        style={prismStyle}
        customStyle={{
          margin: 0,
          borderRadius: 4,
          fontSize: '0.75rem',
          padding: '12px',
          paddingTop: '28px', // Space for header
          background: '#1a1a2e'
        }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </Box>
  )
}

// Parse text content and extract code blocks
function renderTextWithCodeBlocks(text: string): React.ReactNode[] {
  // Match code blocks: ```language\ncode\n``` or ```\ncode\n```
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match
  let key = 0

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index)
      parts.push(
        <span key={key++}>{linkifyText(textBefore)}</span>
      )
    }

    // Add code block
    const language = match[1] || ''
    const code = match[2].trim()
    parts.push(
      <CodeBlock key={key++} code={code} language={language} />
    )

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={key++}>{linkifyText(text.slice(lastIndex))}</span>
    )
  }

  // If no code blocks found, just linkify the text
  if (parts.length === 0) {
    return linkifyText(text)
  }

  return parts
}

// Message types to silently skip (internal/control messages)
const SKIP_MESSAGE_TYPES = new Set([
  'message_start',
  'message_delta',
  'message_stop',
  'content_block_stop',
  'ping',
  'control_request',
  'control_response',
  'control_cancel_request',
])

// Tool names that appear as standalone lines in verbose output
const TOOL_NAMES = new Set([
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'LS',
  'TodoWrite', 'Task', 'WebFetch', 'WebSearch', 'NotebookEdit',
  'AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode', 'Skill',
  'KillShell', 'TaskOutput', 'mcp__'
])

// Check if line is a tool name
function isToolNameLine(line: string): boolean {
  const trimmed = line.trim()
  if (TOOL_NAMES.has(trimmed)) return true
  // Also match MCP tool names like mcp__plugin_claude-mem__search
  if (trimmed.startsWith('mcp__')) return true
  return false
}

// Check if line looks like a tool input JSON
function isToolInputJson(line: string): boolean {
  const trimmed = line.trim()
  // Tool inputs are typically { "key": "value" } format
  if (trimmed.startsWith('{') && trimmed.includes('"')) {
    try {
      const parsed = JSON.parse(trimmed)
      // Tool inputs typically have simple keys like file_path, command, pattern, etc.
      const keys = Object.keys(parsed)
      const toolInputKeys = ['file_path', 'command', 'pattern', 'path', 'content',
                             'query', 'url', 'todos', 'prompt', 'old_string',
                             'new_string', 'description', 'timeout', 'skill']
      return keys.some(k => toolInputKeys.includes(k))
    } catch {
      return false
    }
  }
  return false
}

// Parse Claude CLI stream-json output into displayable messages
function parseStreamJson(lines: string[]): ParsedMessage[] {
  const messages: ParsedMessage[] = []
  let currentText = ''
  let pendingToolName: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Skip tool name lines (they appear before tool input JSON in verbose mode)
    if (isToolNameLine(trimmed)) {
      pendingToolName = trimmed
      continue
    }

    // Skip tool input JSON (the { "file_path": "..." } blocks)
    if (isToolInputJson(trimmed)) {
      // If we have a pending tool name, we could show it as a tool_use
      // but for now, skip both the name and input for cleaner output
      if (pendingToolName) {
        // Optionally show as tool use - flush text first (with filtering)
        if (currentText && !shouldFilterTextContent(currentText)) {
          messages.push({ type: 'text', content: currentText })
        }
        currentText = ''
        messages.push({
          type: 'tool_use',
          content: pendingToolName,
          toolName: pendingToolName
        })
        pendingToolName = null
      }
      continue
    }

    pendingToolName = null // Reset if we see something else

    // Check if this looks like JSON
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      // Not JSON - only show if it's meaningful stderr output
      if (!shouldFilterContent(trimmed) && !isFileContentDump(trimmed)) {
        // Check if it looks like an actual error message
        if (trimmed.toLowerCase().includes('error') ||
            trimmed.toLowerCase().includes('warning') ||
            trimmed.toLowerCase().includes('failed')) {
          if (currentText && !shouldFilterTextContent(currentText)) {
            messages.push({ type: 'text', content: currentText })
          }
          currentText = ''
          messages.push({ type: 'raw', content: trimmed })
        }
        // Otherwise silently skip non-JSON lines
      }
      continue
    }

    try {
      const parsed = JSON.parse(trimmed)

      // Skip internal/control message types silently
      if (parsed.type && SKIP_MESSAGE_TYPES.has(parsed.type)) {
        continue
      }

      // Handle different message types from Claude CLI stream-json format
      if (parsed.type === 'assistant' && parsed.message?.content) {
        for (const block of parsed.message.content) {
          if (block.type === 'text' && block.text) {
            currentText += block.text
          } else if (block.type === 'tool_use') {
            // Flush any accumulated text (filter out file dumps)
            if (currentText && !shouldFilterTextContent(currentText)) {
              messages.push({ type: 'text', content: currentText })
            }
            currentText = ''
            messages.push({
              type: 'tool_use',
              content: block.name || 'Tool',
              toolName: block.name,
              toolInput: typeof block.input === 'string'
                ? block.input
                : JSON.stringify(block.input, null, 2)
            })
          }
        }
      } else if (parsed.type === 'content_block_delta') {
        // Streaming text delta
        if (parsed.delta?.text) {
          currentText += parsed.delta.text
        }
        // Skip other delta types (tool_use deltas, etc.)
      } else if (parsed.type === 'content_block_start') {
        if (parsed.content_block?.type === 'tool_use') {
          // Tool use start - flush accumulated text (filter out file dumps)
          if (currentText && !shouldFilterTextContent(currentText)) {
            messages.push({ type: 'text', content: currentText })
          }
          currentText = ''
          messages.push({
            type: 'tool_use',
            content: parsed.content_block.name || 'Tool',
            toolName: parsed.content_block.name
          })
        }
        // Skip other content block types (text start, etc.)
      } else if (parsed.type === 'result') {
        // Final result - only show if there's actual result text
        if (currentText && !shouldFilterTextContent(currentText)) {
          messages.push({ type: 'text', content: currentText })
        }
        currentText = ''
        if (parsed.result && typeof parsed.result === 'string' && parsed.result.trim()) {
          const resultText = parsed.result
          if (!shouldFilterTextContent(resultText)) {
            messages.push({ type: 'text', content: `\n${resultText}` })
          }
        }
      } else if (parsed.type === 'system') {
        // Skip hook responses and memory context
        if (parsed.subtype === 'hook_response') continue
        if (parsed.subtype === 'init') continue // Skip init messages
        const systemContent = parsed.system || parsed.message || ''
        if (systemContent && !shouldFilterContent(systemContent)) {
          messages.push({ type: 'system', content: systemContent })
        }
      } else if (parsed.type === 'error') {
        const errorMsg = parsed.error?.message || parsed.message || 'Unknown error'
        messages.push({ type: 'raw', content: `Error: ${errorMsg}` })
      }
      // All other JSON types are silently skipped
    } catch {
      // JSON parse failed - silently skip unless it looks like an error
      if (!shouldFilterContent(trimmed) && !isFileContentDump(trimmed) &&
          (trimmed.toLowerCase().includes('error') || trimmed.toLowerCase().includes('failed'))) {
        if (currentText && !shouldFilterTextContent(currentText)) {
          messages.push({ type: 'text', content: currentText })
        }
        currentText = ''
        messages.push({ type: 'raw', content: trimmed })
      }
    }
  }

  // Flush any remaining text (filter out file dumps)
  if (currentText && !shouldFilterTextContent(currentText)) {
    messages.push({ type: 'text', content: currentText })
  }

  return messages
}

// Get appropriate icon for tool type
function getToolIcon(toolName?: string) {
  if (!toolName) return <BuildIcon sx={{ fontSize: 14 }} />
  const name = toolName.toLowerCase()

  if (name.includes('edit') || name.includes('write')) {
    return <EditIcon sx={{ fontSize: 14 }} />
  }
  if (name.includes('bash') || name.includes('terminal')) {
    return <TerminalIcon sx={{ fontSize: 14 }} />
  }
  if (name.includes('read') || name.includes('glob')) {
    return <SearchIcon sx={{ fontSize: 14 }} />
  }
  if (name.includes('ls') || name.includes('list')) {
    return <FolderIcon sx={{ fontSize: 14 }} />
  }
  return <BuildIcon sx={{ fontSize: 14 }} />
}

// Message row component for virtualized list
function MessageRow({ msg }: { msg: ParsedMessage }) {
  if (msg.type === 'text') {
    // Skip file content dumps and other filtered content
    if (shouldFilterTextContent(msg.content)) {
      return null
    }

    return (
      <Box
        sx={{
          color: '#d4d4d4',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          mb: 1
        }}
      >
        {renderTextWithCodeBlocks(msg.content)}
      </Box>
    )
  }

  if (msg.type === 'tool_use') {
    return (
      <Box
        sx={{
          mb: 1.5,
          borderLeft: 2,
          borderColor: '#569cd6',
          pl: 1.5,
          py: 0.5
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#569cd6' }}>
          {getToolIcon(msg.toolName)}
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, fontFamily: 'inherit', color: 'inherit' }}
          >
            {msg.toolName || 'Tool'}
          </Typography>
        </Box>
        {msg.toolInput && (
          <Box
            sx={{
              mt: 0.5,
              color: '#9cdcfe',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 150,
              overflow: 'auto'
            }}
          >
            {msg.toolInput.length > 500
              ? msg.toolInput.substring(0, 500) + '...'
              : msg.toolInput}
          </Box>
        )}
      </Box>
    )
  }

  if (msg.type === 'system') {
    return (
      <Box
        sx={{
          color: '#6a9955',
          fontStyle: 'italic',
          mb: 1,
          opacity: 0.8
        }}
      >
        {linkifyText(msg.content)}
      </Box>
    )
  }

  // Raw or unknown type
  return (
    <Box
      sx={{
        color: '#ce9178',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        mb: 0.5
      }}
    >
      {linkifyText(msg.content)}
    </Box>
  )
}

export default function AgentTerminal({ output }: AgentTerminalProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // Parse the output into displayable messages
  const messages = useMemo(() => parseStreamJson(output), [output])

  // Auto-scroll to bottom when new messages arrive
  const followOutput = useCallback(() => {
    return true // Always follow new output
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (virtuosoRef.current && messages.length > 0) {
      virtuosoRef.current.scrollToIndex({
        index: messages.length - 1,
        behavior: 'smooth',
        align: 'end'
      })
    }
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          bgcolor: '#1e1e1e',
          fontFamily: '"Fira Code", "Monaco", "Consolas", monospace',
          fontSize: '0.8rem',
          lineHeight: 1.5,
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Box sx={{ color: '#6a9955' }}>
          Waiting for output...
        </Box>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'hidden',
        bgcolor: '#1e1e1e',
        fontFamily: '"Fira Code", "Monaco", "Consolas", monospace',
        fontSize: '0.8rem',
        lineHeight: 1.5
      }}
    >
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        followOutput={followOutput}
        itemContent={(_index, msg) => (
          <Box sx={{ px: 2, py: 0.25 }}>
            <MessageRow msg={msg} />
          </Box>
        )}
        style={{ height: '100%' }}
        overscan={200}
      />
    </Box>
  )
}
