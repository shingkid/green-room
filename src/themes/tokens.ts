/**
 * green-room design token system
 *
 * A theme is ~26 typed tokens. Components reference only CSS variables
 * (var(--color-accent) etc.) — never raw values. Token objects are the
 * single source of truth; applyTheme() writes them to the DOM at runtime.
 *
 * To add a custom company theme:
 *   1. Create a GreenRoomTheme object with your brand values
 *   2. Register it: registerTheme('acme', acmeTheme)
 *   3. Switch to it: applyTheme('acme')
 */

// ─── Token shape ────────────────────────────────────────────────────────────

export interface ColorTokens {
  // Backgrounds
  bgBase:       string  // page background
  bgSurface:    string  // cards, panels
  bgElevated:   string  // toolbars, rows, chips
  bgHeader:     string  // app header (can differ — e.g. dark header on light app)
  bgPanel:      string  // right-side detail panel

  // Graph node states
  bgNodeDefault:  string
  bgNodeSelected: string
  bgNodeAffected: string
  bgNodeDim:      string

  // Accent
  accent:       string  // primary interactive colour (buttons, tabs, selected)
  accentHover:  string
  accentSubtle: string  // low-contrast tint for active canvas buttons etc.
  accent2:      string  // secondary — used for edge-dep / stores

  // Borders
  border:       string  // default dividers
  borderStrong: string  // input outlines, secondary buttons
  borderSel:    string  // selected node ring
  borderAff:    string  // affected node ring

  // Text
  textPrimary:   string
  textSecondary: string
  textMuted:     string
  textNode:      string
  textNodeSel:   string
  textNodeDim:   string

  // Semantic status
  statusOk:   string
  statusWarn: string
  statusErr:  string

  // Graph edges
  edgeDep:  string  // depends-on relationship
  edgeCall: string  // calls relationship
  edgeDim:  string  // dimmed / unrelated edge

  // Badge variants
  badgeActiveBg: string;  badgeActiveFg: string
  badgeExpBg:    string;  badgeExpFg:    string
  badgeDepBg:    string;  badgeDepFg:    string
  badgeCritBg:   string;  badgeCritFg:   string

  // Misc
  shadow: string  // box-shadow colour (rgba)
}

export interface TypographyTokens {
  fontBase: string  // CSS font-family stack for UI
  fontMono: string  // monospace — service names, tags, code
  fontSizeXs: string   // 9px  — badges, labels
  fontSizeSm: string   // 11px — body, table
  fontSizeMd: string   // 13px — app title
  fontSizeLg: string   // 15px — stat numbers
  fontWeightNormal: number
  fontWeightBold:   number
  letterSpacingLabel: string  // uppercase label tracking
}

export interface ShapeTokens {
  radiusCard:  string  // outer card / app shell
  radiusNode:  string  // graph nodes
  radiusBadge: string  // status badges
  radiusBtn:   string  // buttons
  radiusChip:  string  // filter chips
}

export interface GreenRoomTheme {
  id:          string
  name:        string
  description: string
  color:       ColorTokens
  typography:  TypographyTokens
  shape:       ShapeTokens
}

// ─── CSS variable mapping ────────────────────────────────────────────────────
// Maps token keys → CSS variable names written to the DOM.

const COLOR_MAP: Record<keyof ColorTokens, string> = {
  bgBase:       '--color-bg-base',
  bgSurface:    '--color-bg-surface',
  bgElevated:   '--color-bg-elevated',
  bgHeader:     '--color-bg-header',
  bgPanel:      '--color-bg-panel',
  bgNodeDefault:  '--color-bg-node',
  bgNodeSelected: '--color-bg-node-sel',
  bgNodeAffected: '--color-bg-node-aff',
  bgNodeDim:      '--color-bg-node-dim',
  accent:       '--color-accent',
  accentHover:  '--color-accent-hover',
  accentSubtle: '--color-accent-subtle',
  accent2:      '--color-accent2',
  border:       '--color-border',
  borderStrong: '--color-border-strong',
  borderSel:    '--color-border-sel',
  borderAff:    '--color-border-aff',
  textPrimary:   '--color-text-primary',
  textSecondary: '--color-text-secondary',
  textMuted:     '--color-text-muted',
  textNode:      '--color-text-node',
  textNodeSel:   '--color-text-node-sel',
  textNodeDim:   '--color-text-node-dim',
  statusOk:   '--color-status-ok',
  statusWarn: '--color-status-warn',
  statusErr:  '--color-status-err',
  edgeDep:  '--color-edge-dep',
  edgeCall: '--color-edge-call',
  edgeDim:  '--color-edge-dim',
  badgeActiveBg: '--color-badge-active-bg', badgeActiveFg: '--color-badge-active-fg',
  badgeExpBg:    '--color-badge-exp-bg',    badgeExpFg:    '--color-badge-exp-fg',
  badgeDepBg:    '--color-badge-dep-bg',    badgeDepFg:    '--color-badge-dep-fg',
  badgeCritBg:   '--color-badge-crit-bg',   badgeCritFg:   '--color-badge-crit-fg',
  shadow: '--color-shadow',
}

const TYPOGRAPHY_MAP: Record<keyof TypographyTokens, string> = {
  fontBase:           '--font-base',
  fontMono:           '--font-mono',
  fontSizeXs:         '--font-size-xs',
  fontSizeSm:         '--font-size-sm',
  fontSizeMd:         '--font-size-md',
  fontSizeLg:         '--font-size-lg',
  fontWeightNormal:   '--font-weight-normal',
  fontWeightBold:     '--font-weight-bold',
  letterSpacingLabel: '--letter-spacing-label',
}

const SHAPE_MAP: Record<keyof ShapeTokens, string> = {
  radiusCard:  '--radius-card',
  radiusNode:  '--radius-node',
  radiusBadge: '--radius-badge',
  radiusBtn:   '--radius-btn',
  radiusChip:  '--radius-chip',
}

// ─── Runtime application ─────────────────────────────────────────────────────

/**
 * Writes all theme tokens as CSS custom properties onto :root.
 * Components use var(--color-accent) etc. — no re-renders needed.
 */
export function applyTheme(theme: GreenRoomTheme, target: HTMLElement = document.documentElement): void {
  const { style } = target

  for (const [key, cssVar] of Object.entries(COLOR_MAP)) {
    style.setProperty(cssVar, String(theme.color[key as keyof ColorTokens]))
  }
  for (const [key, cssVar] of Object.entries(TYPOGRAPHY_MAP)) {
    style.setProperty(cssVar, String(theme.typography[key as keyof TypographyTokens]))
  }
  for (const [key, cssVar] of Object.entries(SHAPE_MAP)) {
    style.setProperty(cssVar, String(theme.shape[key as keyof ShapeTokens]))
  }

  // Also stamp a data attribute for any CSS selectors that need it
  target.setAttribute('data-theme', theme.id)
}

// ─── Theme registry ──────────────────────────────────────────────────────────

const registry = new Map<string, GreenRoomTheme>()

export function registerTheme(theme: GreenRoomTheme): void {
  registry.set(theme.id, theme)
}

export function getTheme(id: string): GreenRoomTheme | undefined {
  return registry.get(id)
}

export function listThemes(): GreenRoomTheme[] {
  return Array.from(registry.values())
}
