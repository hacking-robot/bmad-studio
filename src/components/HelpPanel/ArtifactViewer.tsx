import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  Chip,
  CircularProgress
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { gruvboxDark, gruvboxLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useStore } from '../../store'
import { gruvbox } from '../../theme'
import { type DocumentFile, getArtifactTypeLabel, getArtifactTypeColor } from '../../hooks/useDocuments'

// Factory function to create code component with theme awareness
const createCodeBlock = (isDark: boolean): Components['code'] => {
  return ({ className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1] : ''
    const codeString = String(children).replace(/\n$/, '')

    // Check if this is inline code (no language and short content without newlines)
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
          fontSize: '0.85rem'
        }}
      >
        {codeString}
      </SyntaxHighlighter>
    )
  }
}

interface ArtifactViewerProps {
  artifact: DocumentFile | null
  onClose: () => void
}

export default function ArtifactViewer({ artifact, onClose }: ArtifactViewerProps) {
  const themeMode = useStore((state) => state.themeMode)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load artifact content when artifact changes
  useEffect(() => {
    if (!artifact) {
      setContent(null)
      return
    }

    const loadContent = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await window.fileAPI.readFile(artifact.path)
        if (result.error || !result.content) {
          setError(result.error || 'Failed to read file')
        } else {
          setContent(result.content)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read file')
      } finally {
        setLoading(false)
      }
    }

    loadContent()
  }, [artifact])

  const CodeBlock = createCodeBlock(themeMode === 'dark')

  return (
    <Dialog
      open={Boolean(artifact)}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '85vh'
        }
      }}
    >
      {artifact && (
        <>
          <DialogTitle
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              pr: 6
            }}
          >
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Chip
                  label={getArtifactTypeLabel(artifact.type)}
                  size="small"
                  sx={{
                    bgcolor: getArtifactTypeColor(artifact.type),
                    color: 'white',
                    fontWeight: 600
                  }}
                />
              </Box>
              <Typography variant="h6" fontWeight={600}>
                {artifact.displayName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {artifact.name}
              </Typography>
            </Box>
            <IconButton
              onClick={onClose}
              sx={{
                position: 'absolute',
                right: 16,
                top: 16
              }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <DialogContent dividers>
            {loading ? (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: 6,
                  gap: 2
                }}
              >
                <CircularProgress size={24} />
                <Typography color="text.secondary">Loading document...</Typography>
              </Box>
            ) : error ? (
              <Box sx={{ p: 3 }}>
                <Typography color="error">{error}</Typography>
              </Box>
            ) : content ? (
              <Box
                sx={{
                  '& h1, & h2, & h3, & h4': {
                    mt: 3,
                    mb: 1.5,
                    '&:first-of-type': { mt: 0 }
                  },
                  '& h1': { fontSize: '1.75rem', fontWeight: 600 },
                  '& h2': { fontSize: '1.5rem', fontWeight: 600 },
                  '& h3': { fontSize: '1.25rem', fontWeight: 600 },
                  '& h4': { fontSize: '1.1rem', fontWeight: 600 },
                  '& p': { mb: 1.5, lineHeight: 1.7 },
                  '& ul, & ol': {
                    pl: 3,
                    mb: 1.5,
                    '& li': {
                      mb: 0.5
                    }
                  },
                  '& blockquote': {
                    borderLeft: 4,
                    borderColor: 'primary.main',
                    pl: 2,
                    ml: 0,
                    my: 2,
                    color: 'text.secondary',
                    fontStyle: 'italic'
                  },
                  '& table': {
                    width: '100%',
                    borderCollapse: 'collapse',
                    mb: 2,
                    '& th, & td': {
                      border: 1,
                      borderColor: 'divider',
                      p: 1
                    },
                    '& th': {
                      bgcolor: 'action.hover',
                      fontWeight: 600
                    }
                  },
                  '& hr': {
                    border: 'none',
                    borderTop: 1,
                    borderColor: 'divider',
                    my: 3
                  }
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
                  {content}
                </ReactMarkdown>
              </Box>
            ) : null}
          </DialogContent>
        </>
      )}
    </Dialog>
  )
}
