import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  IconButton,
  Tab,
  Tabs
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import InfoIcon from '@mui/icons-material/Info'
import GroupIcon from '@mui/icons-material/Group'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import TerminalIcon from '@mui/icons-material/Terminal'
import FlagIcon from '@mui/icons-material/Flag'
import { useStore } from '../../store'
import { hasBoardModule } from '../../utils/projectTypes'
import OverviewTab from './OverviewTab'
import AgentsTab from './AgentsTab'
import WorkflowTab from './WorkflowTab'
import CommandsTab from './CommandsTab'
import EpicsTab from './EpicsTab'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{
        py: 2,
        height: 'calc(70vh - 120px)',
        overflow: 'auto'
      }}
    >
      {value === index && children}
    </Box>
  )
}

interface HelpPanelProps {
  open: boolean
  onClose: () => void
  initialTab?: number
}

export default function HelpPanel({ open, onClose, initialTab = 0 }: HelpPanelProps) {
  const projectType = useStore((state) => state.projectType)
  const bmadScanResult = useStore((state) => state.bmadScanResult)
  const hasBrd = bmadScanResult?.modules ? hasBoardModule(bmadScanResult.modules) : projectType !== 'dashboard'

  const tabs = useMemo(() => {
    const all = [
      { label: 'Overview', icon: <InfoIcon />, component: <OverviewTab /> },
      { label: 'Agents', icon: <GroupIcon />, component: <AgentsTab /> },
      { label: 'Workflow', icon: <AccountTreeIcon />, component: <WorkflowTab /> },
      { label: 'Commands', icon: <TerminalIcon />, component: <CommandsTab /> },
    ]
    if (hasBrd) {
      all.push({ label: 'Epics', icon: <FlagIcon />, component: <EpicsTab /> })
    }
    return all
  }, [hasBrd])

  const [tabValue, setTabValue] = useState(initialTab)

  // Reset to initial tab when dialog opens
  useEffect(() => {
    if (open) {
      setTabValue(Math.min(initialTab, tabs.length - 1))
    }
  }, [open, initialTab, tabs.length])

  // Listen for keyboard shortcut (Cmd+Shift+H or F1)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F1 key
      if (e.key === 'F1') {
        e.preventDefault()
        if (!open) {
          window.dispatchEvent(new CustomEvent('open-help-panel'))
        }
      }
      // Cmd+Shift+H
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        if (!open) {
          window.dispatchEvent(new CustomEvent('open-help-panel'))
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            height: '80vh',
            maxHeight: 800
          }
        }
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 0,
          fontWeight: 600
        }}
      >
        BMAD Guide
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          {tabs.map((tab) => (
            <Tab
              key={tab.label}
              icon={tab.icon}
              iconPosition="start"
              label={tab.label}
              sx={{ minHeight: 48 }}
            />
          ))}
        </Tabs>
      </Box>

      <DialogContent>
        {tabs.map((tab, index) => (
          <TabPanel key={tab.label} value={tabValue} index={index}>
            {tab.component}
          </TabPanel>
        ))}
      </DialogContent>
    </Dialog>
  )
}
