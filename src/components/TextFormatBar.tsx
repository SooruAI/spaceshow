import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignJustify,
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
  EditingTextTarget,
  ListStyle,
  NumberStyle,
  Shape,
  ShapeShape,
  StickyShape,
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
 * field (`editingText` set) — supports both ShapeShape `text` and
 * StickyShape `header`/`body`. Also visible while the text tool is active —
 * in that case the bar edits per-tool defaults applied to the next text
 * shape created.
 */
export function TextFormatBar() {
  const target = useStore((s) => s.editingText);
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
  // Resolve the active TextContent subtree from the current target. For
  // shape targets that's `shape.text`; for sticky targets it's the
  // `header` or `body` field. `editingShape` is the owning Shape so the
  // patch path knows which field to update.
  const editingShape = useStore((s) => {
    if (!s.editingText) return null;
    return s.shapes.find((x) => x.id === s.editingText!.id) ?? null;
  });
  const editingTarget: EditingTextTarget | null = target;
  const editingText: TextContent | null = (() => {
    if (!editingTarget || !editingShape) return null;
    if (editingTarget.kind === "shape") {
      return editingShape.type === "shape"
        ? ((editingShape as ShapeShape).text ?? null)
        : null;
    }
    if (editingShape.type !== "sticky") return null;
    const sticky = editingShape as StickyShape;
    return editingTarget.field === "header"
      ? sticky.header ?? null
      : sticky.body ?? null;
  })();
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

  const isEditing = !!editingTarget && !!editingShape && !!editingText;
  const showBar = isEditing || tool === "text";
  if (!showBar) return null;

  const text: TextContent = isEditing
    ? (editingText ?? DEFAULT_TEXT)
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
    if (isEditing && editingTarget && editingShape) {
      const next = { ...text, ...p };
      // Route the write to the right field based on the active target.
      const fieldPatch: Partial<Shape> =
        editingTarget.kind === "shape"
          ? ({ text: next } as Partial<Shape>)
          : editingTarget.field === "header"
          ? ({ header: next } as Partial<Shape>)
          : ({ body: next } as Partial<Shape>);
      updateShape(editingShape.id, fieldPatch);
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

  // When editing a sticky field, the StickyFormatBar is also mounted at the
  // top-center anchor. Push this bar down by one bar-height (~38px) + gap so
  // the two stack cleanly: StickyFormatBar on top, TextFormatBar directly
  // below it. For all other targets (regular text shape, or text-tool
  // defaults) the bar stays at its normal top-center position.
  const STICKY_BAR_OFFSET = 46; // ~38px bar + 8px gap, hand-tuned to match
  const topPx =
    editingTarget?.kind === "sticky"
      ? RULER_SIZE + 8 + STICKY_BAR_OFFSET
      : RULER_SIZE + 8;

  return (
    <div
      ref={rootRef}
      data-text-format-bar
      className="absolute left-1/2 -translate-x-1/2 z-40 flex items-center gap-0.5 px-1.5 py-1 rounded-full shadow-xl ring-1 ring-black/40"
      style={{
        top: topPx,
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

      {/* Font size — chevron-flanked spinner:
       *   [▼ decrease] [ 16 ] [▲ increase]
       * The two buttons flank the number instead of stacking on one side so
       * each arrow targets a single direction (down = smaller, up = larger),
       * matching the user's mental model of a vertical axis. */}
      <div className="flex items-stretch h-7 rounded-full bg-ink-700/80 border border-ink-700 overflow-hidden hover:bg-ink-700 transition-colors">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => adjustFontSize(-1)}
          title="Decrease font size"
          aria-label="Decrease font size"
          className="px-1.5 grid place-items-center text-ink-300 hover:text-ink-100 hover:bg-ink-600/60"
        >
          <ChevronDown size={12} strokeWidth={3} />
        </button>
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
          className="w-9 px-1 text-xs text-center bg-transparent text-ink-100 outline-none border-x border-ink-700/80 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0"
          title="Font size"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => adjustFontSize(1)}
          title="Increase font size"
          aria-label="Increase font size"
          className="px-1.5 grid place-items-center text-ink-300 hover:text-ink-100 hover:bg-ink-600/60"
        >
          <ChevronUp size={12} strokeWidth={3} />
        </button>
      </div>

      {/* Text colour + background colour — deliberately placed flush against
       *  the Font Size control so the three read as a single character-style
       *  cluster (size / colour / highlight). Each button lives inside its
       *  own `relative` wrapper so the swatch popover anchors under the
       *  triggering button rather than to the toolbar's right edge (which
       *  was correct when the buttons were at the tail of the bar, but
       *  would point off-screen now that they sit in the middle). */}
      <div className="relative">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setColorOpen((v) => !v);
            setBgOpen(false);
          }}
          title="Text colour"
          aria-label="Text colour"
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
      </div>

      <div className="relative">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setBgOpen((v) => !v);
            setColorOpen(false);
          }}
          title="Background colour"
          aria-label="Text background colour"
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
      <ToggleBtn
        active={text.align === "justify"}
        onClick={() => patch({ align: "justify" })}
        title="Justify"
      >
        <AlignJustify size={13} />
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
      // `left-0` anchors the popover under the triggering color button (each
      // button is wrapped in a `relative` container in the parent bar). The
      // previous `right-0` made sense when the colour buttons lived at the
      // very end of the toolbar; after the move next to Font Size, `left-0`
      // keeps the popover on-screen by extending rightward into the bar's
      // remaining width rather than spilling off the left edge.
      className="absolute top-full mt-2 left-0 z-40 panel rounded-md shadow-2xl p-3 w-64"
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
