import React, { useState, useEffect, useMemo } from 'react'
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
  Chip,
  Collapse,
  IconButton,
  CircularProgress
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChatIcon from '@mui/icons-material/Chat'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { gruvboxDark, gruvboxLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useStore } from '../../store'
import { gruvbox } from '../../theme'
import type { StoryChatHistory, StoryChatSession, LLMStats } from '../../types'

interface ChatHistorySectionProps {
  storyId: string
}

// Format timestamp to readable date/time
function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (isToday) {
    return `Today at ${timeStr}`
  } else if (isYesterday) {
    return `Yesterday at ${timeStr}`
  } else {
    return `${date.toLocaleDateString()} at ${timeStr}`
  }
}

// Format duration
function formatDuration(startTime: number, endTime?: number): string {
  if (!endTime) return ''
  const durationMs = endTime - startTime
  const minutes = Math.floor(durationMs / 60000)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
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

// Session component
function ChatSession({ session, isDark }: { session: StoryChatSession; isDark: boolean }) {
  const [expanded, setExpanded] = useState(false)

  // Create theme-aware code block component
  const CodeBlock = useMemo(() => {
    return ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
      const match = /language-(\w+)/.exec(className || '')
      const language = match ? match[1] : ''
      const codeString = String(children).replace(/\n$/, '')

      const isInline = !match && !codeString.includes('\n')

      if (isInline) {
        return (
          <code
            style={{
              backgroundColor: isDark ? gruvbox.dark2 : gruvbox.light2,
              color: isDark ? gruvbox.light1 : gruvbox.dark1,
              padding: '2px 6px',
              borderRadius: 4,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '0.85em'
            }}
            {...props}
          >
            {children}
          </code>
        )
      }

      return (
        <SyntaxHighlighter
          style={isDark ? gruvboxDark : gruvboxLight}
          language={language || 'text'}
          PreTag="div"
          customStyle={{
            margin: '8px 0',
            borderRadius: 8,
            fontSize: '0.75rem'
          }}
        >
          {codeString}
        </SyntaxHighlighter>
      )
    }
  }, [isDark])

  const userMessageCount = session.messages.filter(m => m.role === 'user').length
  const duration = formatDuration(session.startTime, session.endTime)

  // Aggregate session stats
  const sessionStats = useMemo(() => {
    let totalTokens = 0
    let totalCost = 0
    let hasStats = false

    session.messages.forEach(msg => {
      if (msg.stats) {
        hasStats = true
        totalTokens += (msg.stats.inputTokens || 0) + (msg.stats.outputTokens || 0)
        totalCost += msg.stats.totalCostUsd || 0
      }
    })

    if (!hasStats) return null

    return {
      totalTokens,
      totalCost,
      costStr: totalCost < 0.01 ? `$${totalCost.toFixed(4)}` : `$${totalCost.toFixed(2)}`
    }
  }, [session.messages])

  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        mb: 1,
        overflow: 'hidden'
      }}
    >
      {/* Session Header */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          cursor: 'pointer',
          bgcolor: 'action.hover',
          '&:hover': { bgcolor: 'action.selected' }
        }}
      >
        <IconButton size="small" sx={{ p: 0 }}>
          {expanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
        </IconButton>
        <ChatIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography fontWeight={500} sx={{ flex: 1 }}>
          {session.agentName}
          {session.agentRole && (
            <Typography component="span" color="text.secondary" sx={{ ml: 0.5, fontWeight: 400 }}>
              ({session.agentRole})
            </Typography>
          )}
        </Typography>
        <Chip
          label={`${userMessageCount} message${userMessageCount !== 1 ? 's' : ''}`}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.75rem', height: 22 }}
        />
        {sessionStats && (
          <Chip
            label={`${sessionStats.totalTokens.toLocaleString()} tokens · ${sessionStats.costStr}`}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: 22, color: 'text.secondary' }}
          />
        )}
        {session.branchName && (
          <Chip
            label={session.branchName}
            size="small"
            sx={{ fontSize: '0.75rem', height: 22, bgcolor: 'info.main', color: 'white' }}
          />
        )}
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(session.startTime)}
          {duration && ` (${duration})`}
        </Typography>
      </Box>

      {/* Session Messages */}
      <Collapse in={expanded}>
        <Box sx={{ p: 2, maxHeight: 400, overflow: 'auto' }}>
          {session.messages.map((message) => (
            <Box
              key={message.id}
              sx={{
                mb: 2,
                '&:last-child': { mb: 0 }
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  mb: 0.5
                }}
              >
                <Typography
                  variant="caption"
                  fontWeight={600}
                  sx={{
                    color: message.role === 'user' ? 'primary.main' : 'success.main'
                  }}
                >
                  {message.role === 'user' ? 'You' : (
                    <>
                      {session.agentName}
                      {session.agentRole && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 400 }}>
                          {' '}({session.agentRole})
                        </Typography>
                      )}
                    </>
                  )}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Typography>
              </Box>
              <Box
                sx={{
                  bgcolor: message.role === 'user' ? 'action.hover' : 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1.5,
                  fontSize: '0.875rem',
                  '& p': { m: 0, mb: 1, '&:last-child': { mb: 0 } },
                  '& ul, & ol': { pl: 2, mb: 1 }
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
                  {message.content || '*[Empty message]*'}
                </ReactMarkdown>
              </Box>
              {/* LLM Stats */}
              {message.role === 'assistant' && message.stats && (
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
          ))}
        </Box>
      </Collapse>
    </Box>
  )
}

export default function ChatHistorySection({ storyId }: ChatHistorySectionProps) {
  const projectPath = useStore((state) => state.projectPath)
  const outputFolder = useStore((state) => state.outputFolder)
  const themeMode = useStore((state) => state.themeMode)
  const isDark = themeMode === 'dark'

  const [history, setHistory] = useState<StoryChatHistory | null>(null)
  const [loading, setLoading] = useState(true)

  // Load chat history
  useEffect(() => {
    async function loadHistory() {
      if (!projectPath || !storyId) {
        setHistory(null)
        setLoading(false)
        return
      }

      try {
        const loaded = await window.chatAPI.loadStoryChatHistory(projectPath, storyId, outputFolder)
        setHistory(loaded)
      } catch (error) {
        console.error('Failed to load story chat history:', error)
        setHistory(null)
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [projectPath, outputFolder, storyId])

  // Don't render anything if no history
  if (loading) {
    return (
      <Accordion elevation={0} disableGutters>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{ px: 3, bgcolor: 'action.hover' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ChatIcon sx={{ color: 'text.secondary' }} />
            <Typography variant="h6">Chat History</Typography>
            <CircularProgress size={16} />
          </Box>
        </AccordionSummary>
      </Accordion>
    )
  }

  if (!history || history.sessions.length === 0) {
    return null
  }

  // Sort sessions by start time (most recent first)
  const sortedSessions = [...history.sessions].sort((a, b) => b.startTime - a.startTime)

  // Calculate totals
  const totalMessages = sortedSessions.reduce((acc, s) => acc + s.messages.filter(m => m.role === 'user').length, 0)

  return (
    <Accordion elevation={0} disableGutters>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ px: 3, bgcolor: 'action.hover' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ChatIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6">Chat History</Typography>
          <Chip
            label={`${sortedSessions.length} session${sortedSessions.length !== 1 ? 's' : ''}, ${totalMessages} message${totalMessages !== 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.75rem', height: 22 }}
          />
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 3 }}>
        {sortedSessions.map((session) => (
          <ChatSession key={session.sessionId} session={session} isDark={isDark} />
        ))}
      </AccordionDetails>
    </Accordion>
  )
}
