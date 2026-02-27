import { IconButton, Tooltip } from '@mui/material'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import { useStore } from '../../store'

export default function ThemeToggle() {
  const themeMode = useStore((state) => state.themeMode)
  const toggleTheme = useStore((state) => state.toggleTheme)

  return (
    <Tooltip title={themeMode === 'light' ? 'Dark mode' : 'Light mode'}>
      <IconButton
        onClick={toggleTheme}
        size="small"
        sx={{ color: 'text.secondary' }}
      >
        {themeMode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
      </IconButton>
    </Tooltip>
  )
}
