# Graph Workspace UX Polish

**Date:** 2026-04-24
**Status:** Approved

## Context

Three small usability improvements to the graph workspace / catalog view:

1. The "Hosting boxes" toggle label is informal and doesn't match the view-mode vocabulary used elsewhere in the UI.
2. Clicking a selected service a second time has no effect — users have no way to deselect without switching tabs.
3. The service detail panel has no explicit dismiss control — the only way to close it is to click another service or change mode.

## Changes

### 1. Rename "Hosting boxes" → "Infra view"

**File:** `src/features/catalog/CatalogView.tsx` (~line 126)

Update the button text and `aria-label` from `"Hosting boxes"` / `"Toggle hosting boxes"` to `"Infra view"` / `"Toggle infra view"`. No logic changes.

### 2. Click-to-deselect on a currently selected service

**File:** `src/features/catalog/useCatalogViewModel.ts` (~line 452, `handleServiceClick`)

Add a toggle: if the clicked service ID equals the current `selectedService`, call `setSelectedService(null)` and return early instead of re-setting the same value.

**Effect:** Collapses the detail panel and clears highlighting. The mode stays as "impact" — no mode switch, which would be disruptive. The graph returns to its full unfiltered state.

### 3. Close (×) button on the service detail panel

**File:** `src/features/catalog/CatalogView.tsx` (~lines 284–298, detail panel header block)

Add a `<button>` with an `×` character (or `aria-label="Close"`) positioned in the top-right corner of the panel header. On click, call `viewModel.setSelectedService(null)`.

Styling: no background, no border, icon-weight, flush with the header's top-right edge. Follows the existing close-button pattern in the editor panel if one exists; otherwise a minimal inline style.

**Effect:** Identical to click-to-deselect — clears selection, collapses panel, stays in impact mode.

## Files Changed

| File | Change |
|------|--------|
| `src/features/catalog/CatalogView.tsx` | Button label rename; close button added to detail panel header |
| `src/features/catalog/useCatalogViewModel.ts` | Toggle logic in `handleServiceClick` |

## Verification

1. **Rename:** "Hosting boxes" button now reads "Infra view"; `aria-label` updated to match.
2. **Click-to-deselect:** Clicking a highlighted service node a second time clears the selection, collapses the right panel, and removes all graph highlighting.
3. **Close button:** `×` button visible in detail panel header; clicking it produces the same result as click-to-deselect.
4. **No regressions:** Clicking a different service while one is selected still works (switches selection). Switching modes still clears selection as before.
