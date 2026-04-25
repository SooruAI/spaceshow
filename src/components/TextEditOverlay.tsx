import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { RULER_SIZE } from "./Rulers";
import type {
  EditingTextTarget,
  Shape,
  ShapeShape,
  StickyShape,
  TextContent,
} from "../types";
import { DEFAULT_TEXT_FONT } from "../lib/fonts";
import { listPrefixFor } from "../lib/listFormat";

const MAX_INDENT = 6;
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
  target: EditingTextTarget;
}) {
  const { shape, sticky, target } = props;
  const owner = (shape ?? sticky)!;
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
  // Resolve the right TextContent subtree + bbox + writer.
  const resolved: ResolvedTarget | null = (() => {
    if (target.kind === "shape" && shape) {
      const text = shape.text ?? DEFAULT_TEXT;
      return {
        text,
        bbox: { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
        setText: (next) =>
          useStore
            .getState()
            .updateShape(shape.id, { text: next } as Partial<Shape>),
        autoFit: text.autoFit !== false,
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

  const taRef = useRef<HTMLTextAreaElement>(null);
  // Local mirror of the textarea value so each keystroke doesn't push to the
  // store synchronously; we commit via resolved.setText on every keystroke
  // under a history coalesce key so the entire session is one undo step.
  const [value, setValue] = useState(() => resolved.text.text);

  useEffect(() => {
    useStore.getState().beginHistoryCoalesce(`text-edit-${shape.id}`);
    return () => {
      useStore.getState().endHistoryCoalesce();
    };
  }, [shape.id]);

  useLayoutEffect(() => {
    if (taRef.current) {
      taRef.current.focus();
      taRef.current.select();
    }
  }, []);

  const text = resolved.text;
  const bbox = resolved.bbox;
  const autoFit = resolved.autoFit;

  // Auto-fit both width and height to text content (ShapeShape only).
  // For sticky targets, autoFit is false — the sticky frame is fixed.
  useLayoutEffect(() => {
    if (!autoFit) return;
    const ta = taRef.current;
    if (!ta) return;
    if (shape.type !== "shape") return;
    ta.style.height = "auto";
    ta.style.width = "auto";
    const minHeight = Math.max(40, Math.round(text.fontSize * 1.6));
    const minWidth = Math.max(40, Math.round(text.fontSize * 1.6));
    const desiredHeight = Math.max(ta.scrollHeight, minHeight);
    const desiredWidth = Math.max(ta.scrollWidth, minWidth);
    ta.style.height = "100%";
    ta.style.width = "100%";
    if (
      desiredHeight !== (shape as ShapeShape).height ||
      desiredWidth !== (shape as ShapeShape).width
    ) {
      updateShape(shape.id, {
        width: desiredWidth,
        height: desiredHeight,
      } as Partial<Shape>);
    }
  }, [
    autoFit,
    value,
    text.fontSize,
    text.font,
    text.bold,
    text.italic,
    text.bullets,
    text.indent,
    shape,
    updateShape,
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

  function commitValue(v: string) {
    setValue(v);
    resolved.setText({ ...text, text: v });
  }

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
      // Sticky-body editor uses a contenteditable instead of a textarea —
      // honour clicks inside it the same way (otherwise the very first click
      // to position the caret would dismiss the overlay).
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
          // Sticky bodies use a contenteditable so the FIRST line styles
          // at the title font (24px bold) live as the user types. Browsers
          // create a new <div> per line on Enter; the editor re-applies
          // styles to children by index so line 0 = title, lines 1+ = body.
          // Matches the two-Text Konva render in Canvas exactly.
          <StickyBodyEditor
            key={`sb:${owner.id}`}
            initialText={value}
            fontFamily={text.font}
            color={text.color}
            bgColor={text.bgColor ?? "transparent"}
            align={text.align}
            titleFontSize={24}
            restFontSize={text.fontSize ?? 12}
            onChange={commitValue}
          />
        ) : (() => {
          const baseIndent = 6 + (text.indent ?? 0) * 16;
          const showGutter = text.bullets !== "none";
          const lineHeightPx = text.fontSize * 1.2;
          const lines = value.split("\n");
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
            <>
              <textarea
                ref={taRef}
                wrap={autoFit ? "off" : "soft"}
                value={value}
                onChange={(e) => commitValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const d = e.shiftKey ? -1 : 1;
                    const next = Math.max(
                      0,
                      Math.min(MAX_INDENT, (text.indent ?? 0) + d)
                    );
                    resolved.setText({ ...text, indent: next });
                    e.stopPropagation();
                    return;
                  }
                  // Stop bubbling so global shortcuts (e.g. Delete) don't fire.
                  e.stopPropagation();
                }}
                style={{
                  width: "100%",
                  // Auto-fit mode: fill the box (which is sized to content
                  // anyway). Manual-resize mode: collapse to content height
                  // so the wrapping flex container can vertically align it
                  // top/middle/bottom inside the user's larger box.
                  height: autoFit ? "100%" : "auto",
                  maxHeight: "100%",
                  paddingTop: 6,
                  paddingRight: 6,
                  paddingBottom: 6,
                  paddingLeft: showGutter ? baseIndent + GUTTER_WIDTH : baseIndent,
                  margin: 0,
                  border: "none",
                  outline: "none",
                  background: text.bgColor ?? "transparent",
                  resize: "none",
                  overflow: "hidden",
                  fontFamily: text.font,
                  fontSize: text.fontSize,
                  color: text.color,
                  fontWeight: text.bold ? "bold" : "normal",
                  fontStyle: text.italic ? "italic" : "normal",
                  textDecoration: text.underline ? "underline" : "none",
                  textAlign: text.align,
                  lineHeight: 1.2,
                }}
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
            </>
          );
        })()}
      </div>
    </div>
  );
}

/**
 * Contenteditable editor used exclusively for sticky body text. Splits the
 * value on `\n` into one `<div>` per line and styles by INDEX:
 *   • line 0  → 24px bold (the "title" cue)
 *   • lines 1+ → restFontSize (default 12)
 *
 * This mirrors the two-Text Konva render in Canvas.tsx so the user sees the
 * same visual treatment whether the sticky is being edited or just sitting
 * on the canvas. The data model stays a single string — Enter inserts a
 * `\n` (browser creates a new <div>), and onInput we serialize back via
 * `Array.from(children).map(c => c.textContent).join("\n")`.
 *
 * We do NOT re-render the children from React (controlled-input pattern
 * fights contenteditable cursor positioning). Instead, the initial DOM is
 * set once via `innerHTML` on mount, and on every input we just re-apply
 * the per-index inline style — that touches the style attribute, not the
 * children, so the cursor stays put.
 */
function StickyBodyEditor({
  initialText,
  fontFamily,
  color,
  bgColor,
  align,
  titleFontSize,
  restFontSize,
  onChange,
}: {
  initialText: string;
  fontFamily: string;
  color: string;
  bgColor: string;
  align: TextContent["align"];
  titleFontSize: number;
  restFontSize: number;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const applyChildStyles = (root: HTMLDivElement) => {
    const kids = Array.from(root.children) as HTMLElement[];
    kids.forEach((el, i) => {
      const fs = i === 0 ? titleFontSize : restFontSize;
      el.style.fontSize = `${fs}px`;
      el.style.fontWeight = i === 0 ? "700" : "400";
      el.style.lineHeight = "1.2";
      // Empty lines collapse to height 0 — keep them visible by giving them
      // an explicit min-height that matches their font.
      el.style.minHeight = `${Math.ceil(fs * 1.2)}px`;
    });
  };

  // Mount: seed the contenteditable with one <div> per line. Browsers vary
  // a bit on the default block element used when the user presses Enter
  // (Chrome: <div>, Firefox legacy: <br>); we force `<div>` via the
  // long-deprecated-but-still-honored `defaultParagraphSeparator` command.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      // execCommand is deprecated but still works in all current browsers
      // for this specific knob; there's no spec-compliant replacement yet.
      document.execCommand("defaultParagraphSeparator", false, "div");
    } catch {
      // ignore — fall back to whatever the browser uses
    }
    const lines = initialText === "" ? [""] : initialText.split("\n");
    el.innerHTML = lines
      .map((line) => {
        const safe = line === "" ? "<br>" : escapeHtml(line);
        return `<div>${safe}</div>`;
      })
      .join("");
    applyChildStyles(el);
    // Place caret at the end of the last line.
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function readPlainText(root: HTMLDivElement): string {
    // Browsers represent empty lines as `<div><br></div>` — `.textContent`
    // returns "" for that, which is what we want when serialising to a
    // newline-separated string.
    const kids = Array.from(root.children) as HTMLElement[];
    if (kids.length === 0) return root.textContent ?? "";
    return kids.map((el) => el.textContent ?? "").join("\n");
  }

  const handleInput = () => {
    const el = ref.current;
    if (!el) return;
    applyChildStyles(el);
    onChange(readPlainText(el));
  };

  return (
    <div
      ref={ref}
      data-sticky-body-editor
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={(e) => {
        // Stop bubbling so global shortcuts (Delete, Cmd+Z, …) don't fire
        // on the canvas while we're typing inside the sticky.
        e.stopPropagation();
      }}
      style={{
        width: "100%",
        height: "100%",
        padding: 6,
        margin: 0,
        border: "none",
        outline: "none",
        background: bgColor,
        overflow: "auto",
        fontFamily,
        color,
        textAlign: align,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    />
  );
}

// Minimal HTML escaper for the contenteditable seed. Body text is plain
// strings, but a stray `<` would otherwise become a tag — keep that safe.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
