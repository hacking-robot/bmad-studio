import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

interface Shortcut {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
const modKey = isMac ? '⌘' : 'Ctrl'

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'General',
    shortcuts: [
      { keys: [modKey, 'P'], description: 'Open command palette' },
      { keys: [modKey, '/'], description: 'Show keyboard shortcuts' }
    ]
  }
]

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)

  // Listen for menu trigger from Electron
  useEffect(() => {
    const cleanup = window.fileAPI.onShowKeyboardShortcuts(() => {
      setOpen(true)
    })
    return cleanup
  }, [])

  // Listen for custom event (from settings menu, command palette, etc.)
  useEffect(() => {
    const handleOpen = () => setOpen(true)
    window.addEventListener('open-keyboard-shortcuts', handleOpen)
    return () => window.removeEventListener('open-keyboard-shortcuts', handleOpen)
  }, [])

  // Also listen for Cmd+/ keyboard shortcut directly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        setOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleClose = () => {
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2
          }
        }
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
          fontWeight: 600
        }}
      >
        Keyboard Shortcuts
        <IconButton size="small" onClick={handleClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {shortcutGroups.map((group) => (
          <Box key={group.title} sx={{ mb: 3 }}>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ display: 'block', mb: 1 }}
            >
              {group.title}
            </Typography>
            {group.shortcuts.map((shortcut, index) => (
              <Box
                key={index}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 1,
                  borderBottom: index < group.shortcuts.length - 1 ? 1 : 0,
                  borderColor: 'divider'
                }}
              >
                <Typography variant="body2">{shortcut.description}</Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {shortcut.keys.map((key, keyIndex) => (
                    <Box
                      key={keyIndex}
                      sx={{
                        px: 1,
                        py: 0.5,
                        bgcolor: 'action.hover',
                        borderRadius: 1,
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        minWidth: 24,
                        textAlign: 'center'
                      }}
                    >
                      {key}
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  )
}
