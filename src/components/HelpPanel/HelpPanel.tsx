import { useState, useEffect } from 'react'
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
  const [tabValue, setTabValue] = useState(initialTab)

  // Reset to initial tab when dialog opens
  useEffect(() => {
    if (open) {
      setTabValue(initialTab)
    }
  }, [open, initialTab])

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
          <Tab
            icon={<InfoIcon />}
            iconPosition="start"
            label="Overview"
            sx={{ minHeight: 48 }}
          />
          <Tab
            icon={<GroupIcon />}
            iconPosition="start"
            label="Agents"
            sx={{ minHeight: 48 }}
          />
          <Tab
            icon={<AccountTreeIcon />}
            iconPosition="start"
            label="Workflow"
            sx={{ minHeight: 48 }}
          />
          <Tab
            icon={<TerminalIcon />}
            iconPosition="start"
            label="Commands"
            sx={{ minHeight: 48 }}
          />
          <Tab
            icon={<FlagIcon />}
            iconPosition="start"
            label="Epics"
            sx={{ minHeight: 48 }}
          />
        </Tabs>
      </Box>

      <DialogContent>
        <TabPanel value={tabValue} index={0}>
          <OverviewTab />
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          <AgentsTab />
        </TabPanel>
        <TabPanel value={tabValue} index={2}>
          <WorkflowTab />
        </TabPanel>
        <TabPanel value={tabValue} index={3}>
          <CommandsTab />
        </TabPanel>
        <TabPanel value={tabValue} index={4}>
          <EpicsTab />
        </TabPanel>
      </DialogContent>
    </Dialog>
  )
}
