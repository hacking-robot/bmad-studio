import { useState, useCallback, useRef } from 'react'
import { Box, TextField, IconButton } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import StopIcon from '@mui/icons-material/Stop'

interface HelpChatInputProps {
  onSend: (content: string) => void
  onCancel?: () => void
  disabled?: boolean
}

export default function HelpChatInput({ onSend, onCancel, disabled }: HelpChatInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
  }, [value, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const isTyping = !!onCancel

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, p: 1, borderTop: 1, borderColor: 'divider' }}>
      <TextField
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask BMAD for help..."
        multiline
        maxRows={3}
        size="small"
        disabled={disabled && !isTyping}
        fullWidth
        sx={{
          '& .MuiOutlinedInput-root': {
            fontSize: '0.85rem',
          }
        }}
      />
      {isTyping ? (
        <IconButton size="small" onClick={onCancel} color="error" sx={{ flexShrink: 0 }}>
          <StopIcon sx={{ fontSize: 20 }} />
        </IconButton>
      ) : (
        <IconButton
          size="small"
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          color="primary"
          sx={{ flexShrink: 0 }}
        >
          <SendIcon sx={{ fontSize: 20 }} />
        </IconButton>
      )}
    </Box>
  )
}
