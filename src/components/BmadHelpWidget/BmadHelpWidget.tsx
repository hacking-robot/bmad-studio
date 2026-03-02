import { Box, Fab, Badge, Typography, IconButton, Grow } from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useStore } from '../../store'
import { AI_TOOLS } from '../../types'
import HelpChatThread from './HelpChatThread'

const AGENT_ID = 'bmad-help'

export default function BmadHelpWidget() {
  const bmadHelpOpen = useStore((state) => state.bmadHelpOpen)
  const setBmadHelpOpen = useStore((state) => state.setBmadHelpOpen)
  const bmadScanResult = useStore((state) => state.bmadScanResult)
  const projectPath = useStore((state) => state.projectPath)
  const aiTool = useStore((state) => state.aiTool)
  const chatThreads = useStore((state) => state.chatThreads)
  const clearChatThread = useStore((state) => state.clearChatThread)

  const selectedToolInfo = AI_TOOLS.find(t => t.id === aiTool)
  const toolSupportsHeadless = selectedToolInfo?.cli.supportsHeadless ?? false

  // Visibility guard: only show when BMAD project is loaded with headless-capable tool
  if (!bmadScanResult || !projectPath || !toolSupportsHeadless) return null

  const thread = chatThreads[AGENT_ID]
  const unreadCount = thread?.unreadCount || 0

  const handleToggle = () => {
    const next = !bmadHelpOpen
    setBmadHelpOpen(next)
    if (next && thread) {
      useStore.getState().markChatRead(AGENT_ID)
    }
  }

  const handleClear = () => {
    clearChatThread(AGENT_ID)
    window.chatAPI.cancelMessage(AGENT_ID, projectPath || undefined)
  }

  return (
    <>
      {/* Expanded chat panel */}
      <Grow in={bmadHelpOpen} style={{ transformOrigin: 'bottom right' }} timeout={225}>
        <Box
          sx={{
            position: 'fixed',
            bottom: 36,
            right: 16,
            width: 380,
            height: 500,
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
