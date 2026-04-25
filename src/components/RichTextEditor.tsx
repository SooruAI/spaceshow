/**
 * RichTextEditor — the Tiptap-backed editor that powers per-character text
 * styling inside the canvas edit overlay. Used by both the regular text-shape
 * branch and the sticky-body branch of TextEditOverlay.
 *
 * Why a thin wrapper:
 *   1. Centralise the Tiptap configuration (extensions, focus on mount, JSON
 *      commit) so the overlay's branches stay readable.
 *   2. Wire the live editor instance into `useStore.activeRichTextEditor` for
 *      the duration of the edit session — that's what TextFormatBar reads to
 *      drive selection-aware Bold / Italic / Color / etc. The slot is cleared
 *      on unmount, so leaving edit mode auto-falls-back to whole-shape
 *      formatting.
 *   3. Carry the `data-text-editable-root` attribute so TextEditOverlay's
 *      outside-click handler can tell "click inside the editor" apart from
 *      "click outside everything → exit edit mode."
 *
 * Per-character styles (bold/italic/underline/strike, color, fontFamily,
 * fontSize, highlight) live as Tiptap inline marks. Whole-shape attributes
 * (verticalAlign, bgColor) stay on the container — they don't make sense per
 * character and the multi-run renderer (RichTextRender.tsx) reads them off
 * the same TextContent's flat fields.
 *
 * Bullets / numbered lists are rendered natively by Tiptap during edit, but
 * the manual gutter overlay in TextEditOverlay paints the canonical glyphs
 * (matching the Konva render). To keep both from showing simultaneously, the
 * `tiptap-edit-content` CSS class hides the browser's `<ul>`/`<ol>` markers.
 */

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Content } from "@tiptap/react";
import { useStore } from "../store";
import { buildTextEditExtensions } from "../lib/tiptapExtensions";
import type { TextContent, TipTapDoc } from "../types";

interface Props {
  /** Pre-built Tiptap doc seeded into the editor on mount. Caller should pass
   *  `ensureDoc(text)` for shape branches and `ensureStickyBodyDoc(text)` for
   *  sticky branches. The editor never sees a missing/empty doc. */
  initialDoc: TipTapDoc;
  /** Whole-shape defaults for container styling (font, color, bg). Per-run
   *  marks on the doc override these for individual characters. */
  defaults: TextContent;
  /** Called on every Tiptap transaction with the new JSON. The caller should
   *  funnel it through `applyDoc(prev, doc)` before writing to the store, so
   *  the flat-field snapshot stays in sync. */
  onDoc: (doc: TipTapDoc) => void;
  /** Optional: called on mount + every editor update so the parent can
   *  recompute autoFit dimensions from the editor's DOM. */
  onLayoutTick?: () => void;
  /** Padding (px) inside the editor's content box. Defaults match the
   *  legacy textarea (6px all around). The shape branch passes a left pad
   *  that includes the bullet gutter width. */
  paddingLeft?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  /** Pass-through for the editor's outer wrapper className. Kept narrow on
   *  purpose; almost all styling flows through the .tiptap-edit-content rule
   *  in index.css and the `style` block computed from `defaults` below. */
  wrapperClassName?: string;
}

export function RichTextEditor({
  initialDoc,
  defaults,
  onDoc,
  onLayoutTick,
  paddingLeft = 6,
  paddingTop = 6,
  paddingRight = 6,
  paddingBottom = 6,
  wrapperClassName,
}: Props) {
  const setActiveRichTextEditor = useStore((s) => s.setActiveRichTextEditor);

  // Capture the latest onDoc / onLayoutTick refs so the editor's stable
  // handlers always invoke the freshest closure without forcing the editor
  // to re-create on every render. (Recreating the editor would lose focus
  // + selection state on every keystroke commit.)
  const onDocRef = useRef(onDoc);
  const onLayoutTickRef = useRef(onLayoutTick);
  useEffect(() => {
    onDocRef.current = onDoc;
    onLayoutTickRef.current = onLayoutTick;
  }, [onDoc, onLayoutTick]);

  // CRITICAL: pass `[]` as the deps array so Tiptap creates the editor ONCE
  // per mount of this component. Without an explicit deps array, useEditor
  // recreates the editor on every parent render, which loses focus and
  // selection state on every keystroke commit.
  const editor = useEditor(
    {
      extensions: buildTextEditExtensions(),
      // TipTapDoc is intentionally untyped at the public seam (src/types.ts
      // documents the rationale — keeps the store/component layer free of
      // @tiptap/* type pollution). Cast to Tiptap's `Content` here, where
      // the type-erased shape meets the type-checked editor.
      content: initialDoc as Content,
      autofocus: "end",
      // onUpdate closes over whatever was in scope at construction. Use a
      // ref for the user-supplied callback so it stays live across rerenders
      // without needing the editor to recreate.
      onUpdate: ({ editor: e }) => {
        onDocRef.current(e.getJSON() as TipTapDoc);
        onLayoutTickRef.current?.();
      },
      editorProps: {
        attributes: {
          class: "tiptap-edit-content",
          // Prefer "no spellcheck" — the canvas isn't a long-form prose
          // surface, and the red squiggles are noisy at small font sizes.
          spellcheck: "false",
        },
      },
    },
    [],
  );

  // Publish the live editor instance to the store via a useEffect on
  // `editor` rather than from Tiptap's onCreate/onDestroy lifecycle. In
  // React StrictMode dev, the component mounts twice (mount → unmount →
  // mount), and Tiptap's lifecycle ordering can leave the slot stale —
  // the first instance's onDestroy can fire AFTER the second instance's
  // onCreate, clobbering the slot to null. useEffect cleanup is reliable.
  useEffect(() => {
    if (!editor) return;
    // Editor is the live Tiptap instance; the store's slot is typed as
    // TipTapEditor | null (same shape, sibling import seam). The cast just
    // crosses the seam — runtime type identical.
    setActiveRichTextEditor(editor);
    onLayoutTickRef.current?.();
    return () => {
      setActiveRichTextEditor(null);
    };
  }, [editor, setActiveRichTextEditor]);

  // Container styles mirror the legacy textarea so a freshly-mounted editor
  // visually overlays the Konva render at edit start. Per-character marks
  // emitted by Tiptap (via TextStyle / Highlight / FontFamily / FontSize)
  // override these per text node, which is exactly the behaviour we want.
  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    paddingLeft,
    paddingTop,
    paddingRight,
    paddingBottom,
    margin: 0,
    border: "none",
    outline: "none",
    background: defaults.bgColor ?? "transparent",
    overflow: "hidden",
    boxSizing: "border-box",
    // Container-level defaults — overridden by per-run marks on the doc.
    fontFamily: defaults.font,
    fontSize: defaults.fontSize,
    color: defaults.color,
    fontWeight: defaults.bold ? "bold" : "normal",
    fontStyle: defaults.italic ? "italic" : "normal",
    textDecoration: defaults.underline ? "underline" : "none",
    textAlign: defaults.align,
    lineHeight: 1.2,
  };

  return (
    <div
      data-text-editable-root
      className={wrapperClassName}
      style={containerStyle}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
