import type { Base24Palette } from '../data/themes'

/**
 * Generate a PrismJS theme style object from a Base24 palette.
 * Maps base24 accent slots to syntax token types.
 */
export function createPrismStyleFromBase24(
  palette: Base24Palette,
): Record<string, React.CSSProperties> {
  const h = (hex: string) => '#' + hex

  // Mapping follows the IDE standard (VS Code, Vim, Sublime, JetBrains):
  // base24 high-contrast slots (base12-17) correspond to base16 accents:
  //   base12 (red,    bright base08) → variables, XML tags, deleted
  //   base09 (orange)                → numbers, constants, booleans, attributes
  //   base13 (yellow, bright base0A) → types, classes
  //   base14 (green,  bright base0B) → strings, inserted
  //   base15 (cyan,   bright base0C) → regex, escape chars
  //   base16 (blue,   bright base0D) → functions, methods
  //   base17 (purple, bright base0E) → keywords, storage
  //   base03                         → comments (subtle/muted)
  //   base05                         → operators, punctuation (foreground)
  const bg = h(palette.base00)
  const fg = h(palette.base05)
  const comment = h(palette.base03)
  const variable = h(palette.base12)
  const number = h(palette.base09)
  const className = h(palette.base13)
  const string = h(palette.base14)
  const regex = h(palette.base15)
  const func = h(palette.base16)
  const keyword = h(palette.base17)
  const tag = h(palette.base12)
  const attr = h(palette.base09)
  const lineHighlight = h(palette.base01)

  return {
    'code[class*="language-"]': {
      color: fg,
      background: 'none',
      fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
      textAlign: 'left',
      whiteSpace: 'pre',
      wordSpacing: 'normal',
      wordBreak: 'normal',
      wordWrap: 'normal',
      lineHeight: '1.5',
      tabSize: 4,
    },
    'pre[class*="language-"]': {
      color: fg,
      background: bg,
      padding: '1em',
      margin: '0.5em 0',
      overflow: 'auto',
      borderRadius: '0.3em',
    },

    // --- Comments ---
    comment: { color: comment, fontStyle: 'italic' },
    prolog: { color: comment },
    doctype: { color: comment },
    cdata: { color: comment },

    // --- Punctuation & Operators (foreground) ---
    punctuation: { color: fg },
    operator: { color: fg },
    'operator.arrow': { color: keyword },
    entity: { color: keyword, cursor: 'help' },
    'tag.punctuation': { color: comment },

    // --- Variables, Properties, Parameters (base12 red / base08) ---
    variable: { color: variable },
    property: { color: variable },
    parameter: { color: variable },
    console: { color: variable },
    interpolation: { color: variable },
    'imports.maybe-class-name': { color: variable },
    'exports.maybe-class-name': { color: variable },

    // --- Numbers, Constants, Booleans, Attributes (base09 orange) ---
    boolean: { color: number },
    number: { color: number },
    constant: { color: number },
    symbol: { color: number },
    'attr-name': { color: attr },

    // --- Types, Classes, Namespaces (base13 yellow / base0A) ---
    'class-name': { color: className },
    'maybe-class-name': { color: className },
    namespace: { color: className },
    'doctype.name': { color: className },

    // --- Strings, Chars, Inserted (base14 green / base0B) ---
    string: { color: string },
    char: { color: string },
    inserted: { color: string },
    selector: { color: string },
    'attr-value': { color: string },
    'attr-value.punctuation': { color: string },

    // --- Regex, Escape, URLs (base15 cyan / base0C) ---
    regex: { color: regex },
    url: { color: regex },
    escape: { color: regex },

    // --- Functions (base16 blue / base0D) ---
    function: { color: func },
    'function.maybe-class-name': { color: func },
    'atrule.url.function': { color: func },

    // --- Keywords, Storage, Control Flow (base17 purple / base0E) ---
    keyword: { color: keyword },
    'keyword.module': { color: keyword },
    'keyword.control-flow': { color: keyword },
    atrule: { color: keyword },
    'atrule.rule': { color: keyword },
    important: { color: keyword, fontWeight: 'bold' },

    // --- Tags, Deleted (base12 red / base08) ---
    tag: { color: tag },
    'doctype.doctype-tag': { color: tag },
    deleted: { color: variable },
    builtin: { color: variable },

    // --- Language-specific foreground overrides ---
    // JS/TS code defaults to variable color for unclassified identifiers
    'pre[class*="language-javascript"]': { color: variable },
    'code[class*="language-javascript"]': { color: variable },
    'pre[class*="language-jsx"]': { color: variable },
    'code[class*="language-jsx"]': { color: variable },
    'pre[class*="language-typescript"]': { color: variable },
    'code[class*="language-typescript"]': { color: variable },
    'pre[class*="language-tsx"]': { color: variable },
    'code[class*="language-tsx"]': { color: variable },

    // --- Formatting ---
    bold: { fontWeight: 'bold' },
    italic: { fontStyle: 'italic' },

    // --- Selection ---
    'pre[class*="language-"]::selection': { background: lineHighlight },
    'pre[class*="language-"] *::selection': { background: lineHighlight },
    'code[class*="language-"]::selection': { background: lineHighlight },
    'code[class*="language-"] *::selection': { background: lineHighlight },
  }
}

/**
 * Get colors for inline `<code>` elements that match the active theme.
 */
export function getInlineCodeColors(
  palette: Base24Palette,
  isDark: boolean
): { background: string; color: string } {
  // Use alpha-based colors derived from foreground for universal theme compatibility.
  // Specific base slots (base02, base03) vary wildly between themes and can blend
  // into the paper surface, making inline code invisible.
  const fg = palette.base05
  const r = parseInt(fg.slice(0, 2), 16)
  const g = parseInt(fg.slice(2, 4), 16)
  const b = parseInt(fg.slice(4, 6), 16)
  return {
    background: `rgba(${r}, ${g}, ${b}, ${isDark ? 0.15 : 0.08})`,
    color: '#' + (isDark ? palette.base06 : palette.base00),
  }
}

// ---------------------------------------------------------------------------
// Git Diff View Styles
// ---------------------------------------------------------------------------

/** Blend two hex colors: amount=0 → all bg, amount=1 → all fg */
function blendColors(fg: string, bg: string, amount: number): string {
  const parse = (hex: string) => {
    const c = hex.replace('#', '')
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]
  }
  const [fr, fgG, fb] = parse(fg)
  const [br, bgG, bb] = parse(bg)
  const r = Math.round(fr * amount + br * (1 - amount))
  const g = Math.round(fgG * amount + bgG * (1 - amount))
  const b = Math.round(fb * amount + bb * (1 - amount))
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate CSS string for @git-diff-view styling from a Base24 palette.
 * Covers diff background custom properties, hljs syntax highlighting,
 * and scrollbar styling.
 */
export function createDiffViewStyles(palette: Base24Palette, isDark: boolean): string {
  const h = (hex: string) => '#' + hex

  const bg = h(palette.base00)
  const paper = h(palette.base01)
  const selection = h(palette.base02)
  const comment = h(palette.base03)
  const secondary = h(palette.base04)
  const fg = h(palette.base05)

  // Accent colors (base12-17 = highest contrast for this variant)
  const red = h(palette.base12)
  const green = h(palette.base14)
  const blue = h(palette.base16)

  // Diff backgrounds: blend accent with bg at low opacity for subtle tints
  const addBg = blendColors(green, bg, isDark ? 0.15 : 0.2)
  const addBgLine = blendColors(green, bg, isDark ? 0.12 : 0.15)
  const addBgHighlight = blendColors(green, bg, isDark ? 0.25 : 0.3)
  const delBg = blendColors(red, bg, isDark ? 0.15 : 0.2)
  const delBgLine = blendColors(red, bg, isDark ? 0.12 : 0.15)
  const delBgHighlight = blendColors(red, bg, isDark ? 0.25 : 0.3)

  // Syntax colors — IDE standard mapping (same as PrismJS)
  const variable = h(palette.base12)
  const number = h(palette.base09)
  const className = h(palette.base13)
  const string = h(palette.base14)
  const func = h(palette.base16)
  const keyword = h(palette.base17)

  const mode = isDark ? 'dark' : 'light'

  // The library renders a `.diff-tailwindcss-wrapper[data-theme]` internally.
  // We target it via the outer `.diff-view-wrapper` class to match or exceed
  // specificity of the library's built-in GitHub-themed hljs styles.
  const w = `.diff-view-wrapper.${mode}`
  const tw = `.diff-view-wrapper.${mode} .diff-tailwindcss-wrapper[data-theme="${mode}"]`
  const syn = `${tw} .diff-line-syntax-raw`

  return `
/* Base24-themed diff view — generated from palette */

/* Diff background custom properties */
${tw} .diff-style-root {
  --diff-border--: ${selection};
  --diff-add-content--: ${addBg};
  --diff-del-content--: ${delBg};
  --diff-add-lineNumber--: ${addBgLine};
  --diff-del-lineNumber--: ${delBgLine};
  --diff-add-content-highlight--: ${addBgHighlight};
  --diff-del-content-highlight--: ${delBgHighlight};
  --diff-plain-content--: ${bg};
  --diff-plain-lineNumber--: ${paper};
  --diff-plain-lineNumber-color--: ${secondary};
  --diff-expand-content--: ${paper};
  --diff-expand-lineNumber--: ${paper};
  --diff-expand-lineNumber-color--: ${comment};
  --diff-empty-content--: ${isDark ? blendColors(bg, '#000000', 0.8) : blendColors(bg, '#ffffff', 0.8)};
  --diff-hunk-content--: ${paper};
  --diff-hunk-lineNumber--: ${selection};
  --diff-hunk-lineNumber-hover--: ${blue};
  --diff-hunk-content-color--: ${secondary};
  --diff-add-widget--: ${blue};
  --diff-add-widget-color--: ${bg};
  color: ${fg};
}

/* Syntax highlighting — must match library's selector depth */
${syn} .hljs { color: ${fg}; background: ${bg}; }

${syn} .hljs-doctag,
${syn} .hljs-keyword,
${syn} .hljs-meta .hljs-keyword,
${syn} .hljs-template-tag,
${syn} .hljs-template-variable,
${syn} .hljs-type,
${syn} .hljs-variable.language_ {
  color: ${keyword};
}

${syn} .hljs-title,
${syn} .hljs-title.class_,
${syn} .hljs-title.class_.inherited__,
${syn} .hljs-title.function_ {
  color: ${func};
}

${syn} .hljs-attr,
${syn} .hljs-attribute,
${syn} .hljs-literal,
${syn} .hljs-meta,
${syn} .hljs-number,
${syn} .hljs-operator,
${syn} .hljs-variable,
${syn} .hljs-selector-attr,
${syn} .hljs-selector-class,
${syn} .hljs-selector-id {
  color: ${number};
}

${syn} .hljs-regexp,
${syn} .hljs-string,
${syn} .hljs-meta .hljs-string {
  color: ${string};
}

${syn} .hljs-built_in,
${syn} .hljs-symbol {
  color: ${variable};
}

${syn} .hljs-comment,
${syn} .hljs-code,
${syn} .hljs-formula {
  color: ${comment};
}

${syn} .hljs-name,
${syn} .hljs-quote,
${syn} .hljs-selector-tag,
${syn} .hljs-selector-pseudo {
  color: ${variable};
}

${syn} .hljs-subst {
  color: ${fg};
}

${syn} .hljs-section {
  color: ${blue};
  font-weight: bold;
}

${syn} .hljs-bullet {
  color: ${className};
}

${syn} .hljs-emphasis {
  color: ${fg};
  font-style: italic;
}

${syn} .hljs-strong {
  color: ${fg};
  font-weight: bold;
}

${syn} .hljs-addition {
  color: ${green};
  background-color: ${addBg};
}

${syn} .hljs-deletion {
  color: ${red};
  background-color: ${delBg};
}

/* Scrollbar */
${w} ::-webkit-scrollbar { width: 8px; height: 8px; }
${w} ::-webkit-scrollbar-track { background: ${paper}; }
${w} ::-webkit-scrollbar-thumb { background: ${comment}; border-radius: 4px; }
${w} ::-webkit-scrollbar-thumb:hover { background: ${secondary}; }
`
}
