# Catalog UI/UX Graph Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved catalog and editor UX improvements, including startup source precedence, graph workspace layout, right-dock service details, clearer legend filters with reset, and graph-local hosting controls.

**Architecture:** Keep state ownership in `useCatalogViewModel`, keep rendering primitives in `GraphCanvas`, and introduce a `GraphWorkspace` composition layer for all graph tabs (`overview`, `impact`, `flow`). Apply UI behavior updates incrementally behind tests, preserving existing schema and data model contracts.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, CSS Modules, React Flow (`@xyflow/react`)

---

## File Structure and Responsibilities

- `src/app/App.tsx` (modify): startup source resolution precedence, editor/opening behavior.
- `src/features/editor/RegistryEditor.tsx` (modify): section-jump configuration refactor and expanded jump coverage.
- `src/features/editor/RegistryEditor.module.css` (modify): checklist jump button spacing/placement improvements.
- `src/features/catalog/components/GraphWorkspace.tsx` (create): graph region composition (canvas, top-right controls, right dock).
- `src/features/catalog/components/GraphWorkspace.module.css` (create): graph workspace layout styles.
- `src/features/catalog/CatalogView.tsx` (modify): use `GraphWorkspace`, swap direction button order, update legend controls/reset.
- `src/features/catalog/CatalogView.module.css` (modify): new chip styles, reset button styles, remove hosting from footer legend styling assumptions.
- `src/features/catalog/useCatalogViewModel.ts` (modify): add/reset legend filter action and expose data needed by workspace controls.
- `tests/app/App.test.tsx` (modify): startup precedence tests for draft/file/template and invalid-draft editor flow.
- `tests/features/editor/RegistryEditor.test.tsx` (modify): jump coverage for `hosting` and `stakeholders`.
- `tests/features/catalog/CatalogView.test.tsx` (modify): direction toggle order, reset filters behavior, hosting control placement.
- `tests/features/catalog/components/GraphWorkspace.test.tsx` (create): workspace composition and right-dock rendering behavior.

---

### Task 1: Lock Startup Source Precedence in `App`

**Files:**

- Modify: `src/app/App.tsx`
- Test: `tests/app/App.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it("prefers saved local draft over file-backed source on startup", async () => {
  vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue({
    sourceLabel: "/service_registry.yaml",
    sourceText: registryDomain.DEFAULT_REGISTRY_TEMPLATE,
  });
  window.localStorage.setItem(
    registryDomain.LOCAL_STORAGE_DRAFT_KEY,
    registryDomain.DEFAULT_REGISTRY_TEMPLATE.replace("Example Team", "Draft Team"),
  );
  stubMatchMedia();

  render(<App />);

  await waitFor(() => {
    expect(
      screen.getByText(
        "Loaded from saved local draft. Edit the registry to validate and preview changes in-browser.",
      ),
    ).toBeInTheDocument();
  });
});

it("opens editor when saved local draft is invalid even if file-backed source exists", async () => {
  vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue({
    sourceLabel: "/service_registry.yaml",
    sourceText: registryDomain.DEFAULT_REGISTRY_TEMPLATE,
  });
  window.localStorage.setItem(registryDomain.LOCAL_STORAGE_DRAFT_KEY, "metadata:\n  team:");
  stubMatchMedia();

  render(<App />);

  await waitFor(() => {
    expect(screen.getByText("YAML")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fix validation errors" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/app/App.test.tsx`
Expected: FAIL due to current startup precedence preferring file-backed source when available.

- [ ] **Step 3: Write minimal implementation**

```tsx
function resolveStartupState(
  initialSource: Awaited<ReturnType<typeof loadInitialRegistrySource>>,
  storedDraft: string | null,
): AppStartupState {
  if (storedDraft) {
    const storedValidation = validateRegistryText(storedDraft);
    return {
      appliedRegistry: storedValidation.registry,
      draftText: storedDraft,
      loadError: null,
      showEditor: !storedValidation.registry,
      sourceLabel: "saved local draft",
      validationText: storedDraft,
    };
  }

  if (initialSource) {
    const initialValidation = validateRegistryText(initialSource.sourceText);
    return {
      appliedRegistry: initialValidation.registry,
      draftText: initialSource.sourceText,
      loadError: null,
      showEditor: !initialValidation.registry,
      sourceLabel: initialSource.sourceLabel,
      validationText: initialSource.sourceText,
    };
  }

  return buildTemplateStartupState(null);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- tests/app/App.test.tsx`
Expected: PASS for new precedence tests plus existing app tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/App.tsx tests/app/App.test.tsx
git commit -m "fix: prioritize saved draft in startup source resolution"
```

---

### Task 2: Make Editor Section Jumps Config-Driven and Extend Coverage

**Files:**

- Modify: `src/features/editor/RegistryEditor.tsx`
- Modify: `src/features/editor/RegistryEditor.module.css`
- Test: `tests/features/editor/RegistryEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("renders jump controls for hosting and stakeholders sections", async () => {
  render(
    <RegistryEditor
      canApply
      checklist={[
        {
          title: "Sections",
          items: [
            { label: "hosting (min 1)", checked: false },
            { label: "stakeholders (min 1)", checked: false },
          ],
        },
      ]}
      draftText="metadata: {}"
      issues={[]}
      onApply={() => {}}
      onChange={() => {}}
      onDownload={() => {}}
      onImport={() => {}}
      onToggleTheme={() => {}}
      sourceLabel="service_registry.yaml"
      theme="dark"
      title="Green Room"
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Jump to hosting section" }));
  await userEvent.click(screen.getByRole("button", { name: "Jump to stakeholders section" }));

  expect(mockDispatch).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/features/editor/RegistryEditor.test.tsx`
Expected: FAIL because jump map currently excludes `hosting` and `stakeholders`.

- [ ] **Step 3: Write minimal implementation**

```tsx
type SectionJumpConfig = {
  checklistLabel: string;
  key: "hosting" | "stakeholders" | "business_flows" | "data_flows" | "services";
};

const SECTION_JUMPS: SectionJumpConfig[] = [
  { checklistLabel: "hosting (min 1)", key: "hosting" },
  { checklistLabel: "stakeholders (min 1)", key: "stakeholders" },
  { checklistLabel: "business_flows (min 1)", key: "business_flows" },
  { checklistLabel: "data_flows (min 1)", key: "data_flows" },
  { checklistLabel: "services (min 1)", key: "services" },
];

const SECTION_CHECKLIST_LABEL_TO_KEY = Object.fromEntries(
  SECTION_JUMPS.map((section) => [section.checklistLabel, section.key]),
) as Record<SectionJumpConfig["checklistLabel"], SectionJumpConfig["key"]>;
```

```css
.checklistItem {
  justify-content: flex-start;
}

.checklistJumpIconButton {
  margin-left: 4px;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- tests/features/editor/RegistryEditor.test.tsx`
Expected: PASS with expanded jump coverage and no regressions in existing editor tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/RegistryEditor.tsx src/features/editor/RegistryEditor.module.css tests/features/editor/RegistryEditor.test.tsx
git commit -m "feat: extend editor section jumps for hosting and stakeholders"
```

---

### Task 3: Introduce `GraphWorkspace` for All Graph Tabs

**Files:**

- Create: `src/features/catalog/components/GraphWorkspace.tsx`
- Create: `src/features/catalog/components/GraphWorkspace.module.css`
- Modify: `src/features/catalog/CatalogView.tsx`
- Test: `tests/features/catalog/components/GraphWorkspace.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it("renders graph canvas with top-right controls slot and optional details dock", () => {
  render(
    <GraphWorkspace
      controls={<button type="button">hosting-control</button>}
      details={<div>details-panel</div>}
      graph={<div>graph-canvas</div>}
      showDetails
    />,
  );

  expect(screen.getByText("graph-canvas")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "hosting-control" })).toBeInTheDocument();
  expect(screen.getByText("details-panel")).toBeInTheDocument();
});

it("hides details dock when showDetails is false", () => {
  render(
    <GraphWorkspace
      controls={<button type="button">hosting-control</button>}
      details={<div>details-panel</div>}
      graph={<div>graph-canvas</div>}
      showDetails={false}
    />,
  );

  expect(screen.queryByText("details-panel")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/features/catalog/components/GraphWorkspace.test.tsx`
Expected: FAIL because `GraphWorkspace` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
type GraphWorkspaceProps = {
  graph: ReactNode;
  controls: ReactNode;
  details: ReactNode;
  showDetails: boolean;
};

export function GraphWorkspace({ graph, controls, details, showDetails }: GraphWorkspaceProps) {
  return (
    <section className={styles.workspace}>
      <div className={styles.graphArea}>
        <div className={styles.controls}>{controls}</div>
        {graph}
      </div>
      {showDetails ? <aside className={styles.detailsDock}>{details}</aside> : null}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- tests/features/catalog/components/GraphWorkspace.test.tsx`
Expected: PASS for workspace composition tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/components/GraphWorkspace.tsx src/features/catalog/components/GraphWorkspace.module.css tests/features/catalog/components/GraphWorkspace.test.tsx
git commit -m "feat: add GraphWorkspace container for graph tab layouts"
```

---

### Task 4: Move Impact Service Details into Right Dock and Swap Direction Button Order

**Files:**

- Modify: `src/features/catalog/CatalogView.tsx`
- Modify: `src/features/catalog/CatalogView.module.css`
- Test: `tests/features/catalog/CatalogView.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it("renders Upstream button before Downstream in impact mode", async () => {
  renderCatalogView();
  await userEvent.click(screen.getByRole("button", { name: "Dependency Impact" }));

  const directionButtons = screen
    .getAllByRole("button")
    .filter((button) => ["Upstream", "Downstream"].includes(button.textContent ?? ""));
  expect(directionButtons[0]).toHaveTextContent("Upstream");
  expect(directionButtons[1]).toHaveTextContent("Downstream");
});

it("renders impact service details in the graph workspace dock", async () => {
  renderCatalogView();
  await userEvent.click(screen.getByRole("button", { name: "Dependency Impact" }));
  await userEvent.click(screen.getByRole("button", { name: /select a service/i }));
  await userEvent.click(screen.getByRole("button", { name: "Example UI" }));

  expect(screen.getByTestId("graph-workspace-details")).toHaveTextContent("Direct dependencies");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- tests/features/catalog/CatalogView.test.tsx`
Expected: FAIL due to current button order and details living below graph.

- [ ] **Step 3: Write minimal implementation**

```tsx
<div aria-label="impact direction" className={styles.directionToggle} role="group">
  <button
    className={`${styles.directionToggleButton}${viewModel.impactDirection === "upstream" ? ` ${styles.directionToggleButtonActive}` : ""}`}
    onClick={handleSetUpstreamDirection}
    type="button"
  >
    Upstream
  </button>
  <button
    className={`${styles.directionToggleButton}${viewModel.impactDirection === "downstream" ? ` ${styles.directionToggleButtonActive}` : ""}`}
    onClick={handleSetDownstreamDirection}
    type="button"
  >
    Downstream
  </button>
</div>
```

```tsx
<GraphWorkspace
  controls={graphControls}
  details={<div data-testid="graph-workspace-details">{impactDetailsContent}</div>}
  graph={<GraphCanvas rfEdges={viewModel.rfEdges} rfNodes={enrichedNodes} />}
  showDetails={Boolean(viewModel.selectedServiceDetails && viewModel.mode === "impact")}
/>
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- tests/features/catalog/CatalogView.test.tsx`
Expected: PASS for updated direction order and docked details behavior.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/CatalogView.tsx src/features/catalog/CatalogView.module.css tests/features/catalog/CatalogView.test.tsx
git commit -m "feat: dock impact service details in graph workspace"
```

---

### Task 5: Relocate Hosting Toggle to Graph Top-Right Controls

**Files:**

- Modify: `src/features/catalog/CatalogView.tsx`
- Modify: `src/features/catalog/components/GraphWorkspace.tsx`
- Test: `tests/features/catalog/CatalogView.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
it("shows hosting toggle in graph workspace controls and not in footer legend", async () => {
  renderCatalogView();

  expect(screen.getByRole("button", { name: /toggle hosting/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "☁ hosting" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/features/catalog/CatalogView.test.tsx`
Expected: FAIL because hosting toggle is currently a legend item.

- [ ] **Step 3: Write minimal implementation**

```tsx
const graphControls =
  viewModel.mode !== "flow" ? (
    <button
      aria-label="Toggle hosting boxes"
      className={`${styles.graphControlButton}${viewModel.showHosting ? ` ${styles.graphControlButtonActive}` : ""}`}
      onClick={viewModel.handleToggleHosting}
      type="button"
    >
      Hosting boxes
    </button>
  ) : null;
```

```tsx
// Footer legend: remove hosting toggle button block from interactive legend items
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- tests/features/catalog/CatalogView.test.tsx`
Expected: PASS confirming top-right hosting control placement and footer removal.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/CatalogView.tsx src/features/catalog/components/GraphWorkspace.tsx tests/features/catalog/CatalogView.test.tsx
git commit -m "refactor: move hosting toggle to graph workspace controls"
```

---

### Task 6: Improve Legend Toggle Chips and Add `Reset filters`

**Files:**

- Modify: `src/features/catalog/CatalogView.tsx`
- Modify: `src/features/catalog/CatalogView.module.css`
- Modify: `src/features/catalog/useCatalogViewModel.ts`
- Test: `tests/features/catalog/CatalogView.test.tsx`
- Test: `tests/features/catalog/useCatalogViewModel.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it("resets only legend filters without clearing selected service", async () => {
  renderCatalogView();
  await userEvent.click(screen.getByRole("button", { name: "Dependency Impact" }));
  await userEvent.click(screen.getByRole("button", { name: /select a service/i }));
  await userEvent.click(screen.getByRole("button", { name: "Example UI" }));
  await userEvent.click(screen.getByRole("button", { name: "active" }));

  await userEvent.click(screen.getByRole("button", { name: "Reset filters" }));

  expect(screen.getByRole("button", { name: "active" }).className).not.toMatch(/legendToggleOff/);
  expect(screen.getByText("Example UI")).toBeInTheDocument();
});
```

```tsx
it("resetLegendFilters restores visibility sets to defaults", () => {
  const { result } = renderHook(() => useCatalogViewModel(registry));
  act(() => {
    result.current.handleToggleStatus("active");
    result.current.handleToggleType("frontend");
    result.current.handleToggleOwnership("internal");
  });

  act(() => {
    result.current.resetLegendFilters();
  });

  expect(result.current.visibleStatusSet.size).toBeGreaterThan(1);
  expect(result.current.visibleTypeSet.size).toBeGreaterThan(1);
  expect(result.current.visibleOwnershipSet.size).toBe(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/features/catalog/CatalogView.test.tsx tests/features/catalog/useCatalogViewModel.test.tsx`
Expected: FAIL because reset action/API does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
const DEFAULT_STATUS_SET = new Set(ALL_SERVICE_STATUSES);
const DEFAULT_TYPE_SET = new Set(ALL_SERVICE_TYPES);
const DEFAULT_OWNERSHIP_SET = new Set<OwnershipKind>(ALL_OWNERSHIP_KINDS);

const [visibleStatusSet, setVisibleStatusSet] = useState(() => new Set(DEFAULT_STATUS_SET));
const [visibleTypeSet, setVisibleTypeSet] = useState(() => new Set(DEFAULT_TYPE_SET));
const [visibleOwnershipSet, setVisibleOwnershipSet] = useState(
  () => new Set(DEFAULT_OWNERSHIP_SET),
);

const resetLegendFilters = useCallback(() => {
  setVisibleStatusSet(new Set(DEFAULT_STATUS_SET));
  setVisibleTypeSet(new Set(DEFAULT_TYPE_SET));
  setVisibleOwnershipSet(new Set(DEFAULT_OWNERSHIP_SET));
}, []);
```

```tsx
<button className={styles.legendResetButton} onClick={viewModel.resetLegendFilters} type="button">
  Reset filters
</button>
```

```css
.legendToggle {
  border: 1px solid var(--border-default);
  border-radius: 999px;
  padding: 2px 10px;
  background: var(--surface-panel-strong);
}

.legendToggleOff {
  opacity: 1;
  background: transparent;
  color: var(--text-muted);
  border-style: dashed;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- tests/features/catalog/CatalogView.test.tsx tests/features/catalog/useCatalogViewModel.test.tsx`
Expected: PASS for reset behavior and chip state assertions.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/CatalogView.tsx src/features/catalog/CatalogView.module.css src/features/catalog/useCatalogViewModel.ts tests/features/catalog/CatalogView.test.tsx tests/features/catalog/useCatalogViewModel.test.tsx
git commit -m "feat: add legend filter reset and stronger toggle chip states"
```

---

### Task 7: Final Verification Sweep

**Files:**

- Modify: none (verification only unless fixes are needed)
- Test: existing suites

- [ ] **Step 1: Run focused suites**

Run: `npm run test -- tests/app/App.test.tsx tests/features/editor/RegistryEditor.test.tsx tests/features/catalog/components/GraphWorkspace.test.tsx tests/features/catalog/CatalogView.test.tsx tests/features/catalog/useCatalogViewModel.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run full unit test suite**

Run: `npm run test`
Expected: PASS (all test files).

- [ ] **Step 3: Run static checks**

Run: `npm run lint && npm run typecheck`
Expected: both commands complete with no errors.

- [ ] **Step 4: Manual smoke validation against running app**

Run in browser at `http://localhost:5173/green-room/`:

- startup precedence scenarios (draft/file/template),
- impact docked details visibility,
- hosting control location in graph top-right,
- reset filters behavior preserving tab selections.

Expected: behavior matches spec and tests.

- [ ] **Step 5: Commit verification artifacts (if code changed during fixes)**

```bash
git add .
git commit -m "chore: finalize catalog ui ux graph workspace implementation"
```
