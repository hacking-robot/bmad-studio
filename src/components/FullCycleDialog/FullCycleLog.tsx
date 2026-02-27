import { useRef, useEffect } from 'react'
import { Box, Typography } from '@mui/material'

interface FullCycleLogProps {
  logs: string[]
}

export default function FullCycleLog({ logs }: FullCycleLogProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: 1,
        overflow: 'auto',
        bgcolor: 'background.default',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        lineHeight: 1.6,
        minHeight: 200,
        maxHeight: 400
      }}
    >
      {logs.length === 0 ? (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ fontFamily: 'inherit' }}
        >
          Waiting for output...
        </Typography>
      ) : (
        logs.map((log, index) => {
          // Style different log types
          const isHeader = log.startsWith('---') || log.startsWith('===')
          const isError = log.toLowerCase().includes('error') || log.toLowerCase().includes('failed')
          const isSuccess = log.toLowerCase().includes('success') || log.toLowerCase().includes('completed')
          const isSkip = log.toLowerCase().includes('skipping') || log.toLowerCase().includes('skip')

          return (
            <Typography
              key={index}
              component="div"
              sx={{
                fontFamily: 'monospace',
                fontSize: 'inherit',
                color: isError ? 'error.main' : isSuccess ? 'success.main' : isSkip ? 'text.disabled' : isHeader ? 'primary.main' : 'text.primary',
                fontWeight: isHeader ? 600 : 400,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {log}
            </Typography>
          )
        })
      )}
    </Box>
  )
}
