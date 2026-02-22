import { useEffect, useRef, useCallback } from 'react'
import { Box, Button, Typography, CircularProgress, Alert } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { useStore } from '../../store'

interface InstallStepProps {
  onComplete: () => void
}

export default function InstallStep({ onComplete }: InstallStepProps) {
  const { projectWizard, appendWizardInstallLog, setWizardError, updateWizardStep, outputFolder } = useStore()
  const logEndRef = useRef<HTMLDivElement>(null)
  const isInstalling = projectWizard.stepStatuses[0] === 'active'
  const isCompleted = projectWizard.stepStatuses[0] === 'completed'
  const hasError = projectWizard.stepStatuses[0] === 'error'

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [projectWizard.installProgress])

  // Listen for install output and completion
  useEffect(() => {
    const cleanupOutput = window.wizardAPI.onInstallOutput((event) => {
      const lines = event.chunk.split('\n').filter(Boolean)
      for (const line of lines) {
        appendWizardInstallLog(line)
      }
    })

    const cleanupComplete = window.wizardAPI.onInstallComplete((event) => {
      if (event.success) {
        updateWizardStep(0, 'completed')
        onComplete()
      } else {
        updateWizardStep(0, 'error')
        setWizardError(event.error || 'Installation failed')
      }
    })

    return () => {
      cleanupOutput()
      cleanupComplete()
    }
  }, [appendWizardInstallLog, updateWizardStep, setWizardError, onComplete])

  const modules = projectWizard.selectedModules || ['bmm']
  const hasGds = modules.includes('gds')

  const handleInstall = useCallback(async () => {
    if (!projectWizard.projectPath) return

    setWizardError(null)
    updateWizardStep(0, 'active')

    const result = await window.wizardAPI.install(projectWizard.projectPath, false, outputFolder, modules)
    if (!result.success) {
      updateWizardStep(0, 'error')
      setWizardError(result.error || 'Failed to start installation')
    }
  }, [projectWizard.projectPath, outputFolder, modules, updateWizardStep, setWizardError])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
      <Typography variant="body2" color="text.secondary">
        This will run <code>npx bmad-method install</code> to set up BMAD in your project folder
        {hasGds ? ' with the Game Dev Studio module' : ''}.
        It installs the necessary configuration files and templates.
        {modules.length > 1 && (
          <> Modules: <strong>{modules.join(', ')}</strong></>
        )}
      </Typography>

      {!isInstalling && !isCompleted && !hasError && (
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleInstall}
        >
          Install BMAD Method
        </Button>
      )}

      {isInstalling && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="primary">
            Installing...
          </Typography>
        </Box>
      )}

      {isCompleted && (
        <Alert severity="success" icon={<CheckCircleIcon />}>
          BMAD Method installed successfully!
        </Alert>
      )}

      {hasError && projectWizard.error && (
        <Alert severity="error">
          {projectWizard.error}
          <Button size="small" onClick={handleInstall} sx={{ ml: 1 }}>
            Retry
          </Button>
        </Alert>
      )}

      {/* Terminal-like log output */}
      {projectWizard.installProgress.length > 0 && (
        <Box
          sx={{
            bgcolor: '#1e1e1e',
            color: '#d4d4d4',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            p: 1.5,
            borderRadius: 1,
            maxHeight: 200,
            overflow: 'auto',
            lineHeight: 1.6
          }}
        >
          {projectWizard.installProgress.map((line, i) => (
            <Box key={i} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {line}
            </Box>
          ))}
          <div ref={logEndRef} />
        </Box>
      )}
    </Box>
  )
}
