// Theme system — public API
export type { GreenRoomTheme, ColorTokens, TypographyTokens, ShapeTokens } from './tokens'
export { applyTheme, registerTheme, getTheme, listThemes } from './tokens'
export { ThemeProvider, useTheme } from './ThemeContext'

// Built-in themes
export { themeDLight, themeDDark, themeCLight, themeCDark } from './builtinThemes'

// Custom theme example (for docs / reference)
export { themeAcme } from './customThemeExample'
