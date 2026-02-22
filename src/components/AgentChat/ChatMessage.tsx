import { useState } from 'react'
import { Box, Typography, Paper, IconButton, Tooltip, Link, Chip, Collapse } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { ChatMessage as ChatMessageType, LLMStats, ToolCall } from '../../types'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useStore } from '../../store'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface ChatMessageProps {
  message: ChatMessageType
  agentName: string
  agentAvatar: string
}

// Format LLM stats for display
function formatStats(stats: LLMStats): string {
  const parts: string[] = []

  // Model name (shortened)
  const modelShort = stats.model.includes('opus') ? 'Opus' :
    stats.model.includes('sonnet') ? 'Sonnet' :
    stats.model.includes('haiku') ? 'Haiku' :
    stats.model.split('-')[0] || stats.model
  parts.push(modelShort)

  // Tokens
  const totalTokens = stats.inputTokens + stats.outputTokens
  parts.push(`${totalTokens.toLocaleString()} tokens`)

  // Cost
  if (stats.totalCostUsd !== undefined) {
    const costStr = stats.totalCostUsd < 0.01
      ? `$${stats.totalCostUsd.toFixed(4)}`
      : `$${stats.totalCostUsd.toFixed(2)}`
    parts.push(costStr)
  }

  // Duration
  if (stats.durationMs !== undefined) {
    const seconds = (stats.durationMs / 1000).toFixed(1)
    parts.push(`${seconds}s`)
  }

  return parts.join(' · ')
}

// Map file extensions to language names
function getLanguageFromExtension(lang: string): string {
  const langMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    sh: 'bash',
    bash: 'bash',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sql: 'sql',
    md: 'markdown'
  }
  return langMap[lang.toLowerCase()] || lang.toLowerCase() || 'text'
}

// Create markdown components with proper styling
function createMarkdownComponents(isDark: boolean): Components {
  return {
    // Code blocks and inline code
    code({ className, children }) {
      const match = /language-(\w+)/.exec(className || '')
      const language = match ? match[1] : ''
      const codeString = String(children).replace(/\n$/, '')

      // Check if it's a code block (has language) or inline code
      const isBlock = match || codeString.includes('\n')

      if (isBlock) {
        const handleCopy = () => {
          navigator.clipboard.writeText(codeString)
        }

        return (
          <Box sx={{ position: 'relative', my: 1, borderRadius: 1, overflow: 'hidden' }}>
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
                    color: isDark ? '#888' : '#666',
                    fontSize: '0.65rem',
                    textTransform: 'uppercase'
                  }}
                >
                  {language}
                </Typography>
              )}
              <Tooltip title="Copy code">
                <IconButton
                  size="small"
                  onClick={handleCopy}
                  sx={{
                    p: 0.5,
                    bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    '&:hover': {
                      bgcolor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
                    }
                  }}
                >
                  <ContentCopyIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Box>
            <SyntaxHighlighter
              language={getLanguageFromExtension(language)}
              style={isDark ? vscDarkPlus : vs}
              customStyle={{
                margin: 0,
                borderRadius: 4,
                fontSize: '0.8rem',
                padding: '12px',
                paddingTop: language ? '28px' : '12px'
              }}
              wrapLongLines
            >
              {codeString}
            </SyntaxHighlighter>
          </Box>
        )
      }

      // Inline code
      return (
        <Box
          component="code"
          sx={{
            bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
            px: 0.5,
            py: 0.25,
            borderRadius: 0.5,
            fontSize: '0.85em',
            fontFamily: 'monospace'
          }}
        >
          {children}
        </Box>
      )
    },

    // Paragraphs
    p({ children }) {
      return (
        <Typography variant="body2" sx={{ mb: 1, '&:last-child': { mb: 0 } }}>
          {children}
        </Typography>
      )
    },

    // Headers
    h1({ children }) {
      return (
        <Typography variant="h6" sx={{ mt: 2, mb: 1, fontWeight: 600 }}>
          {children}
        </Typography>
      )
    },
    h2({ children }) {
      return (
        <Typography variant="subtitle1" sx={{ mt: 1.5, mb: 0.5, fontWeight: 600 }}>
          {children}
        </Typography>
      )
    },
    h3({ children }) {
      return (
        <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5, fontWeight: 600 }}>
          {children}
        </Typography>
      )
    },

    // Lists
    ul({ children }) {
      return (
        <Box component="ul" sx={{ pl: 2, my: 0.5, '& li': { mb: 0.25 } }}>
          {children}
        </Box>
      )
    },
    ol({ children }) {
      return (
        <Box component="ol" sx={{ pl: 2, my: 0.5, '& li': { mb: 0.25 } }}>
          {children}
        </Box>
      )
    },
    li({ children }) {
      return (
        <Typography component="li" variant="body2">
          {children}
        </Typography>
      )
    },

    // Links
    a({ href, children }) {
      return (
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: 'primary.main' }}
        >
          {children}
        </Link>
      )
    },

    // Bold and italic
    strong({ children }) {
      return <strong>{children}</strong>
    },
    em({ children }) {
      return <em>{children}</em>
    },

    // Blockquotes
    blockquote({ children }) {
      return (
        <Box
          sx={{
            borderLeft: 3,
            borderColor: 'primary.main',
            pl: 1.5,
            my: 1,
            color: 'text.secondary',
            fontStyle: 'italic'
          }}
        >
          {children}
        </Box>
      )
    },

    // Horizontal rule
    hr() {
      return <Box sx={{ borderTop: 1, borderColor: 'divider', my: 1.5 }} />
    }
  }
}

// Extract a concise detail string per tool type
function getToolDetail(tc: ToolCall): string {
  const input = tc.input
  if (!input) return tc.summary

  switch (tc.name) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return input.file_path
        ? String(input.file_path).split('/').pop() || tc.summary
        : tc.summary
    case 'Bash':
      if (input.command) {
        const cmd = String(input.command)
        return `$ ${cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd}`
      }
      return tc.summary
    case 'Grep':
      if (input.pattern) {
        const path = input.path ? ` in ${String(input.path).split('/').pop()}` : ''
        return `"${input.pattern}"${path}`
      }
      return tc.summary
    case 'Glob':
      return input.pattern ? String(input.pattern) : tc.summary
    case 'WebSearch':
      return input.query ? String(input.query) : tc.summary
    default:
      return tc.summary
  }
}

function ToolCallsSummary({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Box sx={{ mt: 0.5 }}>
      <Chip
        icon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        label={`${toolCalls.length} tool call${toolCalls.length !== 1 ? 's' : ''}`}
        size="small"
        variant="outlined"
        onClick={() => setExpanded(!expanded)}
        sx={{
          cursor: 'pointer',
          height: 24,
          fontSize: '0.7rem',
          '& .MuiChip-icon': { fontSize: '0.9rem' }
        }}
      />
      <Collapse in={expanded}>
        <Box
          sx={{
            mt: 0.5,
            pl: 1.5,
            borderLeft: 2,
            borderColor: 'divider'
          }}
        >
          {toolCalls.map((tc, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                gap: 1,
                alignItems: 'baseline',
                py: 0.25
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  minWidth: 40,
                  color: 'text.secondary',
                  fontSize: '0.7rem'
                }}
              >
                {tc.name}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  color: 'text.disabled',
                  fontSize: '0.7rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {getToolDetail(tc)}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  )
}

export default function ChatMessage({ message, agentName, agentAvatar }: ChatMessageProps) {
  const themeMode = useStore((state) => state.themeMode)
  const verboseMode = useStore((state) => state.verboseMode)
  const isDark = themeMode === 'dark'
  const isUser = message.role === 'user'
  const isError = message.status === 'error'
  const isPending = message.status === 'pending'
  const isStreaming = message.status === 'streaming'

  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })

  // Use dark mode styling for agent messages in dark theme
  const contentIsDark = isDark && !isUser

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: 1.5,
        px: 2,
        py: 1,
        alignItems: 'flex-start'
      }}
    >
      {/* Avatar */}
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          bgcolor: isUser ? 'grey.600' : 'primary.main',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 600,
          fontSize: '0.75rem',
          flexShrink: 0
        }}
      >
        {isUser ? 'You' : agentAvatar}
      </Box>

      {/* Message Content */}
      <Box sx={{ flex: 1, maxWidth: '75%' }}>
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 0.5,
            justifyContent: isUser ? 'flex-end' : 'flex-start'
          }}
        >
          <Typography variant="caption" fontWeight={600}>
            {isUser ? 'You' : agentName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formattedTime}
          </Typography>
          {isError && (
            <ErrorOutlineIcon sx={{ fontSize: 14, color: 'error.main' }} />
          )}
        </Box>

        {/* Message Bubble */}
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            bgcolor: isUser
              ? 'primary.main'
              : isError
                ? 'error.light'
                : isDark
                  ? 'grey.800'
                  : 'grey.100',
            color: isUser
              ? 'primary.contrastText'
              : isError
                ? 'error.contrastText'
                : 'text.primary',
            borderRadius: 2,
            borderTopLeftRadius: isUser ? 2 : 0,
            borderTopRightRadius: isUser ? 0 : 2,
            opacity: isPending ? 0.6 : 1
          }}
        >
          {isPending ? (
            <Typography variant="body2" color="text.secondary">
              Waiting for response...
            </Typography>
          ) : isStreaming && !message.content ? (
            <Typography variant="body2" color="text.secondary">
              Thinking...
            </Typography>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={createMarkdownComponents(contentIsDark)}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </Paper>

        {/* Tool Calls (verbose mode) */}
        {verboseMode && !isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallsSummary toolCalls={message.toolCalls} />
        )}

        {/* LLM Stats */}
        {!isUser && message.stats && message.status === 'complete' && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 0.5,
              color: 'text.disabled',
              fontSize: '0.7rem'
            }}
          >
            {formatStats(message.stats)}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
