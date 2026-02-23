import rawSchemes from './base24-schemes.json'

export interface Base24Palette {
  base00: string; base01: string; base02: string; base03: string
  base04: string; base05: string; base06: string; base07: string
  base08: string; base09: string; base0A: string; base0B: string
  base0C: string; base0D: string; base0E: string; base0F: string
  base10: string; base11: string; base12: string; base13: string
  base14: string; base15: string; base16: string; base17: string
}

export interface Base24Scheme {
  name: string
  author: string
  variant: 'light' | 'dark'
  palette: Base24Palette
}

/** All base24 schemes keyed by slug */
export const base24Schemes = rawSchemes as Record<string, Base24Scheme>

// ---------------------------------------------------------------------------
// WCAG Contrast Filtering
// ---------------------------------------------------------------------------

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
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Check if a scheme meets minimum readability requirements.
 * Returns true if the scheme passes all critical contrast checks:
 *   - text on background (base05/base00) >= 4.5:1 (WCAG AA)
 *   - text on paper (base05/base01) >= 3:1
 *   - primary accent visible on bg (best of base16/base0D vs base00) >= 3:1
 *   - button text readable (base00 vs best primary) >= 3:1
 *
 * For the primary accent check, we test BOTH the bright (base16) and
 * standard (base0D) variants and use whichever has more contrast.
 * This matches the adaptive pick logic in createBase24Theme(), which
 * selects the higher-contrast variant as primary.main.
 */
function isReadable(p: Base24Palette): boolean {
  const textOnBg = contrastRatio(p.base05, p.base00)
  const textOnPaper = contrastRatio(p.base05, p.base01)

  // Pick the accent with better contrast (same logic as theme factory)
  const cr16 = contrastRatio(p.base16, p.base00)
  const cr0D = contrastRatio(p.base0D, p.base00)
  const primaryOnBg = Math.max(cr16, cr0D)
  const bestPrimary = cr16 >= cr0D ? p.base16 : p.base0D
  const contrastOnPrimary = contrastRatio(p.base00, bestPrimary)

  return textOnBg >= 4.5 && textOnPaper >= 3 && primaryOnBg >= 3 && contrastOnPrimary >= 3
}

/** Sorted list of { slug, name, variant } — only readable schemes */
export const themeList = Object.entries(base24Schemes)
  .filter(([, scheme]) => isReadable(scheme.palette))
  .map(([slug, scheme]) => ({
    slug,
    name: scheme.name,
    variant: scheme.variant,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))
