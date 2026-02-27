import { useMemo } from 'react'
import { useStore } from '../store'
import { base24Schemes } from '../data/themes'
import type { Base24Scheme } from '../data/themes'

/**
 * Resolves the active Base24 scheme from the store's colorTheme slug.
 * The scheme's own variant determines light/dark mode — no separate toggle.
 */
export function useResolvedTheme() {
  const colorTheme = useStore((state) => state.colorTheme)

  return useMemo(() => {
    const scheme = base24Schemes[colorTheme]
    if (!scheme) {
      // Fallback to gruvbox-dark if the stored slug is invalid
      return { scheme: base24Schemes['gruvbox-dark']! as Base24Scheme, slug: 'gruvbox-dark' }
    }
    return { scheme, slug: colorTheme }
  }, [colorTheme])
}
