/**
 * Example custom brand theme — "Acme Corp"
 *
 * This is what a company drops in to fully re-skin green-room.
 * They provide one GreenRoomTheme object. Nothing else changes.
 *
 * Typically this would be loaded from a JSON config at runtime:
 *   const theme = await fetch('/api/org/theme').then(r => r.json())
 *   registerTheme(theme)
 *   applyTheme(theme)
 */

import type { GreenRoomTheme } from './tokens'

export const themeAcme: GreenRoomTheme = {
  id:          'acme',
  name:        'Acme Corp',
  description: 'Custom brand theme — amber on zinc, Inter typeface',
  color: {
    bgBase:        '#fafafa',
    bgSurface:     '#ffffff',
    bgElevated:    '#f4f4f5',
    bgHeader:      '#18181b',   // dark header on light app
    bgPanel:       '#ffffff',
    bgNodeDefault:  '#ffffff',
    bgNodeSelected: '#fefce8',
    bgNodeAffected: '#fef2f2',
    bgNodeDim:      '#f4f4f5',
    accent:        '#ca8a04',
    accentHover:   '#a16207',
    accentSubtle:  '#fef9c3',
    accent2:       '#7c3aed',
    border:        '#e4e4e7',
    borderStrong:  '#a1a1aa',
    borderSel:     '#ca8a04',
    borderAff:     '#dc2626',
    textPrimary:   '#18181b',
    textSecondary: '#52525b',
    textMuted:     '#a1a1aa',
    textNode:      '#52525b',
    textNodeSel:   '#18181b',
    textNodeDim:   '#d4d4d8',
    statusOk:      '#16a34a',
    statusWarn:    '#ca8a04',
    statusErr:     '#dc2626',
    edgeDep:       '#ca8a04',
    edgeCall:      '#16a34a',
    edgeDim:       '#e4e4e7',
    badgeActiveBg: '#dcfce7', badgeActiveFg: '#16a34a',
    badgeExpBg:    '#fef9c3', badgeExpFg:    '#a16207',
    badgeDepBg:    '#f4f4f5', badgeDepFg:    '#a1a1aa',
    badgeCritBg:   '#fef2f2', badgeCritFg:   '#dc2626',
    shadow:        'rgba(0,0,0,0.06)',
  },
  typography: {
    fontBase:           '"Inter", system-ui, sans-serif',
    fontMono:           '"JetBrains Mono", ui-monospace, monospace',
    fontSizeXs:         '9px',
    fontSizeSm:         '11px',
    fontSizeMd:         '13px',
    fontSizeLg:         '15px',
    fontWeightNormal:   400,
    fontWeightBold:     600,
    letterSpacingLabel: '0.04em',
  },
  shape: {
    radiusCard:  '6px',
    radiusNode:  '4px',
    radiusBadge: '4px',
    radiusBtn:   '6px',
    radiusChip:  '6px',
  },
}
