import { useState, useCallback, useRef } from 'react'
import { Box, Fab, Badge, Typography, IconButton, Grow } from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen'
import { useStore } from '../../store'
import { AI_TOOLS } from '../../types'
import HelpChatThread from './HelpChatThread'

const AGENT_ID = 'bmad-help'
const MIN_WIDTH = 320
const MIN_HEIGHT = 300
const MAX_WIDTH = 1000
const MAX_HEIGHT = 900
const DEFAULT_WIDTH = 480
const DEFAULT_HEIGHT = 500

export default function BmadHelpWidget() {
  const bmadHelpOpen = useStore((state) => state.bmadHelpOpen)
  const setBmadHelpOpen = useStore((state) => state.setBmadHelpOpen)
  const bmadScanResult = useStore((state) => state.bmadScanResult)
  const projectPath = useStore((state) => state.projectPath)
  const aiTool = useStore((state) => state.aiTool)
  const chatThreads = useStore((state) => state.chatThreads)

  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const isResizing = useRef(false)
  const sizeRef = useRef(size)
  sizeRef.current = size

  // Consider "full size" if both dimensions are at or near max
  const isFullSize = size.width >= MAX_WIDTH - 20 && size.height >= MAX_HEIGHT - 20

  const selectedToolInfo = AI_TOOLS.find(t => t.id === aiTool)
  const toolSupportsHeadless = selectedToolInfo?.cli.supportsHeadless ?? false

  const handleToggle = useCallback(() => {
    const state = useStore.getState()
    const next = !state.bmadHelpOpen
    state.setBmadHelpOpen(next)
    if (next && state.chatThreads[AGENT_ID]) {
      state.markChatRead(AGENT_ID)
    }
  }, [])

  const handleClear = useCallback(() => {
    useStore.getState().clearChatThread(AGENT_ID)
    window.chatAPI.cancelMessage(AGENT_ID, useStore.getState().projectPath || undefined)
  }, [])

  const handleToggleFullSize = useCallback(() => {
    const cur = sizeRef.current
    const atMax = cur.width >= MAX_WIDTH - 20 && cur.height >= MAX_HEIGHT - 20
    if (atMax) {
      setSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
    } else {
      setSize({ width: MAX_WIDTH, height: MAX_HEIGHT })
    }
  }, [])

  // Resize from top edge (height only)
  const handleTopResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startY = e.clientY
    const startHeight = sizeRef.current.height

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight - (ev.clientY - startY)))
      setSize(prev => ({ ...prev, height: newHeight }))

    }

    const onMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // Resize from left edge (width only)
  const handleLeftResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = sizeRef.current.width

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth - (ev.clientX - startX)))
      setSize(prev => ({ ...prev, width: newWidth }))

    }

    const onMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // Resize from top-left corner (both)
  const handleCornerResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = sizeRef.current.width
    const startHeight = sizeRef.current.height

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth - (ev.clientX - startX)))
      const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight - (ev.clientY - startY)))
      setSize({ width: newWidth, height: newHeight })

    }

    const onMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'nwse-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // Visibility guard: AFTER all hooks
  if (!bmadScanResult || !projectPath || !toolSupportsHeadless) return null

  const thread = chatThreads[AGENT_ID]
  const unreadCount = thread?.unreadCount || 0

  return (
    <>
      {/* Expanded chat panel */}
      <Grow in={bmadHelpOpen} style={{ transformOrigin: 'bottom right' }} timeout={225}>
        <Box
          sx={{
            position: 'fixed',
            bottom: 36,
            right: 16,
            width: size.width,
            height: size.height,
            zIndex: 1200,
            display: bmadHelpOpen ? 'flex' : 'none',
            flexDirection: 'column',
            bgcolor: 'background.paper',
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            boxShadow: 8,
            overflow: 'hidden',
          }}
        >
          {/* Top-left corner resize handle */}
          <Box
            onMouseDown={handleCornerResize}
            sx={{
              position: 'absolute', top: 0, left: 0, width: 12, height: 12,
              cursor: 'nwse-resize', zIndex: 2,
            }}
          />
          {/* Top edge resize handle */}
          <Box
            onMouseDown={handleTopResize}
            sx={{
              position: 'absolute', top: 0, left: 12, right: 0, height: 4,
              cursor: 'ns-resize', zIndex: 1,
              '&:hover': { bgcolor: 'primary.main', opacity: 0.3 },
            }}
          />
          {/* Left edge resize handle */}
          <Box
            onMouseDown={handleLeftResize}
            sx={{
              position: 'absolute', top: 12, left: 0, bottom: 0, width: 4,
              cursor: 'ew-resize', zIndex: 1,
              '&:hover': { bgcolor: 'primary.main', opacity: 0.3 },
            }}
          />

          {/* Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 1.5,
              py: 1,
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
            }}
          >
            <HelpOutlineIcon sx={{ fontSize: 18, mr: 1 }} />
            <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
              BMAD Help
            </Typography>
            <IconButton size="small" onClick={handleClear} sx={{ color: 'inherit', mr: 0.5 }} title="Clear chat">
              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton size="small" onClick={handleToggleFullSize} sx={{ color: 'inherit', mr: 0.5 }} title={isFullSize ? 'Restore size' : 'Full size'}>
              {isFullSize ? <CloseFullscreenIcon sx={{ fontSize: 16 }} /> : <OpenInFullIcon sx={{ fontSize: 16 }} />}
            </IconButton>
            <IconButton size="small" onClick={() => setBmadHelpOpen(false)} sx={{ color: 'inherit' }}>
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          {/* Chat thread */}
          <HelpChatThread />
        </Box>
      </Grow>

      {/* FAB button */}
      {!bmadHelpOpen && (
        <Fab
          variant="extended"
          size="medium"
          color="primary"
          onClick={handleToggle}
          sx={{
            position: 'fixed',
            bottom: 36,
            right: 16,
            zIndex: 1200,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.8rem',
          }}
        >
          <Badge badgeContent={unreadCount} color="error" sx={{ mr: 1 }}>
            <HelpOutlineIcon sx={{ fontSize: 20 }} />
          </Badge>
          BMAD Help
        </Fab>
      )}
    </>
  )
}
