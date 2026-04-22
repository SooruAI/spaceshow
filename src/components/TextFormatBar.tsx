import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  Palette,
  Underline,
} from "lucide-react";
import { useStore } from "../store";
import type { Shape, ShapeShape, TextContent } from "../types";
import { ColorPickerPanel } from "./ColorPickerPanel";

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

const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "Inter", value: "Inter, system-ui, sans-serif" },
  { label: "Sans Serif", value: "system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];

/**
 * Floating toolbar above the text-edit overlay. Visible only while
 * `editingTextShapeId` is set.
 */
export function TextFormatBar() {
  const editingId = useStore((s) => s.editingTextShapeId);
  const updateShape = useStore((s) => s.updateShape);
  const shape = useStore((s) => {
    if (!s.editingTextShapeId) return null;
    const sh = s.shapes.find((x) => x.id === s.editingTextShapeId);
    return sh && sh.type === "shape" ? (sh as ShapeShape) : null;
  });
  const [colorOpen, setColorOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMd(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setColorOpen(false);
      }
    }
    if (colorOpen) document.addEventListener("mousedown", onMd);
    return () => document.removeEventListener("mousedown", onMd);
  }, [colorOpen]);

  if (!shape || !editingId) return null;

  const text = shape.text ?? DEFAULT_TEXT;
  function patch(p: Partial<TextContent>) {
    updateShape(shape!.id, { text: { ...text, ...p } } as Partial<Shape>);
  }

  return (
    <div
      ref={rootRef}
      className="absolute left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 px-2 py-1 panel rounded-full shadow-2xl"
      style={{
        top: 6,
        background: "var(--bg-secondary)",
      }}
      // Prevent the textarea from blurring when interacting with this bar.
      onMouseDown={(e) => e.preventDefault()}
    >
      <select
        value={text.font}
        onChange={(e) => patch({ font: e.target.value })}
        className="h-7 px-1.5 text-xs rounded bg-ink-700 border border-ink-700 text-ink-100 outline-none"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <input
        type="number"
        min={8}
        max={200}
        value={text.fontSize}
        onChange={(e) => patch({ fontSize: Number(e.target.value) || 16 })}
        className="w-12 h-7 px-1.5 text-xs rounded bg-ink-700 border border-ink-700 text-ink-100 outline-none"
      />

      <Divider />

      <ToggleBtn
        active={text.bold}
        onClick={() => patch({ bold: !text.bold })}
        title="Bold"
      >
        <Bold size={13} />
      </ToggleBtn>
      <ToggleBtn
        active={text.italic}
        onClick={() => patch({ italic: !text.italic })}
        title="Italic"
      >
        <Italic size={13} />
      </ToggleBtn>
      <ToggleBtn
        active={text.underline}
        onClick={() => patch({ underline: !text.underline })}
        title="Underline"
      >
        <Underline size={13} />
      </ToggleBtn>

      <Divider />

      <ToggleBtn
        active={text.align === "left"}
        onClick={() => patch({ align: "left" })}
        title="Align left"
      >
        <AlignLeft size={13} />
      </ToggleBtn>
      <ToggleBtn
        active={text.align === "center"}
        onClick={() => patch({ align: "center" })}
        title="Align center"
      >
        <AlignCenter size={13} />
      </ToggleBtn>
      <ToggleBtn
        active={text.align === "right"}
        onClick={() => patch({ align: "right" })}
        title="Align right"
      >
        <AlignRight size={13} />
      </ToggleBtn>

      <Divider />

      <ToggleBtn
        active={text.bullets}
        onClick={() => patch({ bullets: !text.bullets })}
        title="Bullets"
      >
        <List size={13} />
      </ToggleBtn>

      <Divider />

      <button
        onClick={() => setColorOpen((v) => !v)}
        title="Text colour"
        className={`flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors ${
          colorOpen ? "row-active" : "hover:bg-ink-700 text-ink-200"
        }`}
      >
        <Palette size={13} />
        <span
          className="inline-block w-3 h-3 rounded-sm ring-1 ring-ink-700"
          style={{ background: text.color }}
        />
      </button>

      {colorOpen && (
        <div
          className="absolute top-full mt-2 right-0 z-40 panel rounded-md shadow-2xl p-3 w-64"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
            Text colour
          </div>
          <ColorPickerPanel
            value={text.color}
            onChange={(c) => patch({ color: c })}
          />
        </div>
      )}
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`h-7 w-7 grid place-items-center rounded text-xs transition-colors ${
        active ? "row-active" : "hover:bg-ink-700 text-ink-200"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-ink-700 mx-0.5" />;
}
