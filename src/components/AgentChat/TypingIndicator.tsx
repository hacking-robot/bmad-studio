import { Box, Typography } from '@mui/material'
import { keyframes } from '@mui/system'

interface TypingIndicatorProps {
  agentName: string
  activity?: string // What Claude is currently doing (e.g., "Reading file...", "Searching...")
}

const bounce = keyframes`
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-4px);
  }
`

export default function TypingIndicator({ agentName, activity }: TypingIndicatorProps) {
  // Format the status text based on whether there's an activity
  const statusText = activity
    ? `${agentName}: ${activity}`
    : `${agentName} is thinking...`

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 1
      }}
    >
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: activity ? 'secondary.main' : 'primary.main',
              animation: `${bounce} 1.4s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`
            }}
          />
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: activity ? 'italic' : 'normal' }}>
        {statusText}
      </Typography>
    </Box>
  )
}
