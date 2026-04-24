import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'

import {
  applyTheme,
  registerTheme,
  listThemes,
  getTheme,
  type GreenRoomTheme,
} from './tokens'

import { themeDLight, themeDDark, themeCLight, themeCDark } from './builtinThemes'

// ─── Register built-in themes ────────────────────────────────────────────────
// Done at module load time — safe to import this file multiple times.

;[themeDLight, themeDDark, themeCLight, themeCDark].forEach(registerTheme)

// ─── Storage key ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'gr-theme'

// ─── Context ─────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  theme:       GreenRoomTheme
  themeId:     string
  themes:      GreenRoomTheme[]
  setThemeId:  (id: string) => void
  /** Register and immediately switch to a custom brand theme */
  setBrandTheme: (theme: GreenRoomTheme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

interface ThemeProviderProps {
  defaultThemeId?: string
  children: ReactNode
}

export function ThemeProvider({ defaultThemeId = 'd-light', children }: ThemeProviderProps) {
  const [themeId, setThemeIdState] = useState<string>(() => {
    // Restore persisted preference, fall back to prop default
    return localStorage.getItem(STORAGE_KEY) ?? defaultThemeId
  })

  const theme = getTheme(themeId) ?? themeDLight

  // Apply tokens to DOM whenever theme changes
  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme.id)
  }, [theme])

  const setThemeId = useCallback((id: string) => {
    if (getTheme(id)) setThemeIdState(id)
    else console.warn(`[green-room] Unknown theme id: "${id}"`)
  }, [])

  const setBrandTheme = useCallback((t: GreenRoomTheme) => {
    registerTheme(t)
    setThemeIdState(t.id)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, themeId, themes: listThemes(), setThemeId, setBrandTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
