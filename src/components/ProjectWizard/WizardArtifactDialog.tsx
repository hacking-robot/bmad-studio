import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  CircularProgress
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { gruvboxDark, gruvboxLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useStore } from '../../store'
import { gruvbox } from '../../theme'

const createCodeBlock = (isDark: boolean): Components['code'] => {
  return ({ className, children, ...props }) => {
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
        customStyle={{ margin: '8px 0', borderRadius: 8, fontSize: '0.85rem' }}
      >
        {codeString}
      </SyntaxHighlighter>
    )
  }
}

interface WizardArtifactDialogProps {
  open: boolean
  title: string
  filePath: string | null
  onClose: () => void
}

export default function WizardArtifactDialog({ open, title, filePath, onClose }: WizardArtifactDialogProps) {
  const themeMode = useStore((state) => state.themeMode)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !filePath) {
      setContent(null)
      return
    }

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await window.fileAPI.readFile(filePath)
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

    load()
  }, [open, filePath])

  const CodeBlock = createCodeBlock(themeMode === 'dark')

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { maxHeight: '85vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 6 }}>
        <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
          {title}
        </Typography>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {error && (
          <Typography color="error" sx={{ py: 2 }}>{error}</Typography>
        )}
        {content && (
          <Box sx={{
            '& h1': { fontSize: '1.5rem', fontWeight: 700, mt: 2, mb: 1 },
            '& h2': { fontSize: '1.25rem', fontWeight: 600, mt: 2, mb: 1 },
            '& h3': { fontSize: '1.1rem', fontWeight: 600, mt: 1.5, mb: 0.5 },
            '& p': { mb: 1, lineHeight: 1.6 },
            '& ul, & ol': { pl: 3, mb: 1 },
            '& li': { mb: 0.5 },
            '& table': { borderCollapse: 'collapse', width: '100%', mb: 1 },
            '& th, & td': { border: 1, borderColor: 'divider', px: 1.5, py: 0.75, fontSize: '0.85rem' },
            '& th': { fontWeight: 600, bgcolor: 'action.hover' },
            '& blockquote': { borderLeft: 3, borderColor: 'primary.main', pl: 2, ml: 0, my: 1, color: 'text.secondary' }
          }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
              {content}
            </ReactMarkdown>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}
