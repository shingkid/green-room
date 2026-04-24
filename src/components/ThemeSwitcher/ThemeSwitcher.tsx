import { useState, useRef, useEffect } from 'react'
import { useTheme } from '../../themes/ThemeContext'
import styles from './ThemeSwitcher.module.css'

// Small colour swatch derived from the theme's accent token
function Swatch({ accent, accent2 }: { accent: string; accent2: string }) {
  return (
    <span className={styles.swatch} aria-hidden>
      <span className={styles.swatchHalf} style={{ background: accent }} />
      <span className={styles.swatchHalf} style={{ background: accent2 }} />
    </span>
  )
}

export function ThemeSwitcher() {
  const { theme, themes, setThemeId } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div className={styles.root} ref={ref}>
      <button
        className={styles.trigger}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch theme"
      >
        <Swatch accent={theme.color.accent} accent2={theme.color.accent2} />
        <span className={styles.triggerLabel}>{theme.name}</span>
        <span className={styles.triggerCaret} aria-hidden>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={styles.popover} role="listbox" aria-label="Available themes">
          <div className={styles.popoverHeader}>Theme</div>
          {themes.map(t => (
            <button
              key={t.id}
              role="option"
              aria-selected={t.id === theme.id}
              className={`${styles.option} ${t.id === theme.id ? styles.optionActive : ''}`}
              onClick={() => { setThemeId(t.id); setOpen(false) }}
            >
              <Swatch accent={t.color.accent} accent2={t.color.accent2} />
              <span className={styles.optionText}>
                <span className={styles.optionName}>{t.name}</span>
                <span className={styles.optionDesc}>{t.description}</span>
              </span>
              {t.id === theme.id && <span className={styles.checkmark} aria-hidden>✓</span>}
            </button>
          ))}
          <div className={styles.popoverFooter}>
            Custom themes via <code>setBrandTheme()</code>
          </div>
        </div>
      )}
    </div>
  )
}
