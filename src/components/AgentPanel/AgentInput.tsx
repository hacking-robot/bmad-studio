import { useState, useRef, useEffect } from 'react'
import { Box, TextField, IconButton } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'

interface AgentInputProps {
  agentId: string
}

export default function AgentInput({ agentId }: AgentInputProps) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when component mounts
  useEffect(() => {
    inputRef.current?.focus()
  }, [agentId])

  const handleSend = async () => {
    if (!input.trim() || sending) return

    setSending(true)
    try {
      await window.agentAPI.sendInput(agentId, input + '\n')
      setInput('')
    } catch (error) {
      console.error('Failed to send input:', error)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <Box
      sx={{
        p: 1.5,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        gap: 1
      }}
    >
      <TextField
        inputRef={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Send message to agent..."
        size="small"
        fullWidth
        disabled={sending}
        sx={{
          '& .MuiOutlinedInput-root': {
            fontSize: '0.85rem'
          }
        }}
      />
      <IconButton
        color="primary"
        onClick={handleSend}
        disabled={!input.trim() || sending}
        size="small"
      >
        <SendIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}
