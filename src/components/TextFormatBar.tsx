import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  Bold,
  ChevronDown,
  ChevronUp,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  PaintBucket,
  Palette,
  Underline,
} from "lucide-react";
import { useStore } from "../store";
import type {
  BulletStyle,
  ListStyle,
  NumberStyle,
  Shape,
  ShapeShape,
  TextContent,
} from "../types";
import { ColorPickerPanel } from "./ColorPickerPanel";
import { FontPicker } from "./FontPicker";
import { TextTypePicker } from "./TextTypePicker";
import { DEFAULT_TEXT_FONT, TEXT_COLOR_SWATCHES } from "../lib/fonts";
import { BULLET_OPTIONS, NUMBER_OPTIONS } from "../lib/listFormat";
import { inferTextType, type TextTypePreset } from "../lib/textTypes";
import { RULER_SIZE } from "./Rulers";

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

const MAX_INDENT = 6;

/**
 * Floating toolbar above the text-edit overlay. Visible while editing a text
 * shape (`editingTextShapeId` set) OR while the text tool is active —
 * in the latter case the bar edits per-tool defaults that are applied to the
 * next text shape created.
 */
export function TextFormatBar() {
  const editingId = useStore((s) => s.editingTextShapeId);
  const tool = useStore((s) => s.tool);
  const updateShape = useStore((s) => s.updateShape);
  const setToolFont = useStore((s) => s.setToolFont);
  const setToolFontSize = useStore((s) => s.setToolFontSize);
  const setToolColor = useStore((s) => s.setToolColor);
  const setToolTextDefaults = useStore((s) => s.setToolTextDefaults);
  const toolFont = useStore((s) => s.toolFont);
  const toolFontSize = useStore((s) => s.toolFontSize);
  const toolTextColor = useStore((s) => s.toolColors.text);
  const toolTextDefaults = useStore((s) => s.toolTextDefaults);
  const shape = useStore((s) => {
    if (!s.editingTextShapeId) return null;
    const sh = s.shapes.find((x) => x.id === s.editingTextShapeId);
    return sh && sh.type === "shape" ? (sh as ShapeShape) : null;
  });
  const [colorOpen, setColorOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [bulletStyleOpen, setBulletStyleOpen] = useState(false);
  const [numberStyleOpen, setNumberStyleOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMd(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setColorOpen(false);
        setBgOpen(false);
        setBulletStyleOpen(false);
        setNumberStyleOpen(false);
      }
    }
    if (colorOpen || bgOpen || bulletStyleOpen || numberStyleOpen) {
      document.addEventListener("mousedown", onMd);
    }
    return () => document.removeEventListener("mousedown", onMd);
  }, [colorOpen, bgOpen, bulletStyleOpen, numberStyleOpen]);

  const isEditing = !!shape && !!editingId;
  const showBar = isEditing || tool === "text";
  if (!showBar) return null;

  const text: TextContent = isEditing
    ? (shape!.text ?? DEFAULT_TEXT)
    : {
        text: "",
        font: toolFont,
        fontSize: toolFontSize,
        color: toolTextColor,
        bold: toolTextDefaults.bold,
        italic: toolTextDefaults.italic,
        underline: toolTextDefaults.underline,
        align: toolTextDefaults.align,
        verticalAlign: toolTextDefaults.verticalAlign,
        bullets: toolTextDefaults.bullets,
        indent: toolTextDefaults.indent,
        bgColor: toolTextDefaults.bgColor,
        bulletStyle: toolTextDefaults.bulletStyle,
        numberStyle: toolTextDefaults.numberStyle,
      };

  function patch(p: Partial<TextContent>) {
    if (isEditing) {
      updateShape(shape!.id, { text: { ...text, ...p } } as Partial<Shape>);
      return;
    }
    if (p.font !== undefined) setToolFont(p.font);
    if (p.fontSize !== undefined) setToolFontSize(p.fontSize);
    if (p.color !== undefined) setToolColor("text", p.color);
    const { font: _f, fontSize: _fs, color: _c, text: _t, ...rest } = p;
    void _f; void _fs; void _c; void _t;
    if (Object.keys(rest).length > 0) setToolTextDefaults(rest);
  }
  function setBullets(next: ListStyle) {
    patch({ bullets: text.bullets === next ? "none" : next });
  }
  function adjustIndent(d: number) {
    const next = Math.max(0, Math.min(MAX_INDENT, (text.indent ?? 0) + d));
    patch({ indent: next });
  }
  function adjustFontSize(d: number) {
    const next = Math.max(8, Math.min(200, (text.fontSize || 16) + d));
    patch({ fontSize: next });
  }
  function applyTextType(p: TextTypePreset) {
    patch({ fontSize: p.fontSize, bold: p.bold });
  }
  const currentType = inferTextType(text.fontSize, text.bold);

  return (
    <div
      ref={rootRef}
      data-text-format-bar
      className="absolute left-1/2 -translate-x-1/2 z-40 flex items-center gap-0.5 px-1.5 py-1 rounded-full shadow-xl ring-1 ring-black/40"
      style={{
        top: RULER_SIZE + 8,
        background: "var(--bg-secondary)",
        backdropFilter: "blur(6px)",
      }}
    >
      <TextTypePicker current={currentType} onPick={applyTextType} />

      <Divider />

      <FontPicker
        value={text.font}
        onChange={(v) => {
          patch({ font: v });
          setToolFont(v);
        }}
      />

      <div className="flex items-stretch h-7 rounded-full bg-ink-700/80 border border-ink-700 overflow-hidden hover:bg-ink-700 transition-colors">
        <input
          type="number"
          min={8}
          max={200}
          value={text.fontSize}
          onChange={(e) =>
            patch({
              fontSize: Math.max(
                8,
                Math.min(200, Number(e.target.value) || 16)
              ),
            })
          }
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              adjustFontSize(1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              adjustFontSize(-1);
            }
            e.stopPropagation();
          }}
          className="w-9 px-1.5 text-xs text-center bg-transparent text-ink-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0"
          title="Font size"
        />
        <div className="flex flex-col border-l border-ink-700/80">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => adjustFontSize(1)}
            title="Increase font size"
            className="flex-1 px-1 grid place-items-center text-ink-300 hover:text-ink-100 hover:bg-ink-600/60"
          >
            <ChevronUp size={9} strokeWidth={3} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => adjustFontSize(-1)}
            title="Decrease font size"
            className="flex-1 px-1 grid place-items-center text-ink-300 hover:text-ink-100 hover:bg-ink-600/60"
          >
            <ChevronDown size={9} strokeWidth={3} />
          </button>
        </div>
      </div>

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

      {/* Vertical alignment — only visible when the box is taller than the
          wrapped text (i.e. user has manually resized via the handles). The
          toggle still updates state in auto-fit mode so the choice persists
          for any later resize. */}
      <ToggleBtn
        active={(text.verticalAlign ?? "top") === "top"}
        onClick={() => patch({ verticalAlign: "top" })}
        title="Align top"
      >
        <AlignStartHorizontal size={13} />
      </ToggleBtn>
      <ToggleBtn
        active={text.verticalAlign === "middle"}
        onClick={() => patch({ verticalAlign: "middle" })}
        title="Align middle"
      >
        <AlignCenterHorizontal size={13} />
      </ToggleBtn>
      <ToggleBtn
        active={text.verticalAlign === "bottom"}
        onClick={() => patch({ verticalAlign: "bottom" })}
        title="Align bottom"
      >
        <AlignEndHorizontal size={13} />
      </ToggleBtn>

      <Divider />

      <ListSplitButton
        active={text.bullets === "bulleted"}
        title="Bulleted list"
        onToggle={() => {
          setBullets("bulleted");
          setBulletStyleOpen(false);
        }}
        open={bulletStyleOpen}
        onCaretClick={() => {
          setBulletStyleOpen((v) => !v);
          setNumberStyleOpen(false);
        }}
        icon={<List size={13} />}
      >
        {bulletStyleOpen && (
          <StylePopover label="Bullet style">
            {BULLET_OPTIONS.map((o) => {
              const isActive = (text.bulletStyle ?? "disc") === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    patch({ bulletStyle: o.id as BulletStyle });
                    if (text.bullets !== "bulleted") setBullets("bulleted");
                    setBulletStyleOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded transition-colors ${
                    isActive ? "bg-brand-500/20 text-ink-100" : "text-ink-200 hover:bg-ink-700/70"
                  }`}
                >
                  <span className="w-5 text-center text-base leading-none">{o.glyph}</span>
                  <span className="flex-1 text-left">{o.label}</span>
                </button>
              );
            })}
          </StylePopover>
        )}
      </ListSplitButton>
      <ListSplitButton
        active={text.bullets === "numbered"}
        title="Numbered list"
        onToggle={() => {
          setBullets("numbered");
          setNumberStyleOpen(false);
        }}
        open={numberStyleOpen}
        onCaretClick={() => {
          setNumberStyleOpen((v) => !v);
          setBulletStyleOpen(false);
        }}
        icon={<ListOrdered size={13} />}
      >
        {numberStyleOpen && (
          <StylePopover label="Number style">
            {NUMBER_OPTIONS.map((o) => {
              const isActive = (text.numberStyle ?? "decimal") === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    patch({ numberStyle: o.id as NumberStyle });
                    if (text.bullets !== "numbered") setBullets("numbered");
                    setNumberStyleOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded transition-colors ${
                    isActive ? "bg-brand-500/20 text-ink-100" : "text-ink-200 hover:bg-ink-700/70"
                  }`}
                >
                  <span className="w-7 text-right tabular-nums text-ink-300">{o.sample}</span>
                  <span className="flex-1 text-left">{o.label}</span>
                </button>
              );
            })}
          </StylePopover>
        )}
      </ListSplitButton>

      <Divider />

      <ToggleBtn
        active={false}
        onClick={() => adjustIndent(-1)}
        title="Decrease indent"
      >
        <IndentDecrease size={13} />
      </ToggleBtn>
      <ToggleBtn
        active={false}
        onClick={() => adjustIndent(1)}
        title="Increase indent"
      >
        <IndentIncrease size={13} />
      </ToggleBtn>

      <Divider />

      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setColorOpen((v) => !v);
          setBgOpen(false);
        }}
        title="Text colour"
        className={`flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors ${
          colorOpen ? "row-active" : "hover:bg-ink-700 text-ink-200"
        }`}
      >
        <Palette size={13} />
        <span
          className="inline-block w-3.5 h-3.5 rounded-sm ring-1 ring-black/40"
          style={{ background: text.color }}
        />
      </button>

      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setBgOpen((v) => !v);
          setColorOpen(false);
        }}
        title="Background colour"
        className={`flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors ${
          bgOpen ? "row-active" : "hover:bg-ink-700 text-ink-200"
        }`}
      >
        <PaintBucket size={13} />
        <span
          className="inline-block w-3.5 h-3.5 rounded-sm ring-1 ring-black/40 relative overflow-hidden"
          style={{
            background: text.bgColor ?? "transparent",
            backgroundImage: text.bgColor
              ? undefined
              : "linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%), linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%)",
            backgroundSize: text.bgColor ? undefined : "6px 6px",
            backgroundPosition: text.bgColor ? undefined : "0 0, 3px 3px",
          }}
        />
      </button>

      {colorOpen && (
        <SwatchPopover
          label="Text colour"
          current={text.color}
          onPick={(c) => {
            if (c == null) return;
            patch({ color: c });
            setColorOpen(false);
          }}
        >
          <ColorPickerPanel
            value={text.color}
            onChange={(c) => patch({ color: c })}
          />
        </SwatchPopover>
      )}

      {bgOpen && (
        <SwatchPopover
          label="Background colour"
          current={text.bgColor ?? null}
          allowNone
          onPick={(c) => {
            patch({ bgColor: c ?? undefined });
            setBgOpen(false);
          }}
        >
          <ColorPickerPanel
            value={text.bgColor ?? "#ffffff"}
            onChange={(c) => patch({ bgColor: c })}
          />
        </SwatchPopover>
      )}
    </div>
  );
}

function SwatchPopover({
  label,
  current,
  allowNone,
  onPick,
  children,
}: {
  label: string;
  current: string | null;
  allowNone?: boolean;
  onPick: (c: string | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute top-full mt-2 right-0 z-40 panel rounded-md shadow-2xl p-3 w-64"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
        {label}
      </div>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {TEXT_COLOR_SWATCHES.map((s) => {
          const active = current?.toLowerCase() === s.value.toLowerCase();
          return (
            <button
              key={s.value}
              title={s.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(s.value)}
              className={`w-6 h-6 rounded-md ring-1 transition-transform hover:scale-110 ${
                active ? "ring-2 ring-brand-500" : "ring-ink-700"
              }`}
              style={{ background: s.value }}
            />
          );
        })}
        {allowNone && (
          <button
            title="No colour"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(null)}
            className={`w-6 h-6 rounded-md ring-1 transition-transform hover:scale-110 relative overflow-hidden ${
              current == null ? "ring-2 ring-brand-500" : "ring-ink-700"
            }`}
            style={{
              backgroundImage:
                "linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%), linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%)",
              backgroundSize: "8px 8px",
              backgroundPosition: "0 0, 4px 4px",
            }}
          />
        )}
      </div>
      {children}
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
      // Don't steal focus from the textarea so the cursor and selection stay
      // put while the user toggles formatting. Clicks still fire normally.
      onMouseDown={(e) => e.preventDefault()}
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

/**
 * Split-button used for Bulleted / Numbered: the main half toggles the list
 * style; the small caret half opens a style-picker popover passed in as
 * `children`. Wraps both in a `relative` container so the popover positions
 * correctly inside the data-text-format-bar root.
 */
function ListSplitButton({
  active,
  title,
  onToggle,
  open,
  onCaretClick,
  icon,
  children,
}: {
  active: boolean;
  title: string;
  onToggle: () => void;
  open: boolean;
  onCaretClick: () => void;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative flex items-stretch">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        title={title}
        className={`h-7 w-7 grid place-items-center rounded-l text-xs transition-colors ${
          active ? "row-active" : "hover:bg-ink-700 text-ink-200"
        }`}
      >
        {icon}
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCaretClick}
        title={`${title} — style`}
        className={`h-7 w-3 grid place-items-center rounded-r text-xs transition-colors -ml-px ${
          open ? "row-active" : "hover:bg-ink-700 text-ink-300"
        }`}
      >
        <ChevronDown size={9} strokeWidth={2.5} />
      </button>
      {children}
    </div>
  );
}

function StylePopover({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute top-full mt-2 left-0 z-50 panel rounded-md shadow-2xl py-1.5 px-1 w-44 ring-1 ring-black/40"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-400 px-2 pb-1">
        {label}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}
