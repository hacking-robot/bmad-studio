/**
 * Build script: Fetches all base24 AND base16 YAML schemes from tinted-theming/schemes
 * and outputs a single JSON bundle at src/data/themes/base24-schemes.json
 *
 * Base24 schemes are included as-is (they have all 24 slots).
 * Base16 schemes (which only have base00-0F) get synthesized base10-17 slots:
 *   base10/base11 — deeper background shades (derived from base00)
 *   base12-17     — higher-contrast accent variants (derived from base08-0D,0E,0F)
 *
 * When the same slug exists in both folders, the base24 version wins
 * (it has hand-authored extended slots).
 *
 * Usage: npx tsx scripts/convert-themes.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import { parse } from 'yaml'
import { execFileSync } from 'child_process'

const OUTPUT_PATH = path.resolve(__dirname, '../src/data/themes/base24-schemes.json')
const REPO_URL = 'https://github.com/tinted-theming/schemes.git'
const TMP_DIR = path.resolve(__dirname, '../.tmp-schemes')

interface SchemeYaml {
  system: string
  name: string
  author: string
  variant: 'light' | 'dark'
  palette: Record<string, string>
}

interface Base24Scheme {
  name: string
  author: string
  variant: 'light' | 'dark'
  palette: Record<string, string>
}

// ---------------------------------------------------------------------------
// HSL utilities for synthesizing base10-17 from base16 palettes
// ---------------------------------------------------------------------------

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

function adjustLightness(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, Math.max(0, Math.min(100, l + amount)))
}

/**
 * Synthesize base10-17 from a base16 palette (base00-0F).
 *
 * base10/base11: deeper background shades beyond base00
 * base12-17: higher-contrast accent variants for the scheme's native mode.
 *   - Dark schemes → lighten accents (brighter on dark bg = more contrast)
 *   - Light schemes → darken accents (darker on light bg = more contrast)
 */
function synthesizeBase24(palette: Record<string, string>, variant: 'light' | 'dark'): Record<string, string> {
  const isDark = variant === 'dark'
  const shift = isDark ? 15 : -15

  return {
    ...palette,
    base10: adjustLightness(palette.base00, isDark ? -3 : 3),
    base11: adjustLightness(palette.base00, isDark ? -6 : 6),
    base12: adjustLightness(palette.base08, shift),
    base13: adjustLightness(palette.base0A, shift),
    base14: adjustLightness(palette.base0B, shift),
    base15: adjustLightness(palette.base0C, shift),
    base16: adjustLightness(palette.base0D, shift),
    base17: adjustLightness(palette.base0E, shift),
  }
}

// ---------------------------------------------------------------------------

function parseSchemesFromDir(dir: string): Record<string, { parsed: SchemeYaml; palette: Record<string, string> }> {
  const result: Record<string, { parsed: SchemeYaml; palette: Record<string, string> }> = {}
  if (!fs.existsSync(dir)) return result

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'))
  for (const file of files) {
    const slug = file.replace('.yaml', '')
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8')
      const parsed: SchemeYaml = parse(content)

      // Normalize palette - strip # prefix and lowercase
      const palette: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed.palette)) {
        palette[key] = value.replace(/^#/, '').toLowerCase()
      }

      result[slug] = { parsed, palette }
    } catch (err) {
      console.error(`  Failed to parse ${slug}: ${err}`)
    }
  }
  return result
}

function main() {
  // Clone repo with sparse checkout for base24 + base16 folders
  console.log('Cloning tinted-theming/schemes (base24 + base16)...')
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true })
  }
  execFileSync('git', [
    'clone', '--depth', '1', '--filter=blob:none', '--sparse',
    REPO_URL, TMP_DIR
  ], { stdio: 'pipe' })
  execFileSync('git', ['sparse-checkout', 'set', 'base24', 'base16'], {
    cwd: TMP_DIR,
    stdio: 'pipe'
  })

  // Parse both directories
  const base24Raw = parseSchemesFromDir(path.join(TMP_DIR, 'base24'))
  const base16Raw = parseSchemesFromDir(path.join(TMP_DIR, 'base16'))

  console.log(`Found ${Object.keys(base24Raw).length} base24 schemes`)
  console.log(`Found ${Object.keys(base16Raw).length} base16 schemes`)

  const schemes: Record<string, Base24Scheme> = {}
  let base24Count = 0
  let base16Count = 0
  let skippedDuplicates = 0

  // 1. Add all base24 schemes (they have full 24-slot palettes)
  for (const [slug, { parsed, palette }] of Object.entries(base24Raw)) {
    schemes[slug] = {
      name: parsed.name,
      author: parsed.author,
      variant: parsed.variant || 'dark',
      palette
    }
    base24Count++
  }

  // 2. Add base16 schemes that don't already have a base24 counterpart
  for (const [slug, { parsed, palette }] of Object.entries(base16Raw)) {
    if (schemes[slug]) {
      skippedDuplicates++
      continue
    }

    const variant = parsed.variant || 'dark'
    schemes[slug] = {
      name: parsed.name,
      author: parsed.author,
      variant,
      palette: synthesizeBase24(palette, variant)
    }
    base16Count++
  }

  // Sort by name for consistent output
  const sorted: Record<string, Base24Scheme> = {}
  for (const key of Object.keys(schemes).sort()) {
    sorted[key] = schemes[key]
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2))

  // Cleanup
  fs.rmSync(TMP_DIR, { recursive: true })

  // Stats
  const allSchemes = Object.values(sorted)
  const darkCount = allSchemes.filter(s => s.variant === 'dark').length
  const lightCount = allSchemes.filter(s => s.variant === 'light').length

  console.log(`\nDone! Wrote ${Object.keys(sorted).length} schemes to ${OUTPUT_PATH}`)
  console.log(`  base24 (native): ${base24Count}`)
  console.log(`  base16 (synthesized): ${base16Count}`)
  console.log(`  duplicates skipped: ${skippedDuplicates}`)
  console.log(`  dark: ${darkCount} | light: ${lightCount}`)
  console.log(`  file size: ${(fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1)}KB`)
}

main()
