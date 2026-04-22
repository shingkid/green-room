import type { Extension, Range } from "@codemirror/state";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, hoverTooltip } from "@codemirror/view";

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit testing
// ---------------------------------------------------------------------------

export const REGISTRY_KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Returns the char offset of the key's definition line (exactly 2-space indent),
 * or null if the key has no definition in the document.
 */
export function findDefinition(docText: string, key: string): number | null {
  const re = new RegExp(`(?:^|\\n)  ${key}:`);
  const match = re.exec(docText);
  if (!match) return null;
  // Advance past the leading newline (if present) and the two spaces.
  return match.index + (match[0].startsWith("\n") ? 3 : 2);
}

/**
 * Returns char offsets of all reference sites — every word-boundary occurrence
 * of `key` that is NOT the definition itself.
 */
export function findReferences(docText: string, key: string, defPos: number): number[] {
  const re = new RegExp(`(?<![a-z0-9_])${key}(?![a-z0-9_])`, "g");
  const refs: number[] = [];
  for (const match of docText.matchAll(re)) {
    const pos = match.index!;
    if (Math.abs(pos - defPos) > key.length) refs.push(pos);
  }
  return refs;
}

// ---------------------------------------------------------------------------
// CM6 extension internals
// ---------------------------------------------------------------------------

const setHighlights = StateEffect.define<Range<Decoration>[]>();
const clearHighlights = StateEffect.define<void>();

/** Stores the current set of reference-highlight decorations. */
const refHighlightState = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    // Any document edit wipes highlights immediately.
    if (tr.docChanged) return Decoration.none;
    for (const effect of tr.effects) {
      if (effect.is(clearHighlights)) return Decoration.none;
      if (effect.is(setHighlights)) return Decoration.set(effect.value);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Resolves the word under `pos` if it looks like a registry key. */
function getRegistryWord(
  view: EditorView,
  pos: number,
): { key: string; from: number; to: number } | null {
  const range = view.state.wordAt(pos);
  if (!range) return null;
  const key = view.state.doc.sliceString(range.from, range.to);
  if (!REGISTRY_KEY_RE.test(key)) return null;
  return { key, from: range.from, to: range.to };
}

/**
 * Core logic: find definition + references, dispatch highlights, and (when
 * clicking a reference) scroll to the definition.
 */
function applyJumpAndHighlight(view: EditorView, pos: number): boolean {
  const word = getRegistryWord(view, pos);
  if (!word) return false;

  const docText = view.state.doc.toString();
  const defPos = findDefinition(docText, word.key);
  if (defPos == null) return false;

  const refs = findReferences(docText, word.key, defPos);
  const mark = Decoration.mark({ class: "cm-ref-highlight" });
  const ranges: Range<Decoration>[] = refs
    .map((p) => mark.range(p, p + word.key.length))
    .sort((a, b) => a.from - b.from);

  const isAtDefinition = word.from === defPos;

  if (isAtDefinition) {
    // Clicked the definition — stay put, highlight all references.
    view.dispatch({ effects: [setHighlights.of(ranges)] });
  } else {
    // Clicked a reference — scroll to definition AND highlight references.
    view.dispatch({
      selection: { anchor: defPos },
      effects: [setHighlights.of(ranges), EditorView.scrollIntoView(defPos, { y: "start" })],
    });
  }

  return true;
}

const eventHandlers = EditorView.domEventHandlers({
  click(event: MouseEvent, view: EditorView) {
    if (!event.ctrlKey && !event.metaKey) {
      // Non-ctrl click clears any active highlights.
      if (view.state.field(refHighlightState).size > 0) {
        view.dispatch({ effects: clearHighlights.of() });
      }
      return false;
    }

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;

    const handled = applyJumpAndHighlight(view, pos);
    if (handled) event.preventDefault();
    return handled;
  },

  keydown(event: KeyboardEvent, view: EditorView) {
    if (event.key === "Escape" && view.state.field(refHighlightState).size > 0) {
      view.dispatch({ effects: clearHighlights.of() });
      return true;
    }
    return false;
  },
});

const jumpToDefinitionTooltip = hoverTooltip(
  (view: EditorView, pos: number) => {
    const word = getRegistryWord(view, pos);
    if (!word) return null;

    const docText = view.state.doc.toString();
    const defPos = findDefinition(docText, word.key);
    if (defPos == null) return null;

    const isAtDefinition = word.from === defPos;
    const text = isAtDefinition
      ? "Ctrl+click to highlight references"
      : "Ctrl+click to jump to definition";

    return {
      pos: word.from,
      end: word.to,
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.className = "cm-ref-tooltip";
        dom.textContent = text;
        return { dom };
      },
    };
  },
  { hideOnChange: true },
);

const theme = EditorView.baseTheme({
  ".cm-ref-highlight": {
    backgroundColor: "#fde68a55",
    outline: "1px solid #f59e0b",
    borderRadius: "2px",
  },
  "&dark .cm-ref-highlight": {
    backgroundColor: "#fbbf2455",
    outline: "1px solid #f59e0b",
  },
  ".cm-tooltip.cm-ref-tooltip": {
    padding: "3px 8px",
    fontSize: "12px",
    borderRadius: "4px",
  },
});

/**
 * CM6 extension providing Ctrl+click jump-to-definition and highlight-references
 * for the registry YAML editor.
 *
 * Stable — call once, no React dependencies.
 */
export function jumpToDefinition(): Extension {
  return [refHighlightState, eventHandlers, jumpToDefinitionTooltip, theme];
}
