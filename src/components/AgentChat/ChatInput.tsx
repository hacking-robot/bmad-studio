import { useState, useRef, useCallback, KeyboardEvent } from 'react'
import { Box, TextField, IconButton, Tooltip, Typography, Menu, MenuItem, Chip, alpha } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import StopIcon from '@mui/icons-material/Stop'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { useStore } from '../../store'
import { useWorkflow } from '../../hooks/useWorkflow'

interface ChatInputProps {
  onSend: (message: string) => void
  onCancel?: () => void
  disabled?: boolean
  agentId: string
  busyReason?: string
  contextTokens?: number
  contextLimit?: number
}

export default function ChatInput({ onSend, onCancel, disabled = false, agentId, busyReason, contextTokens, contextLimit }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const isRemoteProject = useStore((state) => state.isRemoteProject)

  const { getAgent } = useWorkflow()
  const agent = getAgent(agentId)
  const commands = agent?.commands || []
  const menuOpen = Boolean(anchorEl)

  const handleSend = useCallback(() => {
    if (message.trim() && !disabled) {
      onSend(message)
      setMessage('')
      inputRef.current?.focus()
    }
  }, [message, disabled, onSend])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Enter to send, Shift+Enter for new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    // Shift+Enter allows default behavior (new line)
  }

  const handleCommandClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleCommandClose = () => {
    setAnchorEl(null)
  }

  const handleCommandSelect = (command: string) => {
    // Insert command into message
    setMessage(command)
    handleCommandClose()
    inputRef.current?.focus()
  }

  // Extract short label from command (e.g., "/bmad-agent-bmm-dev" -> "dev", "/bmad-bmm-dev-story" -> "dev-story")
  const getCommandLabel = (cmd: string): string => {
    // Alpha format: /bmad:bmm:agents:dev
    if (cmd.includes(':')) {
      const parts = cmd.split(':')
      return parts[parts.length - 1]
    }
    // Stable agent format: /bmad-agent-bmm-dev -> dev
    const agentMatch = cmd.match(/^\/bmad-agent-[^-]+-(.+)$/)
    if (agentMatch) return agentMatch[1]
    // Stable workflow format: /bmad-bmm-dev-story -> dev-story
    const workflowMatch = cmd.match(/^\/bmad-[^-]+-(.+)$/)
    if (workflowMatch) return workflowMatch[1]
    // Core format: /bmad-brainstorming -> brainstorming
    const coreMatch = cmd.match(/^\/bmad-(.+)$/)
    if (coreMatch) return coreMatch[1]
    return cmd
  }

  return (
    <Box
      sx={{
        p: 2,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}
    >
      {/* Command chips row */}
      {commands.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
          {commands.slice(0, 4).map((cmd) => (
            <Chip
              key={cmd}
              label={getCommandLabel(cmd)}
              size="small"
              variant="outlined"
              onClick={() => handleCommandSelect(cmd)}
              disabled={disabled}
              sx={{
                fontSize: '0.7rem',
                height: 22,
                cursor: 'pointer',
                '&:hover': {
                  bgcolor: 'action.hover'
                }
              }}
            />
          ))}
          {commands.length > 4 && (
            <Chip
              label={`+${commands.length - 4}`}
              size="small"
              variant="outlined"
              onClick={handleCommandClick}
              disabled={disabled}
              icon={<KeyboardArrowUpIcon sx={{ fontSize: '1rem' }} />}
              sx={{
                fontSize: '0.7rem',
                height: 22,
                cursor: 'pointer',
                '&:hover': {
                  bgcolor: 'action.hover'
                }
              }}
            />
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
        <TextField
          inputRef={inputRef}
          multiline
          maxRows={6}
          fullWidth
          placeholder={busyReason || "Type a message or select a command..."}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          variant="outlined"
          size="small"
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2
            }
          }}
        />
        {disabled && onCancel ? (
          <Tooltip title="Stop generating">
            <IconButton
              onClick={onCancel}
              color="error"
              sx={{
                bgcolor: 'error.main',
                color: 'error.contrastText',
                '&:hover': {
                  bgcolor: 'error.dark'
                }
              }}
            >
              <StopIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Send (Enter)">
            <span>
              <IconButton
                onClick={handleSend}
                disabled={!message.trim() || disabled}
                color="primary"
                sx={{
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    bgcolor: 'primary.dark'
                  },
                  '&.Mui-disabled': {
                    bgcolor: 'action.disabledBackground',
                    color: 'action.disabled'
                  }
                }}
              >
                <SendIcon />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
        {contextTokens != null && contextTokens > 0 ? (
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              color: contextLimit
                ? contextTokens / contextLimit > 0.8
                  ? 'warning.main'
                  : 'text.disabled'
                : 'text.disabled'
            }}
          >
            {contextLimit
              ? `${Math.round(contextTokens / 1000)}K / ${Math.round(contextLimit / 1000)}K context`
              : `${Math.round(contextTokens / 1000)}K tokens`
            }
          </Typography>
        ) : (
          <Box />
        )}
        <Typography variant="caption" color="text.secondary">
          Enter to send · Shift+Enter for new line
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          mt: 1,
          p: 0.75,
          borderRadius: 1,
          bgcolor: (theme) => alpha(theme.palette[isRemoteProject ? 'warning' : 'info'].main, 0.08),
        }}
      >
        {isRemoteProject ? (
          <>
            <WarningAmberIcon sx={{ fontSize: 14, color: 'warning.main', opacity: 0.7 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              Read-only project — file changes will be automatically reverted
            </Typography>
          </>
        ) : (
          <>
            <InfoOutlinedIcon sx={{ fontSize: 14, color: 'info.main', opacity: 0.7 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              Check the selected git branch before chatting — agents make changes to the current branch
            </Typography>
          </>
        )}
      </Box>

      {/* Command menu for overflow */}
      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleCommandClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left'
        }}
        transformOrigin={{
          vertical: 'bottom',
          horizontal: 'left'
        }}
      >
        {commands.map((cmd) => (
          <MenuItem
            key={cmd}
            onClick={() => handleCommandSelect(cmd)}
            sx={{ fontSize: '0.875rem' }}
          >
            <Box component="span" sx={{ fontWeight: 600, mr: 1 }}>
              {getCommandLabel(cmd)}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              {cmd}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  )
}
