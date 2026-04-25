import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { RULER_SIZE } from "./Rulers";
import type {
  EditingTextTarget,
  Shape,
  ShapeShape,
  StickyShape,
  TableShape,
  TextContent,
  TipTapDoc,
} from "../types";
import { DEFAULT_TEXT_FONT } from "../lib/fonts";
import { listPrefixFor } from "../lib/listFormat";
import { cellBBox, replaceCell } from "../lib/tableLayout";
import {
  FORM_CONTROL_GLYPH_CAP,
  computeFormControlLayout,
} from "../lib/shapeLayout";
import { applyDoc, ensureDoc, ensureStickyBodyDoc } from "../lib/tiptapDoc";
import { RichTextEditor } from "./RichTextEditor";

// MAX_INDENT was used by the legacy textarea's Tab handler; now indent is
// driven through the rich-text editor (sinkListItem / liftListItem) and the
// flat-field clamp lives in TextFormatBar.adjustIndent. Kept the constant in
// TextFormatBar; no longer referenced here.
const GUTTER_WIDTH = 28;

const DEFAULT_TEXT: TextContent = {
  text: "",
  font: DEFAULT_TEXT_FONT,
  fontSize: 16,
  color: "#1f2937",
  bold: false,
  italic: false,
  underline: false,
  align: "left",
  bullets: "none",
  indent: 0,
};

/**
 * HTML <textarea> overlay used to edit in-shape text. Mounts only when
 * `editingText` is set. Handles three target shapes:
 *   - { kind: "shape", id }           → ShapeShape.text
 *   - { kind: "sticky", id, field: "header" } → StickyShape.header
 *   - { kind: "sticky", id, field: "body"   } → StickyShape.body
 *
 * Position/rotation/size mirror the Konva node underneath via a CSS transform
 * stack that matches Canvas's render path. Inner component is keyed on
 * `target.kind:id:field` so its local state initializes fresh whenever a
 * different field is targeted.
 */
export function TextEditOverlay() {
  const target = useStore((s) => s.editingText);
  const sourceShape = useStore((s) => {
    if (!s.editingText) return null;
    return s.shapes.find((x) => x.id === s.editingText!.id) ?? null;
  });
  if (!target || !sourceShape) return null;
  if (target.kind === "shape") {
    if (sourceShape.type !== "shape") return null;
    return (
      <TextEditOverlayInner
        key={`shape:${sourceShape.id}`}
        shape={sourceShape as ShapeShape}
        target={target}
      />
    );
  }
  if (target.kind === "table-cell") {
    if (sourceShape.type !== "table") return null;
    return (
      <TextEditOverlayInner
        key={`table:${sourceShape.id}:${target.row}:${target.col}`}
        table={sourceShape as TableShape}
        target={target}
      />
    );
  }
  // sticky target
  if (sourceShape.type !== "sticky") return null;
  return (
    <TextEditOverlayInner
      key={`sticky:${sourceShape.id}:${target.field}`}
      sticky={sourceShape as StickyShape}
      target={target}
    />
  );
}

/**
 * Resolve the `TextContent` subtree the overlay should read, plus a writer
 * that patches it back. For ShapeShape this is `shape.text`; for StickyShape
 * it's `header` or `body` depending on `target.field`.
 *
 * `bbox` carries the on-canvas rectangle the overlay should align with —
 * for shape targets that's the shape itself; for sticky targets it's the
 * header or body band inside the sticky.
 */
type ResolvedTarget = {
  text: TextContent;
  bbox: { x: number; y: number; width: number; height: number };
  setText: (next: TextContent) => void;
  /** Whether this field auto-fits to content. False for sticky fields, which
   *  always live inside a fixed sticky frame. */
  autoFit: boolean;
  /** Whether to apply rotation from the shape — sticky bands inherit the
   *  sticky's rotation; shape bands inherit the shape's. */
  rotation: number;
};

function TextEditOverlayInner(props: {
  shape?: ShapeShape;
  sticky?: StickyShape;
  table?: TableShape;
  target: EditingTextTarget;
}) {
  const { shape, sticky, table, target } = props;
  const owner = (shape ?? sticky ?? table)!;
  return <TextEditOverlayResolved owner={owner} target={target} />;
}

function TextEditOverlayResolved({
  owner,
  target,
}: {
  owner: Shape;
  target: EditingTextTarget;
}) {
  const shape =
    owner.type === "shape" ? (owner as ShapeShape) : null;
  const sticky =
    owner.type === "sticky" ? (owner as StickyShape) : null;
  const table =
    owner.type === "table" ? (owner as TableShape) : null;
  // Resolve the right TextContent subtree + bbox + writer.
  const resolved: ResolvedTarget | null = (() => {
    if (target.kind === "table-cell" && table) {
      const cell = table.cells[target.row]?.[target.col];
      if (!cell) return null;
      const bb = cellBBox(table, target.row, target.col);
      const text = cell.text ?? DEFAULT_TEXT;
      return {
        text,
        bbox: {
          x: table.x + bb.x,
          y: table.y + bb.y,
          width: bb.width,
          height: bb.height,
        },
        setText: (next) => {
          const cur = useStore.getState().shapes.find((s) => s.id === table.id);
          if (!cur || cur.type !== "table") return;
          const t = cur as TableShape;
          const existing = t.cells[target.row]?.[target.col] ?? {};
          useStore.getState().updateShape(table.id, {
            cells: replaceCell(t.cells, target.row, target.col, {
              ...existing,
              text: next,
            }),
          } as Partial<Shape>);
        },
        // Cells respect their fixed column/row size; text is clipped if it
        // overflows. Auto-fit would require resizing the column, which is
        // a v2 interaction.
        autoFit: false,
        rotation: table.rotation ?? 0,
      };
    }
    if (target.kind === "shape" && shape) {
      const text = shape.text ?? DEFAULT_TEXT;
      // For form controls (tickbox / radio / toggle / slider) the label
      // sits in the label rect, not over the full bbox. Force-split the
      // layout (hasLabel=true) so the textarea opens where the label WILL
      // be once the user types — even if the field is currently empty.
      // Same FORM_CONTROL_GLYPH_CAP we pass in Canvas so the editor
      // bbox matches the rendered label area exactly.
      const isTickboxLike =
        shape.kind === "tickbox" ||
        shape.kind === "radio" ||
        shape.kind === "toggle";
      const glyphSize = isTickboxLike ? FORM_CONTROL_GLYPH_CAP : undefined;
      const { labelRect } = computeFormControlLayout(
        shape.kind,
        shape.width,
        shape.height,
        true,
        glyphSize,
      );
      const isFormControl = labelRect !== null;
      const bbox = isFormControl
        ? {
            x: shape.x + labelRect!.x,
            y: shape.y + labelRect!.y,
            width: labelRect!.w,
            height: labelRect!.h,
          }
        : { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
      // For form controls we DO want autoFit so the label area grows
      // vertically as the user types multi-line text — but only the
      // height should grow. Width is owned by the user (drag-resize the
      // bbox). The autoFit useEffect below detects this case via
      // `kind === form-control` and skips width updates.
      return {
        text,
        bbox,
        setText: (next) =>
          useStore
            .getState()
            .updateShape(shape.id, { text: next } as Partial<Shape>),
        autoFit: isFormControl ? true : text.autoFit !== false,
        rotation: shape.rotation ?? 0,
      };
    }
    if (target.kind === "sticky" && sticky) {
      // Body band geometry — must mirror Canvas.tsx sticky branch exactly.
      // The header band was removed (product direction), so the body now
      // starts at padY and runs down to the footer. Header targets are
      // legacy: they used to have their own band; if a stale `editingText`
      // points at field === "header", we degrade to the same body bbox so
      // the overlay still anchors over the visible card and doesn't clip.
      const padX = 12;
      const padY = 10;
      const footerH = 14;
      const gap = 6;
      const innerW = Math.max(1, sticky.width - padX * 2);
      const bodyTop = padY;
      const bodyH = Math.max(0, sticky.height - padY * 2 - gap - footerH);
      const isHeader = target.field === "header";
      const text =
        (isHeader ? sticky.header : sticky.body) ?? DEFAULT_TEXT;
      const bbox = {
        x: sticky.x + padX,
        y: sticky.y + bodyTop,
        width: innerW,
        height: bodyH,
      };
      return {
        text,
        bbox,
        setText: (next) =>
          useStore
            .getState()
            .updateShape(
              sticky.id,
              (isHeader ? { header: next } : { body: next }) as Partial<Shape>
            ),
        autoFit: false, // sticky fields never auto-resize the sticky
        rotation: sticky.rotation ?? 0,
      };
    }
    return null;
  })();

  if (!resolved) return null;
  return (
    <TextEditOverlayCore
      owner={owner}
      resolved={resolved}
      target={target}
    />
  );
}

function TextEditOverlayCore({
  owner,
  resolved,
  target,
}: {
  owner: Shape;
  resolved: ResolvedTarget;
  target: EditingTextTarget;
}) {
  const shape = owner;
  const endTextEdit = useStore((s) => s.endTextEdit);
  const updateShape = useStore((s) => s.updateShape);
  const sheet = useStore(
    (s) => s.sheets.find((sh) => sh.id === shape.sheetId) || null
  );
  const pan = useStore((s) => s.pan);
  const zoom = useStore((s) => s.zoom);
  const showRulerH = useStore((s) => s.showRulerH);
  const showRulerV = useStore((s) => s.showRulerV);

  // Legacy textarea ref — kept around for the table-cell branch which still
  // uses a plain textarea in v1. Shape and sticky branches use the Tiptap
  // editor and don't touch this ref.
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Wrapper ref for the Tiptap editor's container. Used by the autoFit
  // ResizeObserver to recompute width/height as the user types — the editor
  // owns its own DOM state, so we observe the rendered size rather than
  // re-running effects on every keystroke.
  const editorWrapRef = useRef<HTMLDivElement>(null);
  // Bumped by RichTextEditor's onLayoutTick whenever the editor updates so
  // the autoFit effect re-runs even though it can't depend on Tiptap's
  // internal state.
  const [layoutTick, setLayoutTick] = useState(0);
  const tickLayout = useMemo(
    () => () => setLayoutTick((n) => n + 1),
    [],
  );

  useEffect(() => {
    useStore.getState().beginHistoryCoalesce(`text-edit-${shape.id}`);
    return () => {
      useStore.getState().endHistoryCoalesce();
    };
  }, [shape.id]);

  useLayoutEffect(() => {
    // Table-cell branch only — Tiptap's editor focuses itself via the
    // `autofocus: "end"` option in RichTextEditor.
    if (taRef.current) {
      taRef.current.focus();
      taRef.current.select();
    }
  }, []);

  const text = resolved.text;
  const bbox = resolved.bbox;
  const autoFit = resolved.autoFit;

  // Build the Tiptap doc once per edit session. Shape/sticky branches mount
  // RichTextEditor with this doc; the editor instance is created once and
  // commits flow back via `commitDoc` below.
  //
  // Sticky BODY branch uses `ensureStickyBodyDoc` so legacy stickies (no
  // doc, plain `text` only) migrate with line 0 marked 24px bold — preserves
  // the long-standing "first line is the title" visual cue without forcing
  // users to manually re-bold + re-size existing titles. Shape and sticky-
  // header branches use the plain `ensureDoc` (no title shim).
  //
  // Memoise on shape.id + target identity so re-renders during edit don't
  // re-seed the editor. (The outer `<TextEditOverlayInner>` is already keyed
  // on shape.id+field, so a different target produces a different React
  // subtree anyway.)
  const isStickyBody =
    target.kind === "sticky" && target.field === "body";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialDoc = useMemo<TipTapDoc>(
    () => (isStickyBody ? ensureStickyBodyDoc(text) : ensureDoc(text)),
    [shape.id],
  );

  // commitDoc — Tiptap's onUpdate handler. Funnel through `applyDoc` so the
  // flat-field snapshot + plain-text mirror stay in sync with the new doc.
  // Reads `resolved.text` from the closure lazily (via getState) so the
  // committed doc is always merged onto the LATEST TextContent rather than
  // the one captured at mount.
  function commitDoc(doc: TipTapDoc) {
    const cur = resolved.text;
    resolved.setText(applyDoc(cur, doc));
  }

  // Auto-fit both width and height to text content (ShapeShape only).
  // For sticky targets, autoFit is false — the sticky frame is fixed.
  //
  // We use a ResizeObserver pattern instead of a render-time useLayoutEffect
  // for two reasons:
  //   1. The effect's dependency on `shape` (whole object) means every
  //      updateShape mutation re-triggers the effect, producing an infinite
  //      loop when measurement is even slightly unstable.
  //   2. ResizeObserver fires only when the observed element's size actually
  //      changes — the natural debounce we want for autofit.
  //
  // The observer watches the Tiptap editor's wrapper. We measure intrinsic
  // content size by temporarily switching the wrapper to width:auto/height:
  // auto, reading scrollWidth/scrollHeight, then restoring the layout
  // styles. Because the wrapper's parent (the bbox div) has `width: bbox.
  // width` from `shape.width`, leaving width:100% would constrain content
  // and prevent shrink-to-fit from ever firing.
  useEffect(() => {
    if (!autoFit) return;
    if (shape.type !== "shape") return;
    const wrap = editorWrapRef.current;
    if (!wrap) return;
    const probe =
      wrap.querySelector<HTMLElement>("[data-text-editable-root]") ?? wrap;

    // Re-measure on a microtask so we run AFTER any pending React commit.
    // This avoids reading stale layout when called from onLayoutTick during
    // a Tiptap transaction's commit phase.
    let scheduled = false;
    function measure() {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const cur = useStore
          .getState()
          .shapes.find((s) => s.id === shape.id) as ShapeShape | undefined;
        if (!cur || cur.type !== "shape") return;
        // Form controls (tickbox / radio / toggle / slider) own their own
        // width — the user drag-resizes the bbox. AutoFit for them grows
        // only the height so multi-line label text expands the box
        // downward without changing the user's chosen width or making
        // the glyph rect stretch sideways.
        const isFormControl =
          cur.kind === "tickbox" ||
          cur.kind === "radio" ||
          cur.kind === "toggle" ||
          cur.kind === "slider";
        const prevW = probe.style.width;
        const prevH = probe.style.height;
        if (!isFormControl) probe.style.width = "auto";
        probe.style.height = "auto";
        const minHeight = Math.max(40, Math.round(text.fontSize * 1.6));
        const minWidth = Math.max(40, Math.round(text.fontSize * 1.6));
        const desiredHeight = Math.max(probe.scrollHeight, minHeight);
        const desiredWidth = isFormControl
          ? cur.width
          : Math.max(probe.scrollWidth, minWidth);
        probe.style.width = prevW;
        probe.style.height = prevH;
        if (
          desiredHeight !== cur.height ||
          desiredWidth !== cur.width
        ) {
          updateShape(shape.id, {
            width: desiredWidth,
            height: desiredHeight,
          } as Partial<Shape>);
        }
      });
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(probe);
    return () => ro.disconnect();
    // shape.id is stable for the duration of this overlay (TextEditOverlay
    // remounts on shape.id change via React `key`). Layout-affecting flat
    // fields are listed so a font-size change forces a re-measure even when
    // the rendered DOM size happens to be identical for some other reason.
    // We DELIBERATELY exclude `shape` (object identity) and `updateShape`
    // (stable function) — both would otherwise re-trigger this effect on
    // every store transaction, producing the very loop this fix removes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoFit,
    shape.id,
    shape.type,
    layoutTick,
    text.fontSize,
    text.font,
    text.bold,
    text.italic,
    text.bullets,
    text.indent,
  ]);
  const leftOffset = showRulerV ? RULER_SIZE : 0;
  const topOffset = showRulerH ? RULER_SIZE : 0;

  // Build transform stack matching Canvas's render: world group (pan/zoom) →
  // sheet group (center-rotated) → bbox (top-left + rotation). For sticky
  // bands the bbox is the inner header/body rectangle, not the sticky's outer
  // frame — but rotation still inherits the parent shape's rotation since
  // each band rotates with the sticky.
  const parts: string[] = [];
  parts.push(`translate(${leftOffset + pan.x}px, ${topOffset + pan.y}px)`);
  parts.push(`scale(${zoom})`);
  if (sheet) {
    const cx = sheet.x + sheet.width / 2;
    const cy = sheet.y + sheet.height / 2;
    parts.push(`translate(${cx}px, ${cy}px)`);
    parts.push(`rotate(${sheet.rotation ?? 0}deg)`);
    parts.push(`translate(${-sheet.width / 2}px, ${-sheet.height / 2}px)`);
  }
  parts.push(`translate(${bbox.x}px, ${bbox.y}px)`);
  parts.push(`rotate(${resolved.rotation}deg)`);
  const transform = parts.join(" ");

  // Exit edit mode when the user clicks outside both the textarea and the
  // floating format bar. We can't use textarea.onBlur for this, because the
  // bar contains real inputs (font size, swatch popovers) that legitimately
  // take focus while editing — a blur-based exit would dismiss the overlay
  // the moment the user clicks the size input.
  //
  // Attach the outside-click listener on the NEXT frame. The text tool opens
  // this overlay from a canvas click, and without the defer the same native
  // mousedown can bubble to document and immediately fire endTextEdit —
  // making the textarea appear and vanish in one frame.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (taRef.current && taRef.current.contains(t)) return;
      // Tiptap editor wrapper — the standard rich-text edit surface for
      // shape and sticky branches. The legacy [data-sticky-body-editor]
      // selector is kept for backward compat in case a stale subtree is
      // still mounted (e.g. during an HMR transition).
      if (t.closest("[data-text-editable-root]")) return;
      if (t.closest("[data-sticky-body-editor]")) return;
      if (t.closest('[data-text-format-bar]')) return;
      if (t.closest('[data-sticky-format-bar]')) return;
      endTextEdit();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        endTextEdit();
      }
    }
    const raf = requestAnimationFrame(() => {
      document.addEventListener("mousedown", onMouseDown);
    });
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [endTextEdit]);

  return (
    <div
      className="absolute top-0 left-0 z-30 pointer-events-none"
      style={{ width: 0, height: 0 }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: bbox.width,
          height: bbox.height,
          transform,
          transformOrigin: "0 0",
          // Match Konva's verticalAlign in the static render so the textarea
          // sits at the same vertical anchor inside the box. The textarea
          // collapses to its content height (auto) so flex alignment can
          // actually push it up/down within the surrounding box.
          display: "flex",
          alignItems:
            (text.verticalAlign ?? "top") === "middle"
              ? "center"
              : (text.verticalAlign ?? "top") === "bottom"
              ? "flex-end"
              : "flex-start",
          // Dashed edit-mode frame lives on the wrapper (full shape box) so
          // it doesn't collapse around the textarea when vertical alignment
          // shrinks the textarea to its content height — that would read as
          // a stray horizontal line floating in the middle/bottom.
          //
          // Skip the dashed frame for sticky bands: the sticky's coloured
          // background + drop shadow already give a strong "this is the
          // edit surface" cue, so the dashed line just reads as a stray
          // typing box floating inside the note. Editing happens in-place.
          border:
            owner.type === "sticky"
              ? undefined
              : "1px dashed rgba(13, 148, 136, 0.7)",
          boxSizing: "border-box",
        }}
        className="pointer-events-auto"
      >
        {owner.type === "sticky" ? (
          // Sticky bodies now use the same RichTextEditor (Tiptap) as text
          // shapes. Per-character formatting (bold / italic / size / colour
          // / etc.) works on the body just like in a text shape. The
          // "first line is the title" cue is preserved by `ensureStickyBodyDoc`
          // — when a legacy sticky (no doc) opens, line 0 gets bold + 24px
          // marks so the visual continuity survives migration.
          //
          // Wrapper div with editorWrapRef so the autoFit ResizeObserver
          // can probe size — same pattern as the text-shape branch — even
          // though stickies have autoFit=false (the sticky frame is fixed,
          // so the observer is harmless extra work; ref is also used by
          // outside-click matching via [data-text-editable-root]).
          <div
            ref={editorWrapRef}
            style={{ position: "relative", width: "100%", height: "100%" }}
          >
            <RichTextEditor
              initialDoc={initialDoc}
              defaults={text}
              onDoc={commitDoc}
              onLayoutTick={tickLayout}
              paddingLeft={6}
              paddingTop={6}
              paddingRight={6}
              paddingBottom={6}
            />
          </div>
        ) : (() => {
          // Manual bullet gutter: keeps the visible bullet glyphs identical
          // to the Konva render even though Tiptap also renders <ul>/<ol>
          // inside its contentEditable. The gutter is computed from the
          // PLAIN TEXT (`text.text`) which `applyDoc` keeps in sync with
          // `text.doc` on every update — so as the user types in the editor,
          // the gutter stays correct without us reaching into editor JSON.
          const baseIndent = 6 + (text.indent ?? 0) * 16;
          const showGutter = text.bullets !== "none";
          const lineHeightPx = text.fontSize * 1.2;
          const lines = (text.text ?? "").split("\n");
          let counter = 0;
          const gutterItems = lines.map((line, i) => {
            const hasContent = line.length > 0;
            if (text.bullets === "numbered" && hasContent) counter += 1;
            const prefix = hasContent
              ? listPrefixFor(
                  counter,
                  text.indent ?? 0,
                  text.bullets,
                  text.bulletStyle,
                  text.numberStyle,
                )
              : "";
            return (
              <div
                key={i}
                style={{ height: lineHeightPx, lineHeight: 1.2 }}
              >
                {prefix}
              </div>
            );
          });
          return (
            // Relative wrapper so the absolute-positioned bullet gutter anchors
            // here (not the outer bbox box, which has its own padding/border
            // model). Also serves as the ref target for the autoFit effect's
            // ResizeObserver-based content-size probe.
            <div
              ref={editorWrapRef}
              style={{ position: "relative", width: "100%", height: "100%" }}
            >
              <RichTextEditor
                initialDoc={initialDoc}
                defaults={text}
                onDoc={commitDoc}
                onLayoutTick={tickLayout}
                paddingLeft={showGutter ? baseIndent + GUTTER_WIDTH : baseIndent}
                paddingTop={6}
                paddingRight={6}
                paddingBottom={6}
              />
              {showGutter && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 6,
                    left: baseIndent,
                    width: GUTTER_WIDTH,
                    pointerEvents: "none",
                    textAlign: "right",
                    paddingRight: 6,
                    fontFamily: text.font,
                    fontSize: text.fontSize,
                    lineHeight: 1.2,
                    color: text.color,
                    fontWeight: text.bold ? "bold" : "normal",
                    fontStyle: text.italic ? "italic" : "normal",
                  }}
                >
                  {gutterItems}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// `StickyBodyEditor` and its `escapeHtml` helper used to live here. Sticky
// bodies now use the same RichTextEditor (Tiptap) wrapper as text shapes —
// per-character bold/italic/size/colour replaces the hand-rolled per-index
// styling. Migration of legacy stickies preserves the title-line cue via
// `ensureStickyBodyDoc` (src/lib/tiptapDoc.ts).
