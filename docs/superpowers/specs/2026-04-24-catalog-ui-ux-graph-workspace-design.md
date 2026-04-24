# Catalog UI/UX Improvements with GraphWorkspace — Design Spec

**Date:** 2026-04-24
**Branch:** refactor/ui-ux-graph-workspace-design

---

## Problem

The current catalog and editor UX has several friction points:

- Startup behavior is ambiguous between checked-in registry and local draft usage.
- Editor section jump actions are implemented only for a subset of sections and are not obviously extensible.
- Impact direction button order needs to be swapped.
- Service detail content in Impact mode is rendered below the graph and can be pushed far down as graph size grows.
- Legend toggle states are too subtle in both themes, and there is no explicit reset action.
- Hosting visibility is represented as another legend item instead of a graph-local control.

---

## Goals

- Clarify and codify startup precedence between file-backed registry, local draft, and template.
- Move graph-specific layout concerns into a dedicated reusable workspace container used by all graph tabs.
- Improve editor section navigation extensibility and include `hosting` and `stakeholders`.
- Improve graph UX by relocating service details into a right dock and moving hosting toggle to top-right graph controls.
- Improve filter visibility with stronger on/off states and provide a reset action that only resets legend filters.

---

## Non-Goals

- No schema changes to the registry format.
- No redesign of data-lineage pipeline table or non-graph tab information architecture.
- No broad refactor of all view-model state into a new state management pattern.

---

## Final Product Decisions

### Startup precedence

1. If local draft exists in browser storage, use it as startup source.
2. If local draft is invalid, open editor with that draft to allow recovery and correction.
3. If no local draft exists, load file-backed registry from `public/` URL candidates.
4. If neither exists, start editor with `DEFAULT_REGISTRY_TEMPLATE_RAW`.

This preserves user edits while still supporting hosted app usage with checked-in defaults.

### Architecture choice

Introduce a new `GraphWorkspace` component and use it for all graph tabs (`overview`, `impact`, `flow`) now, not incrementally.

### Service detail strategy

Use a right-side dock panel in graph workspace for Impact mode details. Avoid bottom-of-page dependency.

### Legend behavior

Use high-contrast toggle chips:

- active: strong filled pill,
- inactive: muted outlined pill.

Add a `Reset filters` action that resets only legend-based sets (status, ownership, type), not tab-level selections.

---

## Architecture and Component Boundaries

### Existing roles after change

- `CatalogView`: page orchestration (tabs, high-level filters, footer legend), passes graph region props to workspace.
- `GraphCanvas`: React Flow rendering primitive (nodes, edges, fitView, controls).
- `useCatalogViewModel`: source of state + actions.

### New role

- `GraphWorkspace` (new): graph-region composition boundary.
  - Hosts graph canvas.
  - Hosts top-right graph-local controls (including hosting toggle).
  - Hosts optional right detail dock for selected service details.

This keeps rendering internals separate from graph-specific layout and avoids further growth in `CatalogView`.

---

## Detailed Changes

### 1) Startup source resolution

Update startup resolution to follow the precedence above and keep behavior explicit:

- Local draft wins when present.
- Invalid local draft still opens editor with draft.
- File-backed source used when no draft.
- Template only when no draft and no file.

`sourceLabel` should continue to reflect active origin appropriately.

### 2) Editor section jump extensibility and coverage

Replace hardcoded map of section labels to keys with a single section config list or dictionary used by jump rendering logic.

Enable jump buttons for:

- `hosting`
- `stakeholders`
- `business_flows`
- `data_flows`
- `services`

Adjust checklist row/button spacing so jump action appears visually associated with the section label rather than far right.

### 3) Impact direction button order

Swap the visual/order position of Downstream and Upstream controls per request.

### 4) Graph workspace and right dock details

Add `GraphWorkspace` used for all graph tabs:

- center: graph canvas (`GraphCanvas`)
- top-right: graph controls (hosting toggle, future controls)
- right dock: detail panel area

Impact mode behavior:

- when service selected, show full detail content in right dock.
- when no service selected, dock can be hidden/collapsed to preserve graph area.

Overview/Flow behavior:

- no forced detail content; dock hidden by default.
- structure supports future mode-specific side content without layout rewrite.

### 5) Legend filter UX and reset

Interactive legend items (status/type/ownership) become explicit chips with stronger enabled/disabled visual states in light and dark themes.

Add `Reset filters` control in legend/footer region:

- resets visible status set to all statuses,
- resets visible ownership set to all ownership kinds,
- resets visible type set to all types,
- does not modify selected service, selected flow, selected stakeholder, selected data flow, expanded panels, tab mode, or impact direction.

### 6) Hosting toggle relocation

Move hosting toggle out of footer legend into graph workspace top-right controls.

Applies to graph tabs where hosting grouping is meaningful (same behavior as current capability, but localized to graph controls).

---

## Data Flow and State Changes

No new persistence store is required.

Expected view-model additions/updates:

- `resetLegendFilters()` action (or equivalent composed action).
- Existing `showHosting` action/state remains, but consumed by graph workspace controls instead of footer legend.
- Startup resolver logic updated to explicit source-priority helper.

---

## Error Handling and UX Safeguards

- Invalid local draft startup always routes user to editor with validation feedback.
- File-loading failures still surface load error banner behavior as today.
- Right dock should not block graph interaction when hidden.
- Graph-local controls should remain keyboard accessible and visibly focused.

---

## Accessibility Considerations

- Toggle chips must keep sufficient contrast in active/inactive states across themes.
- All new icon-only or compact controls require clear `aria-label`.
- Right dock should preserve heading hierarchy and tab focus order.

---

## Test Plan

### Startup behavior

- With local valid draft + file-backed source: startup uses draft and opens overview.
- With local invalid draft + file-backed source: startup opens editor on draft.
- With no draft + file-backed source: startup opens overview from file.
- With no draft + no file: startup opens editor with template.

### Editor navigation

- Section jump renders for `hosting`, `stakeholders`, `business_flows`, `data_flows`, `services`.
- Jump action scrolls and focuses corresponding YAML section.

### Impact controls

- Upstream/Downstream button order matches request and still drives direction correctly.

### Graph workspace

- Graph tabs render through `GraphWorkspace`.
- Hosting toggle appears in top-right graph controls.
- Impact selected service details render in right dock and stay visible without long scroll.

### Legend UX

- Toggle chips show obvious active/inactive states in both themes.
- `Reset filters` resets only legend filter sets, preserving tab-level selections.

---

## Implementation Notes

- Favor incremental extraction: introduce `GraphWorkspace` with existing children first, then move controls/panel into it.
- Keep `GraphCanvas` narrowly focused on React Flow rendering concerns.
- Prefer config-driven section jump mapping in editor to make additional sections a one-line extension.

---

## Risks and Mitigations

- **Risk:** layout regressions from introducing workspace container.
  - **Mitigation:** ship with small CSS-scoped classes and verify all graph tabs.
- **Risk:** startup behavior confusion with multiple sources.
  - **Mitigation:** explicit precedence helper + tests.
- **Risk:** legend style changes reduce discoverability for passive keys.
  - **Mitigation:** keep passive legend keys visually distinct from interactive chips.
