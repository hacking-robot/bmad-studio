import { useState, useRef, useEffect } from 'react'
import {
  Box,
  Typography,
  Menu,
  MenuItem,
  IconButton,
  Divider,
  InputBase,
  Chip
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import CloseIcon from '@mui/icons-material/Close'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import AddIcon from '@mui/icons-material/Add'
import CloudIcon from '@mui/icons-material/Cloud'
import { useStore } from '../../store'
import { useProjectData } from '../../hooks/useProjectData'
import { NewProjectForm } from '../NewProjectDialog'
import { OpenRemoteDialog } from '../RemoteBranchViewer'

export default function ProjectSwitcher() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [preSelectedIndex, setPreSelectedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const projectPath = useStore((state) => state.projectPath)
  const attachedLocalProjectPath = useStore((state) => state.attachedLocalProjectPath)
  const recentProjects = useStore((state) => state.recentProjects)
  const removeRecentProject = useStore((state) => state.removeRecentProject)
  const { selectProject, switchToProject } = useProjectData()

  const open = Boolean(anchorEl)
  // Use the real local project path when in attached remote view (projectPath is a cache path)
  const displayPath = attachedLocalProjectPath || projectPath
  const projectName = displayPath?.split('/').pop() || 'BMad Studio'

  // Filter projects based on search query
  const filteredProjects = recentProjects.filter((project) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      project.name.toLowerCase().includes(query) ||
      project.path.toLowerCase().includes(query)
    )
  })

  // Auto-focus search input when menu opens
  useEffect(() => {
    if (open) {
      // Small delay to ensure the menu is rendered
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    } else {
      // Clear search when menu closes
      setSearchQuery('')
      setPreSelectedIndex(0)
    }
  }, [open])

  // Reset pre-selected index when filtered results change
  useEffect(() => {
    setPreSelectedIndex(0)
  }, [searchQuery])

  const handleClick = () => {
    // Toggle menu on click
    if (open) {
      setAnchorEl(null)
    } else if (triggerRef.current) {
      setAnchorEl(triggerRef.current)
    }
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleProjectClick = (project: import('../../store').RecentProject) => {
    switchToProject(project)
    handleClose()
  }

  const handleRemoveProject = (event: React.MouseEvent, path: string) => {
    event.stopPropagation()
    removeRecentProject(path)
  }

  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false)

  const handleOpenProject = () => {
    selectProject()
    handleClose()
  }

  const handleNewProject = () => {
    handleClose()
    setNewProjectOpen(true)
  }

  // Truncate path for display
  const truncatePath = (path: string, maxLength: number = 40) => {
    if (path.length <= maxLength) return path
    return '...' + path.slice(-maxLength)
  }

  return (
    <>
    <Box
      ref={triggerRef}
      onClick={handleClick}
      sx={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        cursor: 'pointer',
        // Exclude from window drag region
        WebkitAppRegion: 'no-drag'
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          borderRadius: 1,
          '&:hover': {
            bgcolor: 'action.hover'
          }
        }}
      >
        <Typography
          variant="h6"
          color="text.primary"
          fontWeight={600}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {projectName}
        </Typography>
        <KeyboardArrowDownIcon
          sx={{
            fontSize: 20,
            color: 'text.secondary',
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'none'
          }}
        />
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        autoFocus={false}
        disableAutoFocusItem
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center'
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center'
        }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 320,
              maxHeight: 400,
              mt: 1,
              WebkitAppRegion: 'no-drag'
            }
          }
        }}
      >
        <MenuItem onClick={handleOpenProject} sx={{ py: 1.5 }}>
          <FolderOpenIcon sx={{ fontSize: 20, mr: 1.5, color: 'text.secondary' }} />
          <Typography variant="body2">Open Project...</Typography>
        </MenuItem>
        <MenuItem onClick={handleNewProject} sx={{ py: 1.5 }}>
          <AddIcon sx={{ fontSize: 20, mr: 1.5, color: 'text.secondary' }} />
          <Typography variant="body2">New Project...</Typography>
        </MenuItem>
        <MenuItem onClick={() => { handleClose(); setRemoteDialogOpen(true) }} sx={{ py: 1.5 }}>
          <CloudIcon sx={{ fontSize: 20, mr: 1.5, color: 'text.secondary' }} />
          <Typography variant="body2">Open Remote Project...</Typography>
        </MenuItem>

        {recentProjects.length > 0 && (
          <Box>
            <Divider sx={{ my: 1 }} />
            <InputBase
              inputRef={searchInputRef}
              placeholder="Recent Projects"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                // Stop propagation to prevent Menu's default keyboard handling
                e.stopPropagation()

                if (e.key === 'Enter' && filteredProjects.length > 0) {
                  const selectedProject = filteredProjects[preSelectedIndex]
                  if (selectedProject) {
                    handleProjectClick(selectedProject)
                  }
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setPreSelectedIndex((prev) =>
                    Math.min(prev + 1, filteredProjects.length - 1)
                  )
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setPreSelectedIndex((prev) => Math.max(prev - 1, 0))
                } else if (e.key === 'Escape') {
                  handleClose()
                }
              }}
              sx={{
                px: 2,
                py: 1,
                width: '100%',
                fontSize: '0.75rem',
                color: 'text.secondary',
                '& input::placeholder': {
                  color: 'text.secondary',
                  opacity: 1
                }
              }}
            />
            {filteredProjects.length === 0 && searchQuery.trim() && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ px: 2, py: 1, display: 'block', fontStyle: 'italic' }}
              >
                No projects found
              </Typography>
            )}
            {filteredProjects.map((project, index) => (
              <MenuItem
                key={project.path}
                onClick={() => handleProjectClick(project)}
                selected={project.path === projectPath}
                onMouseEnter={() => {
                  setHoveredItem(project.path)
                  setPreSelectedIndex(index)
                }}
                onMouseLeave={() => setHoveredItem(null)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  py: 1.5,
                  pr: 1,
                  // Pre-selection highlight (first match when typing)
                  ...(index === preSelectedIndex && filteredProjects.length > 0 && {
                    bgcolor: 'action.hover'
                  })
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0, mr: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {project.isRemote && <CloudIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />}
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {project.name}
                    </Typography>
                    {project.isRemote && (
                      <Chip label="Remote" size="small" variant="outlined" color="info" sx={{ height: 18, fontSize: '0.6rem' }} />
                    )}
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {project.isRemote ? project.remoteUrl : truncatePath(project.path)}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={(e) => handleRemoveProject(e, project.path)}
                  sx={{
                    opacity: hoveredItem === project.path ? 1 : 0,
                    transition: 'opacity 0.2s',
                    ml: 1,
                    '&:hover': {
                      bgcolor: 'error.main',
                      color: 'error.contrastText'
                    }
                  }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </MenuItem>
            ))}
          </Box>
        )}
      </Menu>

    </Box>
    <NewProjectForm open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
    <OpenRemoteDialog open={remoteDialogOpen} onClose={() => setRemoteDialogOpen(false)} />
    </>
  )
}
