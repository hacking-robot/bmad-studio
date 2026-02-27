import { useState, useRef, useEffect, ReactNode } from 'react'
import {
  Box,
  Menu,
  MenuItem,
  InputBase,
  Typography,
  CircularProgress
} from '@mui/material'

export interface SearchableDropdownItem {
  id: string
  label: string
  customRender?: ReactNode
}

interface SearchableDropdownProps {
  items: SearchableDropdownItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  placeholder?: string
  anchorEl: HTMLElement | null
  open: boolean
  onClose: () => void
  loading?: boolean
  emptyMessage?: string
}

export default function SearchableDropdown({
  items,
  selectedId,
  onSelect,
  placeholder = 'Search...',
  anchorEl,
  open,
  onClose,
  loading = false,
  emptyMessage = 'No items found'
}: SearchableDropdownProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [preSelectedIndex, setPreSelectedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Filter items based on search query
  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true
    return item.label.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Auto-focus search input when menu opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    } else {
      setSearchQuery('')
      setPreSelectedIndex(0)
    }
  }, [open])

  // Reset pre-selected index when filtered results change
  useEffect(() => {
    setPreSelectedIndex(0)
  }, [searchQuery])

  // Pre-select the current item when opening
  useEffect(() => {
    if (open && selectedId) {
      const index = filteredItems.findIndex((item) => item.id === selectedId)
      if (index >= 0) {
        setPreSelectedIndex(index)
      }
    }
  }, [open, selectedId, filteredItems])

  const handleSelect = (id: string) => {
    onSelect(id)
    onClose()
  }

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      autoFocus={false}
      disableAutoFocusItem
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'left'
      }}
      transformOrigin={{
        vertical: 'bottom',
        horizontal: 'left'
      }}
      slotProps={{
        paper: {
          sx: {
            minWidth: 200,
            maxWidth: 300,
            maxHeight: 300,
            mb: 1
          }
        }
      }}
    >
      <InputBase
        inputRef={searchInputRef}
        placeholder={placeholder}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()

          if (e.key === 'Enter' && filteredItems.length > 0) {
            const selectedItem = filteredItems[preSelectedIndex]
            if (selectedItem) {
              handleSelect(selectedItem.id)
            }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setPreSelectedIndex((prev) =>
              Math.min(prev + 1, filteredItems.length - 1)
            )
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setPreSelectedIndex((prev) => Math.max(prev - 1, 0))
          } else if (e.key === 'Escape') {
            onClose()
          }
        }}
        sx={{
          px: 2,
          py: 1,
          width: '100%',
          fontSize: '0.875rem',
          borderBottom: 1,
          borderColor: 'divider',
          '& input::placeholder': {
            color: 'text.secondary',
            opacity: 1
          }
        }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      ) : filteredItems.length === 0 ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ px: 2, py: 1.5, display: 'block', fontStyle: 'italic' }}
        >
          {emptyMessage}
        </Typography>
      ) : (
        filteredItems.map((item, index) => (
          <MenuItem
            key={item.id}
            onClick={() => handleSelect(item.id)}
            selected={item.id === selectedId}
            sx={{
              py: 1,
              ...(index === preSelectedIndex && {
                bgcolor: 'action.hover'
              })
            }}
            onMouseEnter={() => setPreSelectedIndex(index)}
          >
            {item.customRender || (
              <Typography
                variant="body2"
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {item.label}
              </Typography>
            )}
          </MenuItem>
        ))
      )}
    </Menu>
  )
}
