import { useMemo } from 'react'
import { useResolvedTheme } from './useResolvedTheme'
import { createPrismStyleFromBase24, getInlineCodeColors, createDiffViewStyles } from '../utils/syntaxTheme'

/**
 * Provides theme-aware syntax highlighting styles for components
 * that render code blocks or inline code.
 */
export function useThemedSyntax() {
  const { scheme } = useResolvedTheme()
  const isDark = scheme.variant === 'dark'

  const prismStyle = useMemo(
    () => createPrismStyleFromBase24(scheme.palette),
    [scheme.palette]
  )

  const inlineCodeColors = useMemo(
    () => getInlineCodeColors(scheme.palette, isDark),
    [scheme.palette, isDark]
  )

  const diffViewCss = useMemo(
    () => createDiffViewStyles(scheme.palette, isDark),
    [scheme.palette, isDark]
  )

  return { prismStyle, inlineCodeColors, diffViewCss, isDark }
}
