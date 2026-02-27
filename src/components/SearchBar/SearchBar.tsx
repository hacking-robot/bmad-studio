import { InputBase, Box } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { useStore } from '../../store'

export default function SearchBar() {
  const searchQuery = useStore((state) => state.searchQuery)
  const setSearchQuery = useStore((state) => state.setSearchQuery)

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        bgcolor: 'action.hover',
        borderRadius: 2,
        px: 1.5,
        py: 0.5,
        minWidth: 200,
        maxWidth: 300,
        '&:focus-within': {
          bgcolor: 'action.selected',
          outline: 2,
          outlineColor: 'primary.main',
          outlineOffset: -2
        }
      }}
    >
      <SearchIcon
        sx={{
          color: 'text.secondary',
          fontSize: 20,
          mr: 1
        }}
      />
      <InputBase
        placeholder="Search stories..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        sx={{
          flex: 1,
          fontSize: '0.875rem',
          '& input': {
            p: 0
          }
        }}
      />
    </Box>
  )
}
