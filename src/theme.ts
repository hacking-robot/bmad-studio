import { createTheme, ThemeOptions } from '@mui/material/styles'
import type { Base24Palette, Base24Scheme } from './data/themes'

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Convert 6-char hex (no #) to HSL [h, s%, l%] */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s * 100, l * 100]
}

/** Convert HSL to 6-char hex (no #) */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return toHex(r) + toHex(g) + toHex(b)
}

/** Adjust lightness of a hex color by `amount` percentage points (positive = lighter) */
export function adjustLightness(hex: string, amount: number): string {
  const clean = hex.replace(/^#/, '')
  const [h, s, l] = hexToHsl(clean)
  return '#' + hslToHex(h, s, Math.max(0, Math.min(100, l + amount)))
}

/** Prefix a bare hex string with # */
function h(hex: string): string {
  return '#' + hex
}

/** WCAG relative luminance from a 6-char hex string (no #) */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const [sr, sg, sb] = [r, g, b].map(c =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  )
  return 0.2126 * sr + 0.7152 * sg + 0.0722 * sb
}

/** WCAG contrast ratio between two 6-char hex strings (no #) */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace(/^#/, '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ---------------------------------------------------------------------------
// Common theme options (shared across all themes)
// ---------------------------------------------------------------------------

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
    },
  }
}

// ---------------------------------------------------------------------------
// Base24 → MUI Theme Factory
// ---------------------------------------------------------------------------

/**
 * Create a MUI theme from a Base24 scheme and mode.
 *
 * The `mode` parameter determines how the palette maps to MUI roles.
 * If the scheme's native variant doesn't match the requested mode,
 * the neutral scale is algorithmically inverted.
 */
// LRU cache: cap at 4 entries to prevent memory/Emotion style accumulation
// when cycling through many themes. Keeps current + a few recent themes.
const THEME_CACHE_MAX = 4
const themeCache = new Map<string, ReturnType<typeof createTheme>>()

/**
 * Derive safe background, paper, divider, and action state colors.
 *
 * Following the base16 spec (as used by Neovim & Ghostty):
 *   base00 = default background
 *   base01 = lighter background (panels, popups)
 *   base02 = selection background, interactive states
 *   base03 = comments, subtle/disabled elements
 *   base04 = dark foreground (secondary text)
 *   base05 = default foreground
 *
 * Many community base24 schemes have base01 darker than base00 in dark mode,
 * or base02 that's a vivid accent color. This function normalizes them.
 */
function deriveNeutrals(p: Base24Palette, isDark: boolean) {
  const bg = h(p.base00)
  const fg = h(p.base05)
  const raw01 = h(p.base01)

  // Ensure paper is slightly offset from default in the correct direction
  const bgL = hexToHsl(bg)[2]
  const paperL = hexToHsl(raw01)[2]

  let paper: string
  if (isDark) {
    // Paper should be lighter than default in dark mode
    paper = paperL > bgL ? raw01 : adjustLightness(bg, 5)
  } else {
    // Paper should be lighter (or equal) than default in light mode
    paper = paperL >= bgL ? raw01 : adjustLightness(bg, 3)
  }

  // Divider: always derive from background — subtle offset
  const divider = isDark ? adjustLightness(bg, 10) : adjustLightness(bg, -10)

  // Action states: tinted with foreground color at appropriate opacities
  // (Neovim uses base02 for selection/cursor-line, base03 for disabled)
  const action = {
    active: hexToRgba(fg, 0.56),
    hover: hexToRgba(fg, isDark ? 0.08 : 0.04),
    hoverOpacity: isDark ? 0.08 : 0.04,
    selected: hexToRgba(fg, isDark ? 0.16 : 0.08),
    selectedOpacity: isDark ? 0.16 : 0.08,
    disabled: hexToRgba(fg, 0.3),
    disabledBackground: hexToRgba(fg, 0.12),
    focus: hexToRgba(fg, 0.12),
    focusOpacity: 0.12,
    activatedOpacity: 0.12,
  }

  return { bg, paper, divider, action }
}

export function createBase24Theme(scheme: Base24Scheme) {
  const mode = scheme.variant
  // Build a cache key from palette values + mode
  const cacheKey = mode + ':' + Object.values(scheme.palette).join(',')
  const cached = themeCache.get(cacheKey)
  if (cached) {
    // Move to end of Map (most recently used) for LRU ordering
    themeCache.delete(cacheKey)
    themeCache.set(cacheKey, cached)
    return cached
  }

  const p = scheme.palette
  const isDark = mode === 'dark'
  const { bg, paper, divider, action } = deriveNeutrals(p, isDark)

  // Shared component overrides for both modes
  const themedComponents: ThemeOptions['components'] = {
    ...commonOptions.components,
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: isDark
            ? '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)'
            : '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
          ...(isDark && { backgroundImage: 'none' })
        }
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          // Neovim: popups use base02 bg, base05 fg
          backgroundColor: isDark ? adjustLightness(bg, 15) : adjustLightness(bg, -15),
          color: h(p.base05)
        }
      }
    },
  }

  // For each accent slot, pick whichever of the "standard" (base08-0F) or
  // "bright" (base12-17) variant has MORE contrast against the background.
  //
  // Dark themes: base12-17 (bright) nearly always win — bright on dark = high contrast.
  // Light themes: it varies by scheme author convention:
  //   - Gruvbox-style: base12-17 are dark/faded → they win (high contrast on light bg)
  //   - Catppuccin-style: base12-17 are bright → base08-0F win (darker = more contrast)
  //
  // This adaptive pick ensures readable accents regardless of convention.
  //
  // The losing variant becomes `light`/`dark` sub-color.
  // contrastText: base00 (bg) — always max contrast against accent buttons.
  // Warning uses base09 (orange, no bright variant in base24).

  /** Pick whichever hex has more contrast against bg as main; other becomes alt */
  const pickAccent = (bright: string, standard: string) => {
    const crBright = contrastRatio(bright, p.base00)
    const crStandard = contrastRatio(standard, p.base00)
    return crBright >= crStandard
      ? { main: h(bright), alt: h(standard) }
      : { main: h(standard), alt: h(bright) }
  }

  const blue = pickAccent(p.base16, p.base0D)
  const purple = pickAccent(p.base17, p.base0E)
  const red = pickAccent(p.base12, p.base08)
  const green = pickAccent(p.base14, p.base0B)
  const cyan = pickAccent(p.base15, p.base0C)

  const palette = {
    primary: {
      main: blue.main,
      light: isDark ? adjustLightness(blue.main, 15) : blue.alt,
      dark: isDark ? blue.alt : adjustLightness(blue.main, -15),
      contrastText: h(p.base00)
    },
    secondary: {
      main: purple.main,
      light: isDark ? adjustLightness(purple.main, 15) : purple.alt,
      dark: isDark ? purple.alt : adjustLightness(purple.main, -15),
      contrastText: h(p.base00)
    },
    error: {
      main: red.main,
      light: isDark ? adjustLightness(red.main, 15) : red.alt,
      dark: isDark ? red.alt : adjustLightness(red.main, -15)
    },
    warning: {
      main: isDark ? adjustLightness(h(p.base09), 10) : h(p.base09),
      light: adjustLightness(h(p.base09), isDark ? 25 : 15),
      dark: isDark ? h(p.base09) : adjustLightness(h(p.base09), -15)
    },
    info: {
      main: cyan.main,
      light: isDark ? adjustLightness(cyan.main, 15) : cyan.alt,
      dark: isDark ? cyan.alt : adjustLightness(cyan.main, -15)
    },
    success: {
      main: green.main,
      light: isDark ? adjustLightness(green.main, 15) : green.alt,
      dark: isDark ? green.alt : adjustLightness(green.main, -15)
    },
    background: {
      default: bg,
      paper
    },
    text: {
      primary: h(p.base05),
      secondary: h(p.base04)
    },
    divider,
    action
  }

  // Add link styling using resolved accent colors
  themedComponents.MuiCssBaseline = {
    styleOverrides: {
      a: {
        color: blue.main,
        textDecorationColor: blue.main,
        '&:hover': {
          color: isDark ? adjustLightness(blue.main, 15) : adjustLightness(blue.main, -15)
        }
      }
    }
  }

  const themeResult = createTheme({
    ...commonOptions,
    palette: {
      mode,
      ...palette
    },
    components: themedComponents
  })
  // LRU eviction: delete oldest entries when cache exceeds max size.
  // Map preserves insertion order, so first key = oldest entry.
  if (themeCache.size >= THEME_CACHE_MAX) {
    const oldest = themeCache.keys().next().value!
    themeCache.delete(oldest)
  }
  themeCache.set(cacheKey, themeResult)
  return themeResult
}

// ---------------------------------------------------------------------------
// Legacy Gruvbox exports (backward compat)
// ---------------------------------------------------------------------------

const gruvbox = {
  dark0_hard: '#1d2021',
  dark0: '#282828',
  dark0_soft: '#32302f',
  dark1: '#3c3836',
  dark2: '#504945',
  dark3: '#665c54',
  dark4: '#7c6f64',
  light0_hard: '#f9f5d7',
  light0: '#fbf1c7',
  light0_soft: '#f2e5bc',
  light1: '#ebdbb2',
  light2: '#d5c4a1',
  light3: '#bdae93',
  light4: '#a89984',
  gray: '#928374',
  red: { bright: '#fb4934', neutral: '#cc241d', faded: '#9d0006' },
  green: { bright: '#b8bb26', neutral: '#98971a', faded: '#79740e' },
  yellow: { bright: '#fabd2f', neutral: '#d79921', faded: '#b57614' },
  blue: { bright: '#83a598', neutral: '#458588', faded: '#076678' },
  purple: { bright: '#d3869b', neutral: '#b16286', faded: '#8f3f71' },
  aqua: { bright: '#8ec07c', neutral: '#689d6a', faded: '#427b58' },
  orange: { bright: '#fe8019', neutral: '#d65d0e', faded: '#af3a03' }
}

export const lightTheme = createTheme({
  ...commonOptions,
  palette: {
    mode: 'light',
    primary: { main: gruvbox.blue.faded, light: gruvbox.blue.neutral, dark: '#045566', contrastText: gruvbox.light0 },
    secondary: { main: gruvbox.purple.faded, light: gruvbox.purple.neutral, dark: '#6d2f55', contrastText: gruvbox.light0 },
    error: { main: gruvbox.red.faded, light: gruvbox.red.neutral, dark: '#7c0005' },
    warning: { main: gruvbox.orange.faded, light: gruvbox.orange.neutral, dark: '#8a2e02' },
    info: { main: gruvbox.blue.faded, light: gruvbox.blue.neutral, dark: '#045566' },
    success: { main: gruvbox.green.faded, light: gruvbox.green.neutral, dark: '#5f5c0b' },
    background: { default: gruvbox.light0, paper: gruvbox.light0_hard },
    text: { primary: gruvbox.dark1, secondary: gruvbox.dark4 },
    divider: gruvbox.light2
  },
  components: {
    ...commonOptions.components,
    MuiCssBaseline: {
      styleOverrides: {
        a: {
          color: gruvbox.blue.faded,
          textDecorationColor: gruvbox.blue.faded,
          '&:hover': { color: '#045566' }
        }
      }
    }
  }
})

export const darkTheme = createTheme({
  ...commonOptions,
  palette: {
    mode: 'dark',
    primary: { main: gruvbox.blue.bright, light: '#a9c4b8', dark: gruvbox.blue.neutral, contrastText: gruvbox.dark0 },
    secondary: { main: gruvbox.purple.bright, light: '#e4a8b8', dark: gruvbox.purple.neutral, contrastText: gruvbox.dark0 },
    error: { main: gruvbox.red.bright, light: '#fc7066', dark: gruvbox.red.neutral },
    warning: { main: gruvbox.orange.bright, light: '#fea04a', dark: gruvbox.orange.neutral },
    info: { main: gruvbox.blue.bright, light: '#a9c4b8', dark: gruvbox.blue.neutral },
    success: { main: gruvbox.green.bright, light: '#cdd055', dark: gruvbox.green.neutral },
    background: { default: gruvbox.dark0, paper: gruvbox.dark1 },
    text: { primary: gruvbox.light1, secondary: gruvbox.light4 },
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
    },
    MuiCssBaseline: {
      styleOverrides: {
        a: {
          color: gruvbox.blue.bright,
          textDecorationColor: gruvbox.blue.bright,
          '&:hover': { color: '#a9c4b8' }
        }
      }
    }
  }
})

export { gruvbox }
