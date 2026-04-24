import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { RULER_SIZE } from "./Rulers";
import type { Shape, ShapeShape, TextContent } from "../types";
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
 * HTML <textarea> overlay used to edit the in-shape text. Mounts only when
 * `editingTextShapeId` is set. Position/rotation/size mirror the Konva node
 * underneath via a CSS transform stack that matches Canvas's render path.
 *
 * Outer wrapper resolves the active shape; inner component is keyed on shape id
 * so its local state initializes fresh whenever a different shape is targeted.
 */
export function TextEditOverlay() {
  const shape = useStore((s) => {
    if (!s.editingTextShapeId) return null;
    const sh = s.shapes.find((x) => x.id === s.editingTextShapeId);
    return sh && sh.type === "shape" ? (sh as ShapeShape) : null;
  });
  if (!shape) return null;
  return <TextEditOverlayInner key={shape.id} shape={shape} />;
}

function TextEditOverlayInner({ shape }: { shape: ShapeShape }) {
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
  // store synchronously; we commit via updateShape on every keystroke under a
  // history coalesce key so the entire session is one undo step.
  const [value, setValue] = useState(() => (shape.text ?? DEFAULT_TEXT).text);

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

  const text = shape.text ?? DEFAULT_TEXT;

  // Auto-fit both width and height to text content. The textarea uses
  // `wrap="off"`, so the longest line drives `scrollWidth` and Enter-driven
  // line breaks drive `scrollHeight`. We grow/shrink the shape to match,
  // clamped to the same minimum size `Canvas` uses for a fresh text shape.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.width = "auto";
    const minHeight = Math.max(40, Math.round(text.fontSize * 1.6));
    const minWidth = Math.max(40, Math.round(text.fontSize * 1.6));
    const desiredHeight = Math.max(ta.scrollHeight, minHeight);
    const desiredWidth = Math.max(ta.scrollWidth, minWidth);
    ta.style.height = "100%";
    ta.style.width = "100%";
    if (desiredHeight !== shape.height || desiredWidth !== shape.width) {
      updateShape(shape.id, {
        width: desiredWidth,
        height: desiredHeight,
      } as Partial<Shape>);
    }
  }, [
    value,
    text.fontSize,
    text.font,
    text.bold,
    text.italic,
    text.bullets,
    text.indent,
    shape.width,
    shape.height,
    shape.id,
    updateShape,
  ]);
  const leftOffset = showRulerV ? RULER_SIZE : 0;
  const topOffset = showRulerH ? RULER_SIZE : 0;

  // Build transform stack matching Canvas's render: world group (pan/zoom) →
  // sheet group (center-rotated) → shape (top-left + rotation).
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
  parts.push(`translate(${shape.x}px, ${shape.y}px)`);
  parts.push(`rotate(${shape.rotation ?? 0}deg)`);
  const transform = parts.join(" ");

  function commitValue(v: string) {
    setValue(v);
    updateShape(shape.id, {
      text: { ...text, text: v },
    } as Partial<Shape>);
  }

  function commitAndExit() {
    endTextEdit();
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
      if (t.closest('[data-text-format-bar]')) return;
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
          width: shape.width,
          height: shape.height,
          transform,
          transformOrigin: "0 0",
        }}
        className="pointer-events-auto"
      >
        {(() => {
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
                wrap="off"
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
                    updateShape(shape.id, {
                      text: { ...text, indent: next },
                    } as Partial<Shape>);
                    e.stopPropagation();
                    return;
                  }
                  // Stop bubbling so global shortcuts (e.g. Delete) don't fire.
                  e.stopPropagation();
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  paddingTop: 6,
                  paddingRight: 6,
                  paddingBottom: 6,
                  paddingLeft: showGutter ? baseIndent + GUTTER_WIDTH : baseIndent,
                  margin: 0,
                  border: "1px dashed rgba(13, 148, 136, 0.7)",
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
