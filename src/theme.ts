import { createTheme, ThemeOptions } from '@mui/material/styles'

// Official Gruvbox color palette from https://github.com/morhetz/gruvbox
const gruvbox = {
  // Dark mode backgrounds (used as bg in dark, fg in light)
  dark0_hard: '#1d2021',
  dark0: '#282828',
  dark0_soft: '#32302f',
  dark1: '#3c3836',
  dark2: '#504945',
  dark3: '#665c54',
  dark4: '#7c6f64',

  // Light mode backgrounds (used as bg in light, fg in dark)
  light0_hard: '#f9f5d7',
  light0: '#fbf1c7',
  light0_soft: '#f2e5bc',
  light1: '#ebdbb2',
  light2: '#d5c4a1',
  light3: '#bdae93',
  light4: '#a89984',

  // Neutral gray
  gray: '#928374',

  // Accent colors: [bright, neutral, faded]
  red: { bright: '#fb4934', neutral: '#cc241d', faded: '#9d0006' },
  green: { bright: '#b8bb26', neutral: '#98971a', faded: '#79740e' },
  yellow: { bright: '#fabd2f', neutral: '#d79921', faded: '#b57614' },
  blue: { bright: '#83a598', neutral: '#458588', faded: '#076678' },
  purple: { bright: '#d3869b', neutral: '#b16286', faded: '#8f3f71' },
  aqua: { bright: '#8ec07c', neutral: '#689d6a', faded: '#427b58' },
  orange: { bright: '#fe8019', neutral: '#d65d0e', faded: '#af3a03' }
}

const commonOptions: ThemeOptions = {
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: { fontSize: '2rem', fontWeight: 600 },
    h2: { fontSize: '1.5rem', fontWeight: 600 },
    h3: { fontSize: '1.25rem', fontWeight: 600 },
    h4: { fontSize: '1.125rem', fontWeight: 600 },
    h5: { fontSize: '1rem', fontWeight: 600 },
    h6: { fontSize: '0.875rem', fontWeight: 600 },
    body1: { fontSize: '0.9375rem' },
    body2: { fontSize: '0.875rem' }
  },
  shape: {
    borderRadius: 8
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)'
        }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500
        }
      }
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          WebkitAppRegion: 'no-drag'
        }
      }
    }
  }
}

// Gruvbox Light Theme
export const lightTheme = createTheme({
  ...commonOptions,
  palette: {
    mode: 'light',
    primary: {
      main: gruvbox.blue.faded,
      light: gruvbox.blue.neutral,
      dark: '#045566',
      contrastText: gruvbox.light0
    },
    secondary: {
      main: gruvbox.purple.faded,
      light: gruvbox.purple.neutral,
      dark: '#6d2f55',
      contrastText: gruvbox.light0
    },
    error: {
      main: gruvbox.red.faded,
      light: gruvbox.red.neutral,
      dark: '#7c0005'
    },
    warning: {
      main: gruvbox.orange.faded,
      light: gruvbox.orange.neutral,
      dark: '#8a2e02'
    },
    info: {
      main: gruvbox.blue.faded,
      light: gruvbox.blue.neutral,
      dark: '#045566'
    },
    success: {
      main: gruvbox.green.faded,
      light: gruvbox.green.neutral,
      dark: '#5f5c0b'
    },
    background: {
      default: gruvbox.light0,
      paper: gruvbox.light0_hard
    },
    text: {
      primary: gruvbox.dark1,
      secondary: gruvbox.dark4
    },
    divider: gruvbox.light2
  }
})

// Gruvbox Dark Theme
export const darkTheme = createTheme({
  ...commonOptions,
  palette: {
    mode: 'dark',
    primary: {
      main: gruvbox.blue.bright,
      light: '#a9c4b8',
      dark: gruvbox.blue.neutral,
      contrastText: gruvbox.dark0
    },
    secondary: {
      main: gruvbox.purple.bright,
      light: '#e4a8b8',
      dark: gruvbox.purple.neutral,
      contrastText: gruvbox.dark0
    },
    error: {
      main: gruvbox.red.bright,
      light: '#fc7066',
      dark: gruvbox.red.neutral
    },
    warning: {
      main: gruvbox.orange.bright,
      light: '#fea04a',
      dark: gruvbox.orange.neutral
    },
    info: {
      main: gruvbox.blue.bright,
      light: '#a9c4b8',
      dark: gruvbox.blue.neutral
    },
    success: {
      main: gruvbox.green.bright,
      light: '#cdd055',
      dark: gruvbox.green.neutral
    },
    background: {
      default: gruvbox.dark0,
      paper: gruvbox.dark1
    },
    text: {
      primary: gruvbox.light1,
      secondary: gruvbox.light4
    },
    divider: gruvbox.dark3
  },
  components: {
    ...commonOptions.components,
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
          backgroundImage: 'none'
        }
      }
    }
  }
})

// Export gruvbox colors for use in other components
export { gruvbox }
