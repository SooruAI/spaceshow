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
  Strikethrough,
  Underline,
} from "lucide-react";
import { fontSizeCss, parseFontSizeCss } from "../lib/tiptapExtensions";
import { useStore } from "../store";
import type {
  BulletStyle,
  EditingTextTarget,
  ListStyle,
  NumberStyle,
  Shape,
  ShapeShape,
  StickyShape,
  TableShape,
  TextContent,
} from "../types";
import { replaceCell } from "../lib/tableLayout";
import { FontPicker } from "./FontPicker";
import { TextTypePicker } from "./TextTypePicker";
import { TextColorPicker } from "./TextColorPicker";
import { TextBackgroundColorPicker } from "./TextBackgroundColorPicker";
import { DEFAULT_TEXT_FONT } from "../lib/fonts";
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
  // When a text shape is just SELECTED (not being edited via the textarea
  // overlay), still surface this bar so the user can change font / colour /
  // bold / etc. without first dbl-clicking. Two flavours qualify:
  //  - "Text elements" — transparent borderless ShapeShapes of kind
  //    "rectangle" with a text payload (Canvas.tsx::isTextElement).
  //  - Form controls (tickbox / radio / toggle / slider) with a label
  //    text. The label IS user-formattable text, so the same per-character
  //    affordances (font, size, color, B/I/U) apply.
  const selectedTextShape = useStore((s) => {
    if (s.editingText) return null; // edit takes precedence
    const id = s.selectedShapeId;
    if (!id) return null;
    const sh = s.shapes.find((x) => x.id === id);
    if (!sh || sh.type !== "shape") return null;
    const ss = sh as ShapeShape;
    if (!ss.text) return null;
    const isTextElement =
      ss.kind === "rectangle" &&
      (ss.style.fillOpacity ?? 1) === 0 &&
      !ss.style.borderEnabled;
    const isFormControl =
      ss.kind === "tickbox" ||
      ss.kind === "radio" ||
      ss.kind === "toggle" ||
      ss.kind === "slider";
    if (!isTextElement && !isFormControl) return null;
    return ss;
  });
  const editingTarget: EditingTextTarget | null = target;
  const editingText: TextContent | null = (() => {
    if (!editingTarget || !editingShape) return null;
    if (editingTarget.kind === "shape") {
      return editingShape.type === "shape"
        ? ((editingShape as ShapeShape).text ?? null)
        : null;
    }
    if (editingTarget.kind === "table-cell") {
      if (editingShape.type !== "table") return null;
      const t = editingShape as TableShape;
      return t.cells[editingTarget.row]?.[editingTarget.col]?.text ?? null;
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

  // ── Tiptap editor wiring ─────────────────────────────────────────────────
  // When TextEditOverlay mounts a RichTextEditor (regular text shapes and
  // sticky bodies in v1), it publishes the live editor instance here. We
  // route per-character commands (Bold / Italic / Color / Font / etc.)
  // through that editor instead of patching the whole TextContent.
  // When `editor` is null, we fall back to the legacy whole-shape `patch()`
  // path — that's how the bar still works for selected-but-not-editing text
  // shapes and the text-tool defaults surface.
  const editor = useStore((s) => s.activeRichTextEditor);

  // Force a re-render on every Tiptap transaction so `isActive` / mark-
  // presence reads stay live as the user moves the caret or changes the
  // selection. The format bar is a sibling component (not a child of
  // RichTextEditor), so without this subscription it has no way to know
  // when the editor's internal state changes.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const tick = () => force((n) => n + 1);
    editor.on("transaction", tick);
    editor.on("selectionUpdate", tick);
    return () => {
      editor.off("transaction", tick);
      editor.off("selectionUpdate", tick);
    };
  }, [editor]);

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
  const isSelectingTextShape = !isEditing && !!selectedTextShape;
  const showBar = isEditing || tool === "text" || isSelectingTextShape;
  if (!showBar) return null;
  // Editor-driven per-character commands ARE selection-aware. They only
  // apply when the rich-text editor is mounted (i.e. user is actively
  // editing a shape's text or a sticky body). When the user has just
  // SELECTED a text shape (no overlay), we still want Bold / Color / etc.
  // to work — but as a whole-shape change via the legacy `patch()` path.
  const editorActive = isEditing && !!editor;

  const text: TextContent = isEditing
    ? (editingText ?? DEFAULT_TEXT)
    : isSelectingTextShape
    ? (selectedTextShape!.text ?? DEFAULT_TEXT)
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
      let fieldPatch: Partial<Shape>;
      if (editingTarget.kind === "shape") {
        fieldPatch = { text: next } as Partial<Shape>;
      } else if (editingTarget.kind === "table-cell") {
        if (editingShape.type !== "table") return;
        const t = editingShape as TableShape;
        const existing = t.cells[editingTarget.row]?.[editingTarget.col] ?? {};
        fieldPatch = {
          cells: replaceCell(t.cells, editingTarget.row, editingTarget.col, {
            ...existing,
            text: next,
          }),
        } as Partial<Shape>;
      } else if (editingTarget.field === "header") {
        fieldPatch = { header: next } as Partial<Shape>;
      } else {
        fieldPatch = { body: next } as Partial<Shape>;
      }
      updateShape(editingShape.id, fieldPatch);
      return;
    }
    // Selected (not editing) text shape: write directly to its `text` field.
    if (isSelectingTextShape && selectedTextShape) {
      const next = { ...text, ...p };
      updateShape(selectedTextShape.id, { text: next } as Partial<Shape>);
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
    // editor's selection size if uniform, else fall back to the shape-level
    // flat-field size. Either way clamp to the same 8..200 range.
    const cur = (() => {
      if (editor) {
        const raw = (() => {
          const state = editor.state;
          const sel = state.selection;
          if (sel.empty) {
            const stored = state.storedMarks ?? sel.$from.marks();
            const ts = stored.find((m) => m.type.name === "textStyle");
            const v = (ts?.attrs as { fontSize?: unknown } | undefined)?.fontSize;
            return typeof v === "string" ? v : v == null ? null : String(v);
          }
          let first: string | null = null;
          let saw = false;
          let mixed = false;
          state.doc.nodesBetween(sel.from, sel.to, (node) => {
            if (!node.isText || mixed) return;
            saw = true;
            const ts = node.marks.find((m) => m.type.name === "textStyle");
            const v = (ts?.attrs as { fontSize?: unknown } | undefined)?.fontSize;
            const s = typeof v === "string" ? v : v == null ? null : String(v);
            if (first === null && !mixed) first = s;
            else if (s !== first) mixed = true;
          });
          return saw && !mixed ? first : null;
        })();
        const n = raw ? parseFontSizeCss(raw) : NaN;
        if (Number.isFinite(n)) return n;
      }
      return text.fontSize || 16;
    })();
    const next = Math.max(8, Math.min(200, cur + d));
    if (editor) {
      editor.chain().focus().setFontSize(fontSizeCss(next)).run();
    } else {
      patch({ fontSize: next });
    }
  }
  function applyTextType(p: TextTypePreset) {
    if (editorActive && editor) {
      // Apply font size as a textStyle attr; bold as a mark toggle. Order:
      // size first (always set), then ensure bold matches the preset.
      editor.chain().focus().setFontSize(fontSizeCss(p.fontSize)).run();
      const isBold = editor.isActive("bold");
      if (p.bold && !isBold) editor.chain().focus().toggleBold().run();
      else if (!p.bold && isBold) editor.chain().focus().toggleBold().run();
      return;
    }
    patch({ fontSize: p.fontSize, bold: p.bold });
  }
  const currentType = inferTextType(text.fontSize, text.bold);

  // ── Editor-driven commands & active-state reads ─────────────────────────
  // When the rich-text editor is active, every Bold / Italic / Underline /
  // Strike / Color / Font / FontSize / Align / List click runs through
  // Tiptap's chain() commands. Those commands operate on the current
  // selection — which is exactly what gives us per-character formatting.
  //
  // The `markPresence` walker returns "off" / "on" / "mixed" so the buttons
  // can render an indeterminate state when the selection spans values for
  // the underlying mark. Tiptap's `editor.isActive` only returns true when
  // ALL text in the selection carries the mark, false otherwise — so we
  // can't distinguish "none" from "some" from `isActive` alone.

  function markPresence(name: string): "off" | "on" | "mixed" {
    if (!editor) return "off";
    const state = editor.state;
    const sel = state.selection;
    if (sel.empty) {
      // Caret only: stored marks decide the next-typed character.
      const stored = state.storedMarks ?? sel.$from.marks();
      return stored.some((m) => m.type.name === name) ? "on" : "off";
    }
    let any = false;
    let all = true;
    let saw = false;
    state.doc.nodesBetween(sel.from, sel.to, (node) => {
      if (!node.isText) return;
      saw = true;
      const has = node.marks.some((m) => m.type.name === name);
      if (has) any = true;
      else all = false;
    });
    if (!saw) return "off";
    return any && all ? "on" : any ? "mixed" : "off";
  }

  // Collect a uniform attribute value across the selection's text-style
  // marks. Returns the value when all text nodes carry the SAME value,
  // else returns null (the caller falls back to "(mixed)" or the stored-
  // mark / flat-field value, depending on context).
  function uniformTextStyleAttr(attr: "color" | "fontFamily" | "fontSize"): string | null {
    if (!editor) return null;
    const state = editor.state;
    const sel = state.selection;
    if (sel.empty) {
      const stored = state.storedMarks ?? sel.$from.marks();
      const ts = stored.find((m) => m.type.name === "textStyle");
      const v = (ts?.attrs as Record<string, unknown> | undefined)?.[attr];
      return typeof v === "string" ? v : v == null ? null : String(v);
    }
    let firstSeen: string | null = null;
    let saw = false;
    let mixed = false;
    state.doc.nodesBetween(sel.from, sel.to, (node) => {
      if (!node.isText || mixed) return;
      saw = true;
      const ts = node.marks.find((m) => m.type.name === "textStyle");
      const v = ts ? ((ts.attrs as Record<string, unknown>)[attr] as unknown) : null;
      const s = v == null ? null : typeof v === "string" ? v : String(v);
      if (firstSeen === null && !mixed) {
        firstSeen = s;
      } else if (s !== firstSeen) {
        mixed = true;
      }
    });
    if (!saw || mixed) return null;
    return firstSeen;
  }

  // Editor-aware reads for the format bar's button states. When `editor`
  // is null these all return the flat-field value (whole-shape model).
  const ed = editorActive ? editor : null;
  const boldState = ed ? markPresence("bold") : (text.bold ? "on" : "off");
  const italicState = ed ? markPresence("italic") : (text.italic ? "on" : "off");
  const underlineState = ed ? markPresence("underline") : (text.underline ? "on" : "off");
  const strikeState = ed ? markPresence("strike") : ((text.strike ?? false) ? "on" : "off");
  const selectionColor = ed ? (uniformTextStyleAttr("color") ?? null) : null;
  const selectionFont = ed ? (uniformTextStyleAttr("fontFamily") ?? null) : null;
  const selectionFontSize = ed
    ? (() => {
        const raw = uniformTextStyleAttr("fontSize");
        if (raw == null) return null;
        const n = parseFontSizeCss(raw);
        return Number.isFinite(n) ? n : null;
      })()
    : null;
  const selectionBg = ed
    ? (() => {
        const state = ed.state;
        const sel = state.selection;
        if (sel.empty) {
          const stored = state.storedMarks ?? sel.$from.marks();
          const hl = stored.find((m) => m.type.name === "highlight");
          return (hl?.attrs as { color?: string } | undefined)?.color ?? null;
        }
        let first: string | null = null;
        let saw = false;
        let mixed = false;
        state.doc.nodesBetween(sel.from, sel.to, (node) => {
          if (!node.isText || mixed) return;
          saw = true;
          const hl = node.marks.find((m) => m.type.name === "highlight");
          const c = (hl?.attrs as { color?: string } | undefined)?.color ?? null;
          if (first === null && !mixed) first = c;
          else if (c !== first) mixed = true;
        });
        return saw && !mixed ? first : null;
      })()
    : null;

  // The values displayed in the font/size pickers and the bold/italic
  // active styling. When the selection is uniform (single value) we show
  // it; when mixed we fall back to the flat-field value (TextContent's
  // snapshot from the lead run). This keeps the UI sensible without
  // showing a stale value when the selection is mixed.
  const displayColor = selectionColor ?? text.color;
  const displayFont = selectionFont ?? text.font;
  const displayFontSize = selectionFontSize ?? text.fontSize;
  const displayBg = selectionBg ?? (text.bgColor ?? null);

  // Editor-aware command wrappers. When the editor is active these route
  // through Tiptap; otherwise they fall back to the legacy `patch()` path.
  const cmdToggleBold = () => {
    if (ed) ed.chain().focus().toggleBold().run();
    else patch({ bold: !text.bold });
  };
  const cmdToggleItalic = () => {
    if (ed) ed.chain().focus().toggleItalic().run();
    else patch({ italic: !text.italic });
  };
  const cmdToggleUnderline = () => {
    if (ed) ed.chain().focus().toggleUnderline().run();
    else patch({ underline: !text.underline });
  };
  const cmdToggleStrike = () => {
    if (ed) ed.chain().focus().toggleStrike().run();
    else patch({ strike: !(text.strike ?? false) });
  };
  const cmdSetColor = (c: string) => {
    if (ed) ed.chain().focus().setColor(c).run();
    else patch({ color: c });
  };
  const cmdSetBgColor = (c: string | null) => {
    if (ed) {
      if (c) ed.chain().focus().setHighlight({ color: c }).run();
      else ed.chain().focus().unsetHighlight().run();
    } else {
      patch({ bgColor: c ?? undefined });
    }
  };
  const cmdSetFont = (f: string) => {
    if (ed) ed.chain().focus().setFontFamily(f).run();
    else patch({ font: f });
  };
  const cmdSetFontSize = (px: number) => {
    if (ed) ed.chain().focus().setFontSize(fontSizeCss(px)).run();
    else patch({ fontSize: px });
  };
  const cmdSetAlign = (a: "left" | "center" | "right" | "justify") => {
    if (ed) ed.chain().focus().setTextAlign(a).run();
    else patch({ align: a });
  };
  const cmdToggleBulletList = () => {
    if (ed) ed.chain().focus().toggleBulletList().run();
    else setBullets("bulleted");
  };
  const cmdToggleOrderedList = () => {
    if (ed) ed.chain().focus().toggleOrderedList().run();
    else setBullets("numbered");
  };
  const cmdAdjustIndent = (d: number) => {
    if (ed) {
      // Inside a list, sink/lift the list item — that's the natural
      // "indent" inside a bulletList/orderedList structure.
      if (ed.isActive("bulletList") || ed.isActive("orderedList")) {
        if (d > 0) ed.chain().focus().sinkListItem("listItem").run();
        else ed.chain().focus().liftListItem("listItem").run();
        return;
      }
      // Outside a list, the flat shape-level indent applies. We still
      // patch it whole-shape; no per-paragraph indent in v1.
    }
    adjustIndent(d);
  };
  // Suppress unused warnings — these helpers are wired into the JSX below.
  void cmdToggleBulletList; void cmdToggleOrderedList; void cmdAdjustIndent;

  // Helper: given a 3-state mark presence, render the right CSS class.
  function btnClass(state: "off" | "on" | "mixed"): string | undefined {
    if (state === "on") return "row-active";
    if (state === "mixed") return "row-mixed";
    return undefined;
  }
  void btnClass; // referenced by ToggleBtnState below


  // When another floating bar shares the top-center anchor, push this one
  // down by one bar-height (~38px) + gap so the two stack cleanly:
  // - sticky edit:        StickyFormatBar on top, TextFormatBar below
  // - shape edit:         ShapeOptionsBar on top, TextFormatBar below (per
  //                       UX request for double-click-to-edit on shapes)
  // - form-control select: ShapeOptionsBar stays mounted for tickbox /
  //                       radio / toggle / slider; their label TextFormatBar
  //                       sits below it so users can format the label
  //                       without overlapping the shape toolkit. Text
  //                       elements (transparent rectangles) DON'T trigger
  //                       this — the SheetToolbar dispatcher short-circuits
  //                       ShapeOptionsBar for them, freeing the top slot.
  const STACK_OFFSET = 46; // ~38px bar + 8px gap, hand-tuned to match
  const isSelectedFormControl =
    !!selectedTextShape &&
    (selectedTextShape.kind === "tickbox" ||
      selectedTextShape.kind === "radio" ||
      selectedTextShape.kind === "toggle" ||
      selectedTextShape.kind === "slider");
  const stackOnTopOfAnotherBar =
    editingTarget?.kind === "sticky" ||
    editingTarget?.kind === "shape" ||
    isSelectedFormControl;
  const topPx = stackOnTopOfAnotherBar
    ? RULER_SIZE + 8 + STACK_OFFSET
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
        value={displayFont}
        onChange={(v) => {
          cmdSetFont(v);
          // Always also update the tool default so picking a font during
          // edit influences the next-created text shape's seed.
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
          value={displayFontSize}
          onChange={(e) => {
            const n = Math.max(8, Math.min(200, Number(e.target.value) || 16));
            cmdSetFontSize(n);
          }}
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
            style={{ background: displayColor }}
          />
        </button>
        {colorOpen && (
          <TextColorPicker
            value={displayColor}
            onChange={(c) => cmdSetColor(c)}
            onClose={() => setColorOpen(false)}
          />
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
              background: displayBg ?? "transparent",
              backgroundImage: displayBg
                ? undefined
                : "linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%), linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%)",
              backgroundSize: displayBg ? undefined : "6px 6px",
              backgroundPosition: displayBg ? undefined : "0 0, 3px 3px",
            }}
          />
        </button>
        {bgOpen && (
          <TextBackgroundColorPicker
            value={displayBg}
            onChange={(c) => cmdSetBgColor(c)}
            onClose={() => setBgOpen(false)}
          />
        )}
      </div>

      <Divider />

      <ToggleBtnState
        state={boldState}
        onClick={cmdToggleBold}
        title="Bold"
      >
        <Bold size={13} />
      </ToggleBtnState>
      <ToggleBtnState
        state={italicState}
        onClick={cmdToggleItalic}
        title="Italic"
      >
        <Italic size={13} />
      </ToggleBtnState>
      <ToggleBtnState
        state={underlineState}
        onClick={cmdToggleUnderline}
        title="Underline"
      >
        <Underline size={13} />
      </ToggleBtnState>
      <ToggleBtnState
        state={strikeState}
        onClick={cmdToggleStrike}
        title="Strikethrough"
      >
        <Strikethrough size={13} />
      </ToggleBtnState>

      <Divider />

      <ToggleBtn
        active={text.align === "left"}
        onClick={() => cmdSetAlign("left")}
        title="Align left"
      >
        <AlignLeft size={13} />
      </ToggleBtn>
      <ToggleBtn
        active={text.align === "center"}
        onClick={() => cmdSetAlign("center")}
        title="Align center"
      >
        <AlignCenter size={13} />
      </ToggleBtn>
      <ToggleBtn
        active={text.align === "right"}
        onClick={() => cmdSetAlign("right")}
        title="Align right"
      >
        <AlignRight size={13} />
      </ToggleBtn>
      <ToggleBtn
        active={text.align === "justify"}
        onClick={() => cmdSetAlign("justify")}
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
        active={text.bullets === "bulleted" || (ed?.isActive("bulletList") ?? false)}
        title="Bulleted list"
        onToggle={() => {
          cmdToggleBulletList();
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
        active={text.bullets === "numbered" || (ed?.isActive("orderedList") ?? false)}
        title="Numbered list"
        onToggle={() => {
          cmdToggleOrderedList();
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
        onClick={() => cmdAdjustIndent(-1)}
        title="Decrease indent"
      >
        <IndentDecrease size={13} />
      </ToggleBtn>
      <ToggleBtn
        active={false}
        onClick={() => cmdAdjustIndent(1)}
        title="Increase indent"
      >
        <IndentIncrease size={13} />
      </ToggleBtn>
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

/** Three-state variant of `ToggleBtn` used for marks that come from the
 *  rich-text editor's selection. "on" = uniformly applied across selection,
 *  "off" = absent, "mixed" = some chars have it and some don't (rendered
 *  with the half-tinted `row-mixed` style + corner dot from index.css). */
function ToggleBtnState({
  state,
  onClick,
  title,
  children,
}: {
  state: "off" | "on" | "mixed";
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const cls =
    state === "on"
      ? "row-active"
      : state === "mixed"
      ? "row-mixed"
      : "hover:bg-ink-700 text-ink-200";
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-pressed={state === "on" ? true : state === "mixed" ? "mixed" : false}
      className={`h-7 w-7 grid place-items-center rounded text-xs transition-colors ${cls}`}
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
