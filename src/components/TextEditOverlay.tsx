import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { RULER_SIZE } from "./Rulers";
import type { Shape, ShapeShape, TextContent } from "../types";

const DEFAULT_TEXT: TextContent = {
  text: "",
  font: "Inter, system-ui, sans-serif",
  fontSize: 16,
  color: "#1f2937",
  bold: false,
  italic: false,
  underline: false,
  align: "center",
  bullets: false,
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
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => commitValue(e.target.value)}
          onBlur={commitAndExit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              commitAndExit();
            }
            // Stop bubbling so global shortcuts (e.g. Delete) don't fire.
            e.stopPropagation();
          }}
          style={{
            width: "100%",
            height: "100%",
            padding: 6,
            margin: 0,
            border: "1px dashed rgba(13, 148, 136, 0.7)",
            outline: "none",
            background: "transparent",
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
      </div>
    </div>
  );
}
