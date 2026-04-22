import { useEffect, useRef, useState } from "react";
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Check,
  Square,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  MoreHorizontal,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  Pencil,
  Download,
  Frame,
  Equal,
  Palette,
  Pen,
  Brush,
  Highlighter,
  Eraser,
  Crosshair,
  Minus,
  StickyNote,
  Type,
  Upload,
  MousePointer2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Link2,
  Group as GroupIcon,
  Ungroup,
  Image as ImageIcon,
  RotateCw,
} from "lucide-react";
import type Konva from "konva";
import { useStore } from "../store";
import type {
  LineStyle,
  Orientation,
  PaperSize,
  PenVariant,
  Shape,
  Sheet,
  ShapeShape,
} from "../types";
import { PAPER_SIZES_MM, PAPER_SIZE_OPTIONS } from "../lib/paperSizes";
import { ColorPickerPanel } from "./ColorPickerPanel";
import {
  exportSheetAsImage,
  exportSheetUnsupported,
} from "../lib/exportSheet";
import { RULER_SIZE } from "./Rulers";

const TOOLBAR_HEIGHT = 38;

export function SheetToolbar() {
  const tool = useStore((s) => s.tool);
  const selectedShape = useStore((s) => {
    const id = s.selectedShapeId;
    if (!id) return null;
    return s.shapes.find((sh) => sh.id === id) || null;
  });
  if (tool !== "select") return <ToolOptionsBar />;
  if (selectedShape && selectedShape.type === "shape")
    return <ShapeOptionsBar />;
  return <SheetOptionsBar />;
}

function SheetOptionsBar() {
  const sheet = useStore((s) =>
    s.sheets.find((x) => x.id === s.selectedSheetId) || null
  );
  const addSheet = useStore((s) => s.addSheet);
  const insertSheetAfter = useStore((s) => s.insertSheetAfter);
  const duplicateSheet = useStore((s) => s.duplicateSheet);
  const deleteSheet = useStore((s) => s.deleteSheet);
  const renameSheet = useStore((s) => s.renameSheet);
  const setSheetPaperSize = useStore((s) => s.setSheetPaperSize);
  const setSheetCustomSize = useStore((s) => s.setSheetCustomSize);
  const setSheetBackground = useStore((s) => s.setSheetBackground);
  const setSheetMargin = useStore((s) => s.setSheetMargin);
  const setSheetBorder = useStore((s) => s.setSheetBorder);
  const toggleSheetLocked = useStore((s) => s.toggleSheetLocked);
  const toggleSheetHidden = useStore((s) => s.toggleSheetHidden);
  // NOTE: intentionally do NOT subscribe to `shapes` here — the toolbar only
  // needs them inside the copy/paste handlers, and reading via getState() at
  // call time avoids a toolbar re-render on every shape mutation.

  const [open, setOpen] = useState<
    null | "size" | "bg" | "margins" | "borders" | "more"
  >(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // outside click close
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onMd(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    }
    if (open) document.addEventListener("mousedown", onMd);
    return () => document.removeEventListener("mousedown", onMd);
  }, [open]);

  // floating pill: hidden completely when nothing selected
  if (!sheet) return null;

  function copySheet(s: Sheet) {
    try {
      const shapes = useStore.getState().shapes;
      const payload = {
        sheet: { ...s, id: undefined as unknown as string },
        shapes: shapes
          .filter((sh) => sh.sheetId === s.id)
          .map((sh) => ({ ...sh, id: undefined as unknown as string })),
      };
      sessionStorage.setItem("spaceshow:sheet-clip", JSON.stringify(payload));
      setToast("Sheet copied");
    } catch {
      setToast("Copy failed");
    }
  }

  function pasteSheet(after: Sheet) {
    try {
      const raw = sessionStorage.getItem("spaceshow:sheet-clip");
      if (!raw) {
        setToast("Clipboard empty");
        return;
      }
      const payload = JSON.parse(raw);
      insertSheetAfter(after.id);
      // grab the newly inserted sheet (it's right after `after`)
      const st = useStore.getState();
      const idx = st.sheets.findIndex((sh) => sh.id === after.id);
      const inserted = st.sheets[idx + 1];
      if (!inserted) return;
      // copy metadata onto inserted sheet
      useStore.setState((s) => ({
        sheets: s.sheets.map((sh) =>
          sh.id === inserted.id
            ? {
                ...sh,
                background: payload.sheet.background ?? sh.background,
                paperSize: payload.sheet.paperSize ?? sh.paperSize,
                orientation: payload.sheet.orientation ?? sh.orientation,
                margins: payload.sheet.margins ?? {},
                border: payload.sheet.border ?? sh.border,
                width: payload.sheet.width ?? sh.width,
                height: payload.sheet.height ?? sh.height,
              }
            : sh
        ),
      }));
      // clone shapes
      const clones = (payload.shapes || []).map((sh: Shape) => ({
        ...sh,
        id: `shape_${Math.random().toString(36).slice(2, 9)}`,
        sheetId: inserted.id,
      }));
      if (clones.length) {
        useStore.setState((s) => ({ shapes: [...s.shapes, ...clones] }));
      }
      setToast("Sheet pasted");
    } catch {
      setToast("Paste failed");
    }
  }

  return (
    <div
      ref={rootRef}
      className="absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 panel rounded-full shadow-2xl"
      style={{
        top: RULER_SIZE + 8,
        height: TOOLBAR_HEIGHT,
        background: "var(--bg-secondary)",
      }}
    >
      {/* Add sheet */}
      <button
        className="pill-btn h-7 px-2.5 text-xs whitespace-nowrap"
        onClick={addSheet}
        title="Add sheet at end"
      >
        <Plus size={13} className="mr-1" /> Add sheet
      </button>

      <Divider />

      {/* Size */}
      <ToolbarBtn
        onClick={() => setOpen(open === "size" ? null : "size")}
        title="Paper size"
        active={open === "size"}
        wide
      >
        <Equal size={13} className="mr-1.5" />
        <span className="text-xs whitespace-nowrap">
          {sheet.paperSize === "custom"
            ? `${Math.round(sheet.width)}×${Math.round(sheet.height)}`
            : `${sheet.paperSize} · ${capitalize(sheet.orientation)}`}
        </span>
        <ChevronDown size={12} className="ml-1" />
      </ToolbarBtn>

      {/* Background */}
      <ToolbarBtn
        onClick={() => setOpen(open === "bg" ? null : "bg")}
        title="Background"
        active={open === "bg"}
      >
        <Palette size={14} />
        <span
          className="ml-1 inline-block w-3.5 h-3.5 rounded ring-1 ring-ink-700"
          style={{ background: sheet.background }}
        />
      </ToolbarBtn>

      {/* Margins */}
      <ToolbarBtn
        onClick={() => setOpen(open === "margins" ? null : "margins")}
        title="Margins"
        active={open === "margins"}
      >
        <Frame size={14} />
      </ToolbarBtn>

      {/* Borders */}
      <ToolbarBtn
        onClick={() => setOpen(open === "borders" ? null : "borders")}
        title="Borders"
        active={open === "borders"}
      >
        <Square size={14} />
      </ToolbarBtn>

      <Divider />

      {/* Lock */}
      <ToolbarBtn
        onClick={() => toggleSheetLocked(sheet.id)}
        title={sheet.locked ? "Unlock frame" : "Lock frame"}
        active={sheet.locked}
      >
        {sheet.locked ? <Lock size={14} /> : <Unlock size={14} />}
      </ToolbarBtn>

      {/* Hide */}
      <ToolbarBtn
        onClick={() => toggleSheetHidden(sheet.id)}
        title={sheet.hidden ? "Show frame" : "Hide frame"}
        active={sheet.hidden}
      >
        {sheet.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
      </ToolbarBtn>

      <Divider />

      {/* More */}
      <ToolbarBtn
        onClick={() => setOpen(open === "more" ? null : "more")}
        title="More"
        active={open === "more"}
      >
        <MoreHorizontal size={14} />
      </ToolbarBtn>

      <div className="ml-1 pl-2 border-l border-ink-700 text-[11px] text-ink-400 whitespace-nowrap pr-1">
        Editing <span className="text-ink-200">{sheet.name}</span>
      </div>

      {/* Popovers */}
      {open === "size" && (
        <Popover anchor="left">
          <SizePopover
            sheet={sheet}
            onPick={(size, ori) => setSheetPaperSize(sheet.id, size, ori)}
            onCustom={(w, h) => setSheetCustomSize(sheet.id, w, h)}
          />
        </Popover>
      )}
      {open === "bg" && (
        <Popover anchor="left" flat>
          <SheetBackgroundPopover
            sheet={sheet}
            onChangeBackground={(c) => setSheetBackground(sheet.id, c)}
            onChangeBorderColor={(c) => setSheetBorder(sheet.id, { color: c })}
          />
        </Popover>
      )}
      {open === "margins" && (
        <Popover anchor="left">
          <MarginsPopover
            sheet={sheet}
            onApply={(m) => {
              (["top", "right", "bottom", "left"] as const).forEach((side) =>
                setSheetMargin(sheet.id, side, m[side] === 0 ? undefined : m[side])
              );
              setOpen(null);
            }}
            onCancel={() => setOpen(null)}
          />
        </Popover>
      )}
      {open === "borders" && (
        <Popover anchor="left" wide>
          <BordersPopover
            sheet={sheet}
            onApply={(patch) => {
              setSheetBorder(sheet.id, patch);
              setOpen(null);
            }}
            onCancel={() => setOpen(null)}
          />
        </Popover>
      )}
      {open === "more" && (
        <Popover anchor="right">
          <MorePopover
            sheet={sheet}
            onCopy={() => {
              copySheet(sheet);
              setOpen(null);
            }}
            onPaste={() => {
              pasteSheet(sheet);
              setOpen(null);
            }}
            onDuplicate={() => {
              duplicateSheet(sheet.id);
              setOpen(null);
            }}
            onDelete={() => {
              deleteSheet(sheet.id);
              setOpen(null);
            }}
            onRename={(name) => renameSheet(sheet.id, name)}
            onExport={(format) => {
              if (format === "png" || format === "jpeg") {
                const stage = (window as unknown as { __spaceshow_stage?: Konva.Stage }).__spaceshow_stage;
                const z = useStore.getState().zoom;
                const p = useStore.getState().pan;
                if (stage) {
                  exportSheetAsImage(stage, sheet, format, z, p);
                  setToast(`Exported ${format.toUpperCase()}`);
                } else {
                  setToast("Stage not ready");
                }
              } else {
                setToast(exportSheetUnsupported(format));
              }
              setOpen(null);
            }}
          />
        </Popover>
      )}

      {toast && (
        <div className="absolute right-3 top-full mt-1 z-40 bg-ink-800 text-ink-100 text-xs px-2.5 py-1.5 rounded border border-ink-700 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  title,
  active,
  wide,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center h-7 ${
        wide ? "px-2" : "w-7"
      } rounded-md text-ink-200 transition-colors ${
        active ? "row-active" : "hover:bg-ink-700"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-ink-700 mx-0.5" />;
}

function Popover({
  children,
  anchor,
  wide,
  flat,
}: {
  children: React.ReactNode;
  anchor: "left" | "right";
  wide?: boolean;
  /** When true, skip the drop shadow. Used for the background popover
   *  where the shadow was visually interfering with the transparency
   *  checker + swatch previews. */
  flat?: boolean;
}) {
  return (
    <div
      className={`absolute top-full mt-2 z-30 panel rounded-md p-3 ${
        flat ? "" : "shadow-2xl"
      } ${wide ? "w-80" : "w-64"} ${anchor === "right" ? "right-0" : "left-0"}`}
      style={{ background: "var(--bg-secondary)" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function SizePopover({
  sheet,
  onPick,
  onCustom,
}: {
  sheet: Sheet;
  onPick: (s: PaperSize, o: Orientation) => void;
  onCustom: (w: number, h: number) => void;
}) {
  // For custom sheets, orientation is derived from the aspect ratio rather
  // than the stale stored field. For standard paper sizes it follows the sheet.
  const effectiveOrientation: Orientation =
    sheet.paperSize === "custom"
      ? sheet.width >= sheet.height
        ? "landscape"
        : "portrait"
      : sheet.orientation;
  const [orientation, setOrientation] = useState<Orientation>(effectiveOrientation);
  const [wStr, setWStr] = useState(String(Math.round(sheet.width)));
  const [hStr, setHStr] = useState(String(Math.round(sheet.height)));
  // Keep inputs in sync when the sheet's dims change via any path (paper-size
  // pick, undo/redo, external paste, etc.) so "Apply" never commits a stale
  // value the user never typed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWStr(String(Math.round(sheet.width)));
    setHStr(String(Math.round(sheet.height)));
    setOrientation(effectiveOrientation);
  }, [sheet.id, sheet.width, sheet.height, effectiveOrientation]);
  const wNum = Number(wStr);
  const hNum = Number(hStr);
  const valid =
    wStr !== "" &&
    hStr !== "" &&
    Number.isFinite(wNum) &&
    Number.isFinite(hNum) &&
    wNum >= 50 &&
    hNum >= 50 &&
    wNum <= 20000 &&
    hNum <= 20000;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1 p-1 rounded-md surface-2">
        <SegBtn
          active={orientation === "landscape"}
          onClick={() => {
            setOrientation("landscape");
            if (sheet.paperSize !== "custom") onPick(sheet.paperSize, "landscape");
          }}
        >
          Landscape
        </SegBtn>
        <SegBtn
          active={orientation === "portrait"}
          onClick={() => {
            setOrientation("portrait");
            if (sheet.paperSize !== "custom") onPick(sheet.paperSize, "portrait");
          }}
        >
          Portrait
        </SegBtn>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {PAPER_SIZE_OPTIONS.map((opt) => {
          const active = sheet.paperSize === opt;
          const dim = PAPER_SIZES_MM[opt];
          return (
            <button
              key={opt}
              onClick={() => onPick(opt, orientation)}
              className={`flex flex-col items-center justify-center gap-0.5 h-12 rounded-md text-[11px] transition-colors ${
                active
                  ? "row-selected ring-1 ring-brand-600"
                  : "surface-2 hover:bg-ink-700 text-ink-200"
              }`}
              title={`${opt} · ${dim.w}×${dim.h} mm`}
            >
              <span className="font-medium">{opt}</span>
              <span className="text-[9px] text-ink-400">
                {dim.w}×{dim.h}mm
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-ink-700 pt-2">
        <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">
          Custom (px)
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={50}
            max={20000}
            step={1}
            value={wStr}
            onChange={(e) => setWStr(e.target.value)}
            className="flex-1 h-7 px-2 text-xs rounded bg-ink-700 border border-ink-700 outline-none focus:border-brand-600 text-ink-100"
          />
          <span className="text-ink-400 text-xs">×</span>
          <input
            type="number"
            min={50}
            max={20000}
            step={1}
            value={hStr}
            onChange={(e) => setHStr(e.target.value)}
            className="flex-1 h-7 px-2 text-xs rounded bg-ink-700 border border-ink-700 outline-none focus:border-brand-600 text-ink-100"
          />
          <button
            className="pill-btn h-7 px-2.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!valid}
            onClick={() => valid && onCustom(wNum, hNum)}
          >
            Apply
          </button>
        </div>
        {!valid && (wStr !== "" || hStr !== "") && (
          <div className="text-[10px] text-rose-400 mt-1">
            Enter width and height between 50 and 20000 px.
          </div>
        )}
      </div>
    </div>
  );
}

function SegBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-7 rounded text-xs transition-colors ${
        active ? "bg-brand-600 text-white" : "text-ink-200 hover:bg-ink-700"
      }`}
    >
      {children}
    </button>
  );
}

type Side = "top" | "right" | "bottom" | "left";

type MarginValues = { left: number; right: number; top: number; bottom: number };
type MarginEnabled = { left: boolean; right: boolean; top: boolean; bottom: boolean };

const MARGIN_DEFAULT_VALUE = 20;
const MARGIN_SIDES: Side[] = ["left", "right", "top", "bottom"];

function MarginsPopover({
  sheet,
  onApply,
  onCancel,
}: {
  sheet: Sheet;
  onApply: (margins: MarginValues) => void;
  onCancel: () => void;
}) {
  // Per spec: toggles default ON, values default to 20. If the sheet already
  // has a value for a side, use it (so the popover reflects reality); otherwise
  // fall back to the default.
  const initialValues: MarginValues = {
    left: sheet.margins.left && sheet.margins.left > 0 ? sheet.margins.left : MARGIN_DEFAULT_VALUE,
    right: sheet.margins.right && sheet.margins.right > 0 ? sheet.margins.right : MARGIN_DEFAULT_VALUE,
    top: sheet.margins.top && sheet.margins.top > 0 ? sheet.margins.top : MARGIN_DEFAULT_VALUE,
    bottom: sheet.margins.bottom && sheet.margins.bottom > 0 ? sheet.margins.bottom : MARGIN_DEFAULT_VALUE,
  };

  const [enabled, setEnabled] = useState<MarginEnabled>({
    left: true,
    right: true,
    top: true,
    bottom: true,
  });
  const [values, setValues] = useState<MarginValues>(initialValues);

  // Derived "All" state — synced only when every side is enabled AND values match.
  const anyEnabled = enabled.left || enabled.right || enabled.top || enabled.bottom;
  const allEnabled = enabled.left && enabled.right && enabled.top && enabled.bottom;
  const allValuesEqual = new Set(MARGIN_SIDES.map((s) => values[s])).size === 1;
  const allSynced = allEnabled && allValuesEqual;
  const allDisplayValue: number | "" = allSynced ? values.left : "";

  function setValueForSide(side: Side, v: number) {
    const clamped = Math.max(0, Math.round(v));
    setValues((prev) => ({ ...prev, [side]: clamped }));
  }

  function toggleSide(side: Side) {
    setEnabled((prev) => ({ ...prev, [side]: !prev[side] }));
  }

  function toggleAll() {
    const next = !anyEnabled;
    setEnabled({ left: next, right: next, top: next, bottom: next });
  }

  function setAllValues(v: number) {
    const clamped = Math.max(0, Math.round(v));
    setValues({ left: clamped, right: clamped, top: clamped, bottom: clamped });
  }

  function handleReset() {
    setEnabled({ left: true, right: true, top: true, bottom: true });
    setValues({
      left: MARGIN_DEFAULT_VALUE,
      right: MARGIN_DEFAULT_VALUE,
      top: MARGIN_DEFAULT_VALUE,
      bottom: MARGIN_DEFAULT_VALUE,
    });
  }

  function handleApply() {
    const output: MarginValues = {
      left: enabled.left ? values.left : 0,
      right: enabled.right ? values.right : 0,
      top: enabled.top ? values.top : 0,
      bottom: enabled.bottom ? values.bottom : 0,
    };
    onApply(output);
  }

  // Sheet preview — shows the inset margin guide at the sheet's true aspect
  // ratio so users see what "20 px" actually looks like on this sheet.
  const sheetAspect = sheet.width / sheet.height;
  const PREVIEW_MAX_W = 156;
  const PREVIEW_MAX_H = 96;
  const previewW =
    sheetAspect >= PREVIEW_MAX_W / PREVIEW_MAX_H
      ? PREVIEW_MAX_W
      : Math.round(PREVIEW_MAX_H * sheetAspect);
  const previewH =
    sheetAspect >= PREVIEW_MAX_W / PREVIEW_MAX_H
      ? Math.round(PREVIEW_MAX_W / sheetAspect)
      : PREVIEW_MAX_H;
  const scaleX = previewW / sheet.width;
  const scaleY = previewH / sheet.height;
  const insetLeft = enabled.left ? values.left * scaleX : 0;
  const insetRight = enabled.right ? values.right * scaleX : 0;
  const insetTop = enabled.top ? values.top * scaleY : 0;
  const insetBottom = enabled.bottom ? values.bottom * scaleY : 0;

  return (
    <div
      className="flex flex-col w-full overflow-hidden"
      style={{ maxHeight: "min(600px, calc(100vh - 160px))" }}
    >
      {/* Header */}
      <div className="shrink-0 flex items-baseline justify-between">
        <div className="text-xs font-medium text-ink-100">Margins</div>
        <div className="text-[10px] text-ink-500">px from edges</div>
      </div>

      {/* Preview diagram */}
      <div className="shrink-0 mt-2 flex justify-center">
        <div
          className="relative rounded-sm"
          style={{
            width: previewW,
            height: previewH,
            background: sheet.background.slice(0, 7),
            boxShadow: "inset 0 0 0 1px rgba(100,116,139,0.35)",
          }}
          aria-hidden
        >
          <div
            className="absolute rounded-[2px] border border-dashed border-brand-500/70"
            style={{
              left: insetLeft,
              right: insetRight,
              top: insetTop,
              bottom: insetBottom,
            }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin pr-0.5 -mr-0.5 mt-3">
        {/* Master "All sides" row — subtle surface treatment */}
        <div className="rounded-md bg-ink-900/40 ring-1 ring-ink-700/60 px-1">
          <MarginRow
            side="all"
            label="All sides"
            icon={<Link2 size={11} />}
            enabled={anyEnabled}
            value={allDisplayValue}
            onToggle={toggleAll}
            onValueChange={(v) => setAllValues(v)}
            isAllRow
          />
        </div>

        <div className="mt-2 space-y-0.5">
          <MarginRow
            side="left"
            label="Left"
            icon={<ArrowLeft size={11} />}
            enabled={enabled.left}
            value={values.left}
            onToggle={() => toggleSide("left")}
            onValueChange={(v) => setValueForSide("left", v)}
          />
          <MarginRow
            side="right"
            label="Right"
            icon={<ArrowRight size={11} />}
            enabled={enabled.right}
            value={values.right}
            onToggle={() => toggleSide("right")}
            onValueChange={(v) => setValueForSide("right", v)}
          />
          <MarginRow
            side="top"
            label="Top"
            icon={<ArrowUp size={11} />}
            enabled={enabled.top}
            value={values.top}
            onToggle={() => toggleSide("top")}
            onValueChange={(v) => setValueForSide("top", v)}
          />
          <MarginRow
            side="bottom"
            label="Bottom"
            icon={<ArrowDown size={11} />}
            enabled={enabled.bottom}
            value={values.bottom}
            onToggle={() => toggleSide("bottom")}
            onValueChange={(v) => setValueForSide("bottom", v)}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1 pt-2.5 mt-2.5 border-t border-ink-700 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-7 text-[11px] font-medium rounded-md text-ink-300 hover:bg-ink-800 hover:text-ink-100 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="flex-1 h-7 text-[11px] font-medium rounded-md bg-ink-800 text-ink-200 hover:bg-ink-700 transition-colors"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="flex-1 h-7 text-[11px] font-medium rounded-md bg-brand-500 text-white hover:bg-brand-400 transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function MarginRow({
  side,
  label,
  icon,
  enabled,
  value,
  onToggle,
  onValueChange,
  isAllRow,
}: {
  side: string;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  value: number | "";
  onToggle: () => void;
  onValueChange: (v: number) => void;
  isAllRow?: boolean;
}) {
  const [str, setStr] = useState<string>(value === "" ? "" : String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focused) setStr(value === "" ? "" : String(value));
  }, [value, focused]);

  function commit(raw: string) {
    if (raw.trim() === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onValueChange(Math.max(0, Math.round(n)));
  }

  return (
    <div
      className={`flex items-center gap-1 h-7 rounded transition-opacity ${
        enabled ? "" : "opacity-55"
      }`}
    >
      <span
        className={`w-3.5 grid place-items-center shrink-0 ${
          enabled ? "text-ink-300" : "text-ink-500"
        }`}
      >
        {icon}
      </span>
      <span
        className={`text-[11px] flex-1 min-w-0 truncate ${
          isAllRow ? "font-medium text-ink-100" : enabled ? "text-ink-200" : "text-ink-500"
        }`}
      >
        {label}
      </span>

      {/* Toggle switch — compact */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label} margin ${enabled ? "enabled" : "disabled"}`}
        onClick={onToggle}
        className={`relative w-7 h-4 rounded-full transition-colors shrink-0 ${
          enabled ? "bg-brand-500" : "bg-ink-700"
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] w-3 h-3 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-3" : "translate-x-0"
          }`}
        />
      </button>

      {/* Number input (with inline "px" unit suffix via a flex wrapper) */}
      <div
        className={`relative flex items-center shrink-0 h-6 rounded border transition-colors ${
          enabled
            ? "border-ink-700 bg-ink-900 focus-within:border-brand-600"
            : "border-ink-800 bg-ink-900 cursor-not-allowed"
        }`}
      >
        <input
          type="number"
          inputMode="numeric"
          min={0}
          disabled={!enabled}
          value={str}
          placeholder={isAllRow ? "—" : ""}
          onChange={(e) => {
            setStr(e.target.value);
            if (enabled) commit(e.target.value);
          }}
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => {
            setFocused(false);
            setStr(value === "" ? "" : String(value));
          }}
          aria-label={`${label} margin value`}
          data-side={side}
          className={`w-10 pl-1.5 pr-0.5 bg-transparent text-[11px] text-right outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
            enabled ? "text-ink-100" : "text-ink-500"
          }`}
        />
        <span
          className={`pr-1.5 text-[10px] leading-none select-none ${
            enabled ? "text-ink-500" : "text-ink-600"
          }`}
        >
          px
        </span>
      </div>
    </div>
  );
}

type BorderSide = "top" | "right" | "bottom" | "left";
type BorderPlacement = "all" | BorderSide;
type BorderDraft = {
  weight: number;
  style: LineStyle;
  color: string;
  sides: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  offsets: { top: number; right: number; bottom: number; left: number };
  opacity: number; // 0..1
  radius: { tl: number; tr: number; bl: number; br: number };
};

const BORDER_WEIGHT_MAX = 32;
const BORDER_RADIUS_MAX = 200;
const BORDER_OFFSET_MAX = 200;

// 8 architect-oriented preset swatches per the spec.
const BORDER_PRESETS: { hex: string; name: string }[] = [
  { hex: "#1A1A1A", name: "Drafting Black" },
  { hex: "#64748B", name: "Slate Gray" },
  { hex: "#CBD5E1", name: "Light Silver" },
  { hex: "#1E3A8A", name: "Blueprint Blue" },
  { hex: "#DC2626", name: "Redline Red" },
  { hex: "#EA580C", name: "Safety Orange" },
  { hex: "#166534", name: "CAD Green" },
  { hex: "#FFFFFF", name: "Pure White" },
];

function BordersPopover({
  sheet,
  onApply,
  onCancel,
}: {
  sheet: Sheet;
  onApply: (patch: Partial<Sheet["border"]>) => void;
  onCancel: () => void;
}) {
  const committed: BorderDraft = {
    weight: sheet.border.weight,
    style: sheet.border.style,
    color: sheet.border.color,
    sides: { ...sheet.border.sides },
    offsets: { ...(sheet.border.offsets ?? { top: 0, right: 0, bottom: 0, left: 0 }) },
    opacity: typeof sheet.border.opacity === "number" ? sheet.border.opacity : 1,
    radius: { ...(sheet.border.radius ?? { tl: 0, tr: 0, bl: 0, br: 0 }) },
  };
  const committedKey = JSON.stringify(committed);

  const [draft, setDraft] = useState<BorderDraft>(committed);
  const [colorOpen, setColorOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(committed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedKey]);

  const hasChange = JSON.stringify(draft) !== committedKey;

  // ── Master switch ─────────────────────────────────────────────────────
  // Border is "on" if at least one side is enabled AND weight > 0. This
  // single predicate drives the switch + progressive-disclosure region.
  const anySideOn =
    draft.sides.top || draft.sides.right || draft.sides.bottom || draft.sides.left;
  const masterOn = anySideOn && draft.weight > 0;

  // Remember the most recent "on" configuration so toggling off → on restores
  // the user's previous choice rather than defaulting to "all sides".
  const lastOnRef = useRef<{
    sides: BorderDraft["sides"];
    weight: number;
  }>({
    sides: anySideOn
      ? draft.sides
      : { top: true, right: true, bottom: true, left: true },
    weight: draft.weight > 0 ? draft.weight : 1,
  });

  useEffect(() => {
    if (masterOn) {
      lastOnRef.current = { sides: draft.sides, weight: draft.weight };
    }
  }, [masterOn, draft.sides, draft.weight]);

  function setMasterOn(on: boolean) {
    if (on) {
      const mem = lastOnRef.current;
      setDraft((d) => ({
        ...d,
        sides:
          mem.sides.top || mem.sides.right || mem.sides.bottom || mem.sides.left
            ? mem.sides
            : { top: true, right: true, bottom: true, left: true },
        weight: mem.weight > 0 ? mem.weight : 1,
      }));
    } else {
      setDraft((d) => ({
        ...d,
        sides: { top: false, right: false, bottom: false, left: false },
      }));
      setColorOpen(false);
    }
  }

  // ── Placement (derived) ───────────────────────────────────────────────
  const currentPlacement: BorderPlacement | null = (() => {
    const { top, right, bottom, left } = draft.sides;
    if (top && right && bottom && left) return "all";
    const count = [top, right, bottom, left].filter(Boolean).length;
    if (count === 1) {
      if (top) return "top";
      if (right) return "right";
      if (bottom) return "bottom";
      if (left) return "left";
    }
    return null;
  })();

  function setPlacement(p: BorderPlacement) {
    if (p === "all") {
      setDraft((d) => ({
        ...d,
        sides: { top: true, right: true, bottom: true, left: true },
      }));
    } else {
      const sides = { top: false, right: false, bottom: false, left: false };
      sides[p] = true;
      setDraft((d) => ({ ...d, sides }));
    }
  }

  // ── Appearance ────────────────────────────────────────────────────────
  function setWeight(w: number) {
    const clamped = Math.max(0, Math.min(BORDER_WEIGHT_MAX, Math.round(w)));
    setDraft((d) => ({ ...d, weight: clamped }));
  }

  function setStyle(s: LineStyle) {
    setDraft((d) => ({ ...d, style: s }));
  }

  // ── Color & opacity ───────────────────────────────────────────────────
  function setColor(c: string) {
    setDraft((d) => ({ ...d, color: c }));
  }
  function setOpacity(o: number) {
    const clamped = Math.max(0, Math.min(1, o));
    setDraft((d) => ({ ...d, opacity: clamped }));
  }

  // ── Corner radius (uniform) ───────────────────────────────────────────
  const cornerValues = [
    draft.radius.tl,
    draft.radius.tr,
    draft.radius.bl,
    draft.radius.br,
  ];
  const uniformRadius =
    new Set(cornerValues).size === 1 ? cornerValues[0] : null;

  function setUniformRadius(r: number) {
    const clamped = Math.max(0, Math.min(BORDER_RADIUS_MAX, Math.round(r)));
    setDraft((d) => ({
      ...d,
      radius: { tl: clamped, tr: clamped, bl: clamped, br: clamped },
    }));
  }

  // ── Distance from edge (uniform offset) ───────────────────────────────
  // The data model supports per-side offsets, but in practice users almost
  // always want a single uniform inset. We expose a single field; if the
  // values diverge (e.g. via legacy data), we render "Mixed".
  const offsetValues = [
    draft.offsets.top,
    draft.offsets.right,
    draft.offsets.bottom,
    draft.offsets.left,
  ];
  const uniformOffset =
    new Set(offsetValues).size === 1 ? offsetValues[0] : null;

  function setUniformOffset(v: number) {
    const clamped = Math.max(0, Math.min(BORDER_OFFSET_MAX, Math.round(v)));
    setDraft((d) => ({
      ...d,
      offsets: { top: clamped, right: clamped, bottom: clamped, left: clamped },
    }));
  }

  // ── Actions ───────────────────────────────────────────────────────────
  function handleReset() {
    setDraft({
      weight: 1,
      style: "solid",
      color: "#1A1A1A",
      sides: { top: true, right: true, bottom: true, left: true },
      offsets: { top: 0, right: 0, bottom: 0, left: 0 },
      opacity: 1,
      radius: { tl: 0, tr: 0, bl: 0, br: 0 },
    });
    setColorOpen(false);
  }

  function handleApply() {
    const patch: Partial<Sheet["border"]> = {};
    if (draft.weight !== committed.weight) patch.weight = draft.weight;
    if (draft.style !== committed.style) patch.style = draft.style;
    if (draft.color !== committed.color) patch.color = draft.color;
    if (JSON.stringify(draft.sides) !== JSON.stringify(committed.sides))
      patch.sides = draft.sides;
    if (JSON.stringify(draft.offsets) !== JSON.stringify(committed.offsets))
      patch.offsets = draft.offsets;
    if (draft.opacity !== committed.opacity) patch.opacity = draft.opacity;
    if (JSON.stringify(draft.radius) !== JSON.stringify(committed.radius))
      patch.radius = draft.radius;
    onApply(patch);
  }

  return (
    <div
      className="flex flex-col w-full overflow-hidden"
      style={{ maxHeight: "min(720px, calc(100vh - 120px))" }}
    >
      {/* Header — title + master switch */}
      <div className="flex items-center justify-between shrink-0 pb-3 border-b border-ink-700">
        <div>
          <div className="text-xs font-medium text-ink-100">Border</div>
          <div className="text-[10px] text-ink-500 mt-0.5">
            {masterOn ? "Customize sheet edge styling" : "Disabled"}
          </div>
        </div>
        <BorderToggle on={masterOn} onChange={setMasterOn} />
      </div>

      {/* Body — progressive disclosure */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto scroll-thin pr-0.5 -mr-0.5 transition-opacity ${
          masterOn ? "opacity-100" : "opacity-55"
        }`}
        aria-hidden={!masterOn}
      >
        {masterOn ? (
          <div className="space-y-3.5 mt-3">
            {/* Live preview — shows the configured border on a mini sheet at
                 the sheet's true aspect ratio. Updates as soon as any control
                 changes so users see the result before clicking Apply. */}
            <BorderPreview sheet={sheet} draft={draft} />

            {/* Placement */}
            <BorderSection label="Placement">
              <PlacementPicker
                value={currentPlacement}
                onChange={setPlacement}
              />
            </BorderSection>

            {/* Appearance: Weight + Style on the same row */}
            <BorderSection label="Appearance">
              <div className="flex items-end gap-2">
                <div className="w-[84px] shrink-0">
                  <SubLabel htmlFor="border-weight-input">Weight</SubLabel>
                  <WeightStepper
                    id="border-weight-input"
                    value={draft.weight}
                    onChange={setWeight}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <SubLabel>Style</SubLabel>
                  <StyleDropdown value={draft.style} onChange={setStyle} />
                </div>
              </div>
            </BorderSection>

            {/* Color & Opacity */}
            <BorderSection label="Color & Opacity">
              <ColorSwatchButton
                value={draft.color}
                opacity={draft.opacity}
                open={colorOpen}
                onToggle={() => setColorOpen((v) => !v)}
              />
              {colorOpen && (
                <div
                  className="mt-2 p-2.5 rounded-md bg-ink-900/50 border border-ink-700"
                  role="region"
                  aria-label="Color picker"
                >
                  <BorderColorPicker
                    value={draft.color}
                    onChange={setColor}
                    opacity={draft.opacity}
                    onChangeOpacity={setOpacity}
                  />
                </div>
              )}
            </BorderSection>

            {/* Distance from edge */}
            <BorderSection label="Distance from Edge">
              <DistanceInput
                value={uniformOffset}
                onChange={setUniformOffset}
              />
            </BorderSection>

            {/* Corner Radius */}
            <BorderSection label="Corner Radius">
              <RadiusInput
                value={uniformRadius}
                onChange={setUniformRadius}
              />
            </BorderSection>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
            <div className="w-10 h-10 rounded-md border-2 border-dashed border-ink-600 mb-2.5" />
            <div className="text-[11px] text-ink-400 leading-relaxed">
              Border is off.
            </div>
            <div className="text-[10px] text-ink-500 leading-relaxed mt-0.5">
              Enable the switch above to customize
              <br />
              placement, style, color, and corners.
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 pt-3 mt-2 border-t border-ink-700 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-7 text-xs rounded-md text-ink-300 hover:bg-ink-700 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="flex-1 h-7 text-xs rounded-md border border-ink-600 text-ink-200 hover:bg-ink-700 hover:border-ink-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!hasChange}
          className="flex-1 h-7 text-xs rounded-md bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// ── Border subcomponents ───────────────────────────────────────────────────

// Section wrapper — uppercase micro-label above the control group. Uses
// role="group" + aria-labelledby so screen readers announce the label for
// the whole section, without the layout quirks that come with a real
// <fieldset>/<legend> (legend has special UA styles that break flex rows).
let __borderSectionSeq = 0;
function BorderSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [labelId] = useState(() => `border-section-${++__borderSectionSeq}`);
  return (
    <div role="group" aria-labelledby={labelId}>
      <div
        id={labelId}
        className="text-[10px] uppercase tracking-wider font-medium text-ink-400 mb-1.5 select-none"
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function SubLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[10px] text-ink-500 mb-1 select-none"
    >
      {children}
    </label>
  );
}

// Master on/off — larger, more tactile than the per-row switches; the visual
// signal that the whole panel is enabled or disabled.
function BorderToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Enable border"
      onClick={() => onChange(!on)}
      className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)] ${
        on ? "bg-brand-600" : "bg-ink-700"
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform ${
          on ? "translate-x-[18px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// Placement: 5 icon-only buttons that visually preview which sides are drawn.
// Using SVG glyphs rather than text labels keeps the control compact and
// intuitive — the user sees the outcome, not the name of it.
function PlacementPicker({
  value,
  onChange,
}: {
  value: BorderPlacement | null;
  onChange: (p: BorderPlacement) => void;
}) {
  const opts: {
    id: BorderPlacement;
    label: string;
    sides: [boolean, boolean, boolean, boolean];
  }[] = [
    { id: "all", label: "All sides", sides: [true, true, true, true] },
    { id: "top", label: "Top only", sides: [true, false, false, false] },
    { id: "bottom", label: "Bottom only", sides: [false, false, true, false] },
    { id: "left", label: "Left only", sides: [false, false, false, true] },
    { id: "right", label: "Right only", sides: [false, true, false, false] },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Border placement"
      className="grid grid-cols-5 gap-1 p-1 rounded-md bg-ink-900/60 border border-ink-700"
    >
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => onChange(o.id)}
            className={`relative h-11 grid place-items-center rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 ${
              active
                ? "bg-brand-600/20 ring-1 ring-brand-500"
                : "hover:bg-ink-800"
            }`}
          >
            <SideGlyph sides={o.sides} active={active} />
          </button>
        );
      })}
    </div>
  );
}

// Glyph: a small rectangle with the enabled sides highlighted — clearer than
// an up/down/left/right arrow, because it matches the live output shape.
function SideGlyph({
  sides: [t, r, b, l],
  active,
}: {
  sides: [boolean, boolean, boolean, boolean];
  active: boolean;
}) {
  const on = active ? "#5EEAD4" : "#E5E7EB";
  const off = "#4B5563";
  return (
    <svg
      width="22"
      height="16"
      viewBox="0 0 22 16"
      aria-hidden
      focusable="false"
    >
      <line x1="2" y1="2" x2="20" y2="2" stroke={t ? on : off} strokeWidth={t ? 2 : 1.25} strokeLinecap="square" />
      <line x1="20" y1="2" x2="20" y2="14" stroke={r ? on : off} strokeWidth={r ? 2 : 1.25} strokeLinecap="square" />
      <line x1="2" y1="14" x2="20" y2="14" stroke={b ? on : off} strokeWidth={b ? 2 : 1.25} strokeLinecap="square" />
      <line x1="2" y1="2" x2="2" y2="14" stroke={l ? on : off} strokeWidth={l ? 2 : 1.25} strokeLinecap="square" />
    </svg>
  );
}

// Numeric stepper — spec called for up/down chevrons rather than the native
// spinner (which is visually inconsistent across browsers).
function WeightStepper({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [str, setStr] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focused) setStr(String(value));
  }, [value, focused]);

  const canInc = value < BORDER_WEIGHT_MAX;
  const canDec = value > 0;

  function commit(raw: string) {
    if (raw.trim() === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onChange(n);
  }

  return (
    <div className="flex items-stretch h-8 rounded-md bg-ink-900 border border-ink-700 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-400/30 overflow-hidden transition-colors">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={str}
        onChange={(e) => {
          setStr(e.target.value);
          commit(e.target.value);
        }}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          setStr(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            if (canInc) onChange(value + 1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (canDec) onChange(value - 1);
          }
        }}
        aria-label="Border weight (pixels)"
        className="flex-1 min-w-0 bg-transparent pl-2 pr-0 text-[12px] text-ink-100 tabular-nums outline-none"
      />
      <span className="text-[10px] text-ink-500 self-center pr-1 select-none">
        px
      </span>
      <div className="flex flex-col border-l border-ink-700">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Increase weight"
          disabled={!canInc}
          onClick={() => canInc && onChange(value + 1)}
          className="flex-1 w-5 grid place-items-center hover:bg-ink-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronUp size={10} className="text-ink-300" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Decrease weight"
          disabled={!canDec}
          onClick={() => canDec && onChange(value - 1)}
          className="flex-1 w-5 grid place-items-center hover:bg-ink-700 border-t border-ink-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronDown size={10} className="text-ink-300" />
        </button>
      </div>
    </div>
  );
}

// Style dropdown — custom listbox so the options can visually preview the
// line style instead of rendering as plain text ("Dashed", etc.).
function StyleDropdown({
  value,
  onChange,
}: {
  value: LineStyle;
  onChange: (s: LineStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const styles: { id: LineStyle; label: string }[] = [
    { id: "solid", label: "Solid" },
    { id: "dashed", label: "Dashed" },
    { id: "dotted", label: "Dotted" },
    { id: "double", label: "Double" },
  ];
  const current = styles.find((s) => s.id === value) ?? styles[0];

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Border style: ${current.label}`}
        className="w-full h-8 pl-2 pr-1.5 flex items-center gap-2 rounded-md bg-ink-900 border border-ink-700 hover:border-ink-500 focus:outline-none focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-400/40 transition-colors"
      >
        <span className="flex-1 flex items-center justify-start min-w-0">
          <StyleGlyph style={current.id} />
        </span>
        <span className="text-[11px] text-ink-200 tabular-nums">
          {current.label}
        </span>
        <ChevronDown
          size={12}
          className={`text-ink-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Border style options"
          className="absolute top-full left-0 right-0 mt-1 z-40 rounded-md py-1 overflow-hidden border border-ink-700 shadow-xl"
          style={{ background: "var(--bg-secondary)" }}
        >
          {styles.map((s) => {
            const selected = s.id === value;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(s.id);
                    setOpen(false);
                  }}
                  className={`w-full h-8 pl-1.5 pr-2 flex items-center gap-2 text-left transition-colors focus:outline-none focus-visible:bg-ink-700 ${
                    selected ? "bg-brand-600/15" : "hover:bg-ink-700"
                  }`}
                >
                  <span className="w-4 grid place-items-center shrink-0">
                    {selected && (
                      <Check size={12} className="text-brand-400" />
                    )}
                  </span>
                  <span className="flex-1 flex items-center">
                    <StyleGlyph style={s.id} />
                  </span>
                  <span className="text-[11px] text-ink-200">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Swatch button — shows current color (checker background for transparency
// preview), HEX string, and opacity %. Clicking toggles the inline picker.
function ColorSwatchButton({
  value,
  opacity,
  open,
  onToggle,
}: {
  value: string;
  opacity: number;
  open: boolean;
  onToggle: () => void;
}) {
  const pct = Math.round(opacity * 100);
  // Two-layer background: the color overlay (with alpha) sits above a
  // transparent-checkerboard so the user can see the real opacity at a glance.
  const swatchStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(${value}, ${value}), conic-gradient(#6b7280 25%, #9ca3af 0 50%, #6b7280 0 75%, #9ca3af 0)`,
    backgroundSize: "100% 100%, 8px 8px",
    backgroundBlendMode: "normal",
    opacity: opacity === 0 ? 0.6 : 1,
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-haspopup="true"
      aria-expanded={open}
      aria-label={`Border color ${value} at ${pct}% opacity — click to ${
        open ? "close" : "open"
      } picker`}
      className="w-full h-9 flex items-center gap-2 px-2 rounded-md bg-ink-900 border border-ink-700 hover:border-ink-500 focus:outline-none focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-400/40 transition-colors"
    >
      <span
        className="w-5 h-5 rounded ring-1 ring-ink-600 shrink-0"
        style={{
          ...swatchStyle,
          // Apply transparency visually on top of checker
          background: `linear-gradient(${hexWithAlpha(value, opacity)}, ${hexWithAlpha(value, opacity)}), conic-gradient(at 50% 50%, #6b7280 0 25%, #9ca3af 0 50%, #6b7280 0 75%, #9ca3af 0)`,
          backgroundSize: "100% 100%, 8px 8px",
        }}
        aria-hidden
      />
      <span className="text-[11px] text-ink-100 uppercase tabular-nums">
        {value}
      </span>
      <span className="text-[11px] text-ink-400 tabular-nums ml-auto">
        {pct}%
      </span>
      <ChevronDown
        size={12}
        className={`text-ink-400 transition-transform ${
          open ? "rotate-180" : ""
        }`}
      />
    </button>
  );
}

// Custom glyph for the corner radius input — shows a rounded "L" suggesting
// a corner curve. Clearer than a generic icon from the lucide set.
function CornerRadiusIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path
        d="M1 13 L1 6 C 1 3 3 1 6 1 L 13 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Corner radius: numeric stepper + a secondary range slider for quick drag.
// Value is null when corners are mixed (shows "Mixed" placeholder).
function RadiusInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  const displayNumber = value ?? 0;
  const [str, setStr] = useState(value === null ? "" : String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focused) setStr(value === null ? "" : String(value));
  }, [value, focused]);

  function commit(raw: string) {
    if (raw.trim() === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onChange(n);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center h-8 rounded-md bg-ink-900 border border-ink-700 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-400/30 px-2 w-[96px] shrink-0 transition-colors">
        <CornerRadiusIcon className="text-ink-400 shrink-0 mr-1.5" />
        <input
          type="text"
          inputMode="numeric"
          value={str}
          placeholder={value === null ? "Mixed" : ""}
          onChange={(e) => {
            setStr(e.target.value);
            commit(e.target.value);
          }}
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => {
            setFocused(false);
            setStr(value === null ? "" : String(value));
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onChange(displayNumber + 1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              onChange(displayNumber - 1);
            }
          }}
          aria-label="Corner radius (pixels)"
          className="flex-1 min-w-0 bg-transparent text-[12px] text-ink-100 tabular-nums outline-none placeholder:text-ink-600"
        />
        <span className="text-[10px] text-ink-500 select-none">px</span>
      </div>
      <input
        type="range"
        min={0}
        max={BORDER_RADIUS_MAX}
        step={1}
        value={displayNumber}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Corner radius slider"
        className="flex-1 accent-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 rounded"
      />
    </div>
  );
}

// Helper — compose a hex+alpha string for the ColorSwatchButton preview.
function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  const ah = a.toString(16).padStart(2, "0");
  return `#${m[1]}${ah}`;
}

// Live preview of the border configured in the popover. Renders a mini sheet
// at the true aspect ratio with the border drawn via CSS so style/weight/
// color/radius all show realistically. The preview has its own padded gutter
// so the border (and its offset) never bumps the outer container — useful
// when the user picks a large weight or large distance.
function BorderPreview({
  sheet,
  draft,
}: {
  sheet: Sheet;
  draft: BorderDraft;
}) {
  const PREVIEW_MAX_W = 200;
  const PREVIEW_MAX_H = 110;
  const aspect = sheet.width / sheet.height;
  const previewW =
    aspect >= PREVIEW_MAX_W / PREVIEW_MAX_H
      ? PREVIEW_MAX_W
      : Math.round(PREVIEW_MAX_H * aspect);
  const previewH =
    aspect >= PREVIEW_MAX_W / PREVIEW_MAX_H
      ? Math.round(PREVIEW_MAX_W / aspect)
      : PREVIEW_MAX_H;

  // Scale the user's px values down to the preview so the visual ratio is
  // believable. Using the smaller scale keeps the offset/weight from
  // disappearing on portrait sheets.
  const scale = Math.min(previewW / sheet.width, previewH / sheet.height);
  const scaledOffset = (v: number) => Math.max(0, v * scale);
  // Visual minimums so a 1px border + 0px offset still reads at preview size.
  const visualWeight = Math.max(0.6, draft.weight * scale);
  const visualRadius = Math.max(0, draft.radius.tl * scale);

  const colorWithAlpha = hexWithAlpha(draft.color, draft.opacity);
  // CSS double needs >= 3px to render properly; below that, fall back to
  // solid so the preview doesn't go blank.
  const cssStyle: BorderDraft["style"] | "solid" =
    draft.style === "double" && visualWeight < 3 ? "solid" : draft.style;

  const sides = draft.sides;
  const baseBg = sheet.background?.slice(0, 7) || "#ffffff";

  return (
    <div className="shrink-0 flex justify-center">
      <div
        className="relative rounded-sm"
        style={{
          width: previewW,
          height: previewH,
          background: baseBg,
          boxShadow: "inset 0 0 0 1px rgba(100,116,139,0.35)",
        }}
        aria-hidden
      >
        {/* The border layer — sits inside the sheet rect, inset by the
             scaled offsets, with per-side widths driven by `sides`. */}
        <div
          className="absolute"
          style={{
            top: scaledOffset(draft.offsets.top),
            right: scaledOffset(draft.offsets.right),
            bottom: scaledOffset(draft.offsets.bottom),
            left: scaledOffset(draft.offsets.left),
            borderTopWidth: sides.top ? visualWeight : 0,
            borderRightWidth: sides.right ? visualWeight : 0,
            borderBottomWidth: sides.bottom ? visualWeight : 0,
            borderLeftWidth: sides.left ? visualWeight : 0,
            borderStyle: cssStyle,
            borderColor: colorWithAlpha,
            borderRadius: visualRadius,
            boxSizing: "border-box",
          }}
        />
      </div>
    </div>
  );
}

// Custom inset icon — concentric squares cue distance from edge.
function InsetIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect
        x="1.25"
        y="1.25"
        width="11.5"
        height="11.5"
        stroke="currentColor"
        strokeWidth="1.25"
        rx="1"
      />
      <rect
        x="4.25"
        y="4.25"
        width="5.5"
        height="5.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="1.5 1"
        rx="0.5"
      />
    </svg>
  );
}

// Distance from edge — a single uniform inset that drives all four sides.
// Same UX as RadiusInput (numeric input + drag slider) so the controls feel
// like a family.
function DistanceInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  const displayNumber = value ?? 0;
  const [str, setStr] = useState(value === null ? "" : String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focused) setStr(value === null ? "" : String(value));
  }, [value, focused]);

  function commit(raw: string) {
    if (raw.trim() === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onChange(n);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center h-8 rounded-md bg-ink-900 border border-ink-700 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-400/30 px-2 w-[96px] shrink-0 transition-colors">
        <InsetIcon className="text-ink-400 shrink-0 mr-1.5" />
        <input
          type="text"
          inputMode="numeric"
          value={str}
          placeholder={value === null ? "Mixed" : ""}
          onChange={(e) => {
            setStr(e.target.value);
            commit(e.target.value);
          }}
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => {
            setFocused(false);
            setStr(value === null ? "" : String(value));
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onChange(displayNumber + 1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              onChange(displayNumber - 1);
            }
          }}
          aria-label="Distance from edge (pixels)"
          className="flex-1 min-w-0 bg-transparent text-[12px] text-ink-100 tabular-nums outline-none placeholder:text-ink-600"
        />
        <span className="text-[10px] text-ink-500 select-none">px</span>
      </div>
      <input
        type="range"
        min={0}
        max={BORDER_OFFSET_MAX}
        step={1}
        value={displayNumber}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Distance from edge slider"
        className="flex-1 accent-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 rounded"
      />
    </div>
  );
}

// ── Border color picker (dedicated) ─────────────────────────────────────────
// Spec: 8 preset swatches + manual HEX/RGB inputs + a visual palette.
// The palette is a 2D saturation × value square plus a hue slider,
// implemented entirely in-file (no dependency on the shape ColorPickerPanel).

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}
function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const hh = (h % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let rp = 0, gp = 0, bp = 0;
  if (hh >= 0 && hh < 1) { rp = c; gp = x; bp = 0; }
  else if (hh < 2) { rp = x; gp = c; bp = 0; }
  else if (hh < 3) { rp = 0; gp = c; bp = x; }
  else if (hh < 4) { rp = 0; gp = x; bp = c; }
  else if (hh < 5) { rp = x; gp = 0; bp = c; }
  else { rp = c; gp = 0; bp = x; }
  const m = v - c;
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}

function BorderColorPicker({
  value,
  onChange,
  opacity,
  onChangeOpacity,
}: {
  value: string;
  onChange: (hex: string) => void;
  /** Optional — when provided, an integrated alpha slider is rendered. */
  opacity?: number;
  onChangeOpacity?: (o: number) => void;
}) {
  const rgb = hexToRgb(value) ?? { r: 0, g: 0, b: 0 };
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  const hasAlpha = typeof opacity === "number" && !!onChangeOpacity;
  const alphaPct = hasAlpha ? Math.round(opacity * 100) : 100;

  // Hex / RGB text drafts — keep independent from the upstream value so the
  // user can type an intermediate state (e.g. "#1A" or "2") without the
  // field snapping back mid-edit.
  const [hexDraft, setHexDraft] = useState(value);
  const [rgbDraft, setRgbDraft] = useState({
    r: String(rgb.r),
    g: String(rgb.g),
    b: String(rgb.b),
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHexDraft(value);
    setRgbDraft({ r: String(rgb.r), g: String(rgb.g), b: String(rgb.b) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commitHex(raw: string) {
    const normalized = raw.startsWith("#") ? raw : `#${raw}`;
    const parsed = hexToRgb(normalized);
    if (parsed) onChange(rgbToHex(parsed.r, parsed.g, parsed.b));
  }
  function commitRgbField(field: "r" | "g" | "b", raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const next = {
      r: field === "r" ? Math.max(0, Math.min(255, Math.round(n))) : rgb.r,
      g: field === "g" ? Math.max(0, Math.min(255, Math.round(n))) : rgb.g,
      b: field === "b" ? Math.max(0, Math.min(255, Math.round(n))) : rgb.b,
    };
    onChange(rgbToHex(next.r, next.g, next.b));
  }

  // Palette drag handling — single handler works for both pointerdown and
  // pointermove (captured) so dragging updates continuously.
  const satRef = useRef<HTMLDivElement>(null);
  function handleSatPointer(e: React.PointerEvent<HTMLDivElement>) {
    const el = satRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const update = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const v = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      const nextRgb = hsvToRgb(hsv.h, s, v);
      onChange(rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b));
    };
    update(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => update(ev.clientX, ev.clientY);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  const hueColor = rgbToHex(
    hsvToRgb(hsv.h, 1, 1).r,
    hsvToRgb(hsv.h, 1, 1).g,
    hsvToRgb(hsv.h, 1, 1).b,
  );

  return (
    <div className="space-y-2">
      {/* Preset swatches — fixed 8-col grid so they never wrap awkwardly. */}
      <div className="grid grid-cols-8 gap-1.5 w-full">
        {BORDER_PRESETS.map((p) => {
          const selected = value.toUpperCase() === p.hex.toUpperCase();
          return (
            <button
              key={p.hex}
              type="button"
              onClick={() => onChange(p.hex)}
              title={`${p.name} — ${p.hex}`}
              className={`aspect-square w-full rounded-full border transition-transform ${
                selected
                  ? "ring-2 ring-brand-400 scale-110"
                  : "hover:scale-110"
              } ${p.hex === "#FFFFFF" ? "border-ink-500" : "border-ink-700"}`}
              style={{ background: p.hex }}
              aria-label={p.name}
              aria-pressed={selected}
            />
          );
        })}
      </div>

      {/* HEX row — preview swatch + HEX input on one line. */}
      <div className="flex items-center gap-1.5">
        <div
          className="w-7 h-7 rounded border border-ink-700 shrink-0"
          style={{ background: value }}
          aria-hidden
        />
        <div className="flex items-center bg-ink-900 border border-ink-700 rounded h-7 px-2 flex-1 min-w-0">
          <span className="text-[10px] text-ink-500 mr-1.5 shrink-0">HEX</span>
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={() => commitHex(hexDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitHex(hexDraft);
            }}
            spellCheck={false}
            className="flex-1 min-w-0 text-[11px] bg-transparent outline-none text-ink-100 uppercase tabular-nums"
            aria-label="Hex color"
          />
        </div>
      </div>

      {/* RGB row — dedicated row so three fields have room to breathe. */}
      <div className="flex items-center gap-1.5 bg-ink-900 border border-ink-700 rounded h-7 px-2">
        <span className="text-[10px] text-ink-500 shrink-0">RGB</span>
        {(["r", "g", "b"] as const).map((ch) => (
          <div key={ch} className="flex items-center gap-0.5 flex-1 min-w-0">
            <span className="text-[9px] text-ink-600 uppercase">{ch}</span>
            <input
              type="number"
              min={0}
              max={255}
              value={rgbDraft[ch]}
              onChange={(e) => {
                setRgbDraft((d) => ({ ...d, [ch]: e.target.value }));
                commitRgbField(ch, e.target.value);
              }}
              className="flex-1 min-w-0 text-[11px] text-center bg-transparent outline-none text-ink-100 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              aria-label={`${ch.toUpperCase()} channel`}
            />
          </div>
        ))}
      </div>

      {/* Palette: 2D sat/val square + hue slider */}
      <div className="space-y-1.5">
        <div
          ref={satRef}
          onPointerDown={handleSatPointer}
          className="relative h-24 rounded overflow-hidden cursor-crosshair select-none"
          style={{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
          }}
          aria-label="Saturation and value palette"
        >
          {/* Crosshair marker */}
          <div
            className="absolute w-3 h-3 rounded-full border-2 border-white pointer-events-none"
            style={{
              left: `calc(${hsv.s * 100}% - 6px)`,
              top: `calc(${(1 - hsv.v) * 100}% - 6px)`,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
            }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={Math.round(hsv.h)}
          onChange={(e) => {
            const nextRgb = hsvToRgb(Number(e.target.value), hsv.s, hsv.v);
            onChange(rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b));
          }}
          className="w-full h-3 rounded appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-ink-400"
          style={{
            background:
              "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
          }}
          aria-label="Hue"
        />
      </div>

      {/* Alpha / opacity row — rendered only when the parent wired the slider,
           so the picker stays reusable in contexts without transparency. */}
      {hasAlpha && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-ink-400">
            <span>Opacity</span>
            <span className="tabular-nums">{alphaPct}%</span>
          </div>
          <div
            className="relative h-3 rounded overflow-hidden"
            style={{
              backgroundImage:
                "conic-gradient(at 50% 50%, #6b7280 0 25%, #9ca3af 0 50%, #6b7280 0 75%, #9ca3af 0)",
              backgroundSize: "8px 8px",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to right, ${value}00, ${value}ff)`,
              }}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={alphaPct}
              onChange={(e) => onChangeOpacity!(Number(e.target.value) / 100)}
              className="absolute inset-0 w-full h-full appearance-none cursor-pointer bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-ink-400"
              aria-label="Opacity"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StyleGlyph({ style }: { style: LineStyle }) {
  const stroke = "#E5E7EB";
  const common = {
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
  };
  return (
    <svg width={40} height={14} viewBox="0 0 40 14">
      {style === "solid" && <line x1={4} y1={7} x2={36} y2={7} {...common} />}
      {style === "dashed" && (
        <line x1={4} y1={7} x2={36} y2={7} {...common} strokeDasharray="6 3" />
      )}
      {style === "dotted" && (
        <line x1={4} y1={7} x2={36} y2={7} {...common} strokeDasharray="1 3" />
      )}
      {style === "double" && (
        <>
          {/* Outer = thicker */}
          <line x1={4} y1={4} x2={36} y2={4} {...common} strokeWidth={2.5} />
          {/* Inner = thinner */}
          <line x1={4} y1={10} x2={36} y2={10} {...common} strokeWidth={1} />
        </>
      )}
    </svg>
  );
}

function MorePopover({
  sheet,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onRename,
  onExport,
}: {
  sheet: Sheet;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onExport: (format: "png" | "jpeg" | "pdf" | "svg") => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(sheet.name);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="space-y-1 min-w-[200px]">
      {renaming ? (
        <div className="flex items-center gap-1 mb-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(draft);
                setRenaming(false);
              }
              if (e.key === "Escape") setRenaming(false);
            }}
            className="flex-1 h-7 px-2 text-xs rounded bg-ink-700 border border-ink-700 outline-none focus:border-brand-600 text-ink-100"
          />
          <button
            className="pill-btn pill-btn-accent h-7 px-2 text-xs"
            onClick={() => {
              onRename(draft);
              setRenaming(false);
            }}
          >
            Save
          </button>
        </div>
      ) : (
        <MoreRow
          icon={<Pencil size={13} />}
          label="Rename sheet"
          onClick={() => {
            setDraft(sheet.name);
            setRenaming(true);
          }}
        />
      )}
      <MoreRow icon={<Copy size={13} />} label="Copy" onClick={onCopy} />
      <MoreRow
        icon={<ClipboardPaste size={13} />}
        label="Paste"
        onClick={onPaste}
      />
      <MoreRow
        icon={<CopyPlus size={13} />}
        label="Duplicate"
        onClick={onDuplicate}
      />
      <div className="my-1 h-px bg-ink-800" />
      <MoreRow
        icon={<Download size={13} />}
        label="Export"
        chevron
        onClick={() => setExportOpen((v) => !v)}
      />
      {exportOpen && (
        <div className="ml-5 space-y-0.5">
          <MoreRow icon={<Square size={11} />} label="PNG" onClick={() => onExport("png")} small />
          <MoreRow icon={<Square size={11} />} label="JPEG" onClick={() => onExport("jpeg")} small />
          <MoreRow icon={<Square size={11} />} label="PDF" onClick={() => onExport("pdf")} small />
          <MoreRow icon={<Square size={11} />} label="SVG" onClick={() => onExport("svg")} small />
        </div>
      )}
      <div className="my-1 h-px bg-ink-800" />
      <MoreRow
        icon={<Trash2 size={13} />}
        label="Delete sheet"
        danger
        onClick={onDelete}
      />
    </div>
  );
}

function MoreRow({
  icon,
  label,
  onClick,
  danger,
  small,
  chevron,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  small?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 ${
        small ? "h-6 text-[11px]" : "h-8 text-xs"
      } rounded hover:bg-ink-700 transition-colors ${
        danger ? "text-rose-400" : "text-ink-100"
      }`}
    >
      <span className={danger ? "text-rose-400" : "text-ink-400"}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {chevron && <ChevronDown size={11} className="text-ink-400" />}
    </button>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${
        checked ? "bg-brand-600" : "bg-ink-700"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Tool-specific options bar ────────────────────────────────────────────────

const TOOL_META: Record<
  string,
  { icon: React.ReactNode; label: string }
> = {
  select: { icon: <MousePointer2 size={13} />, label: "Select" },
  pen: { icon: <Pen size={13} />, label: "Pen" },
  eraser: { icon: <Eraser size={13} />, label: "Eraser" },
  rect: { icon: <Square size={13} />, label: "Rectangle" },
  line: { icon: <Minus size={13} />, label: "Line" },
  sticky: { icon: <StickyNote size={13} />, label: "Sticky note" },
  text: { icon: <Type size={13} />, label: "Text" },
  upload: { icon: <Upload size={13} />, label: "Upload" },
};

// Fixed pen-variant palettes. Each entry's `name` is surfaced as a hover
// tooltip on the swatch. First entry in each array is the variant default
// (see store.ts `penVariants`).
const PEN_PALETTE: { hex: string; name: string }[] = [
  { hex: "#1A73E8", name: "Blue" },
  { hex: "#202124", name: "Black (Charcoal)" },
  { hex: "#D32F2F", name: "Red" },
  { hex: "#0F9D58", name: "Green" },
  { hex: "#8E24AA", name: "Purple" },
  { hex: "#F29900", name: "Orange" },
  { hex: "#5F6368", name: "Grey (Pencil)" },
  { hex: "#E91E63", name: "Magenta" },
];

const MARKER_PALETTE: { hex: string; name: string }[] = [
  { hex: "#D32F2F", name: "Red" },
  { hex: "#1976D2", name: "Strong Blue" },
  { hex: "#388E3C", name: "Bold Green" },
  { hex: "#F57C00", name: "Safety Orange" },
  { hex: "#212121", name: "Solid Black" },
  { hex: "#FFFFFF", name: "Pure White" },
  { hex: "#7B1FA2", name: "Deep Purple" },
  { hex: "#0097A7", name: "Cyan / Teal" },
];

const HIGHLIGHTER_PALETTE: { hex: string; name: string }[] = [
  { hex: "#FFEB3B", name: "Neon Yellow" },
  { hex: "#69F0AE", name: "Mint Green" },
  { hex: "#18FFFF", name: "Cyan / Aqua" },
  { hex: "#FF4081", name: "Hot Pink" },
  { hex: "#FFAB40", name: "Bright Orange" },
  { hex: "#E040FB", name: "Lavender" },
  { hex: "#FF5252", name: "Coral Red" },
  { hex: "#CFD8DC", name: "Light Grey" },
];

// Factory defaults per variant. `Restore` rewrites to these. Matches the
// initial values in store.ts `penVariants`.
const PEN_VARIANT_DEFAULTS: Record<PenVariant, { color: string; opacity: number }> = {
  pen: { color: "#1A73E8", opacity: 1.0 },
  marker: { color: "#D32F2F", opacity: 1.0 },
  highlighter: { color: "#FFEB3B", opacity: 0.6 },
};

function PenPaletteGrid({
  value,
  palette,
  onChange,
}: {
  value: string;
  palette: { hex: string; name: string }[];
  onChange: (hex: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-1.5 w-full">
      {palette.map((p) => {
        const selected = value.toUpperCase() === p.hex.toUpperCase();
        const needsLightBorder =
          p.hex.toUpperCase() === "#FFFFFF" || p.hex.toUpperCase() === "#CFD8DC";
        return (
          <button
            key={p.hex}
            type="button"
            onClick={() => onChange(p.hex)}
            title={p.name}
            className={`aspect-square w-full rounded-full border transition-transform ${
              selected
                ? "ring-2 ring-brand-400 scale-110"
                : "hover:scale-110"
            } ${needsLightBorder ? "border-ink-500" : "border-ink-700"}`}
            style={{ background: p.hex }}
            aria-label={p.name}
            aria-pressed={selected}
          />
        );
      })}
    </div>
  );
}

// Full pen-variant color popover. Mirrors SheetBackgroundPopover's pattern:
// writes live to the store (so the canvas previews the change) and snapshots
// a baseline on mount so Cancel/unmount can roll back. Apply re-snapshots
// (and disables the three action buttons until the next edit).
function PenColorPopover({ variant }: { variant: PenVariant }) {
  const color = useStore((s) => s.penVariants[variant].color);
  const opacity = useStore((s) => s.penVariants[variant].opacity);
  const setPenVariantColor = useStore((s) => s.setPenVariantColor);
  const setPenVariantOpacity = useStore((s) => s.setPenVariantOpacity);

  const palette =
    variant === "marker"
      ? MARKER_PALETTE
      : variant === "highlighter"
      ? HIGHLIGHTER_PALETTE
      : PEN_PALETTE;
  const variantLabel =
    variant === "marker" ? "Marker" : variant === "highlighter" ? "Highlighter" : "Pen";

  const [baseline, setBaseline] = useState<{ color: string; opacity: number }>({
    color,
    opacity,
  });
  const dirty =
    color.toUpperCase() !== baseline.color.toUpperCase() || opacity !== baseline.opacity;

  // Refs so the unmount cleanup always sees current values. Mirrors the
  // SheetBackgroundPopover pattern — prevents stale closure while avoiding
  // re-registering the cleanup effect on every value change.
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;
  const latestRef = useRef({ color, opacity });
  latestRef.current = { color, opacity };
  const setColorRef = useRef(setPenVariantColor);
  setColorRef.current = setPenVariantColor;
  const setOpacityRef = useRef(setPenVariantOpacity);
  setOpacityRef.current = setPenVariantOpacity;
  const appliedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (appliedRef.current) return;
      const { color: bc, opacity: bo } = baselineRef.current;
      const { color: cc, opacity: co } = latestRef.current;
      if (cc.toUpperCase() !== bc.toUpperCase()) setColorRef.current(variant, bc);
      if (co !== bo) setOpacityRef.current(variant, bo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApply() {
    appliedRef.current = true;
    setBaseline({ color, opacity });
    setTimeout(() => {
      appliedRef.current = false;
    }, 0);
  }
  function handleCancel() {
    setPenVariantColor(variant, baseline.color);
    setPenVariantOpacity(variant, baseline.opacity);
  }
  function handleRestore() {
    const d = PEN_VARIANT_DEFAULTS[variant];
    setPenVariantColor(variant, d.color);
    setPenVariantOpacity(variant, d.opacity);
  }

  const [r, g, b] = hexToRgbTuple(color);
  const currentHsv = rgbToHsv(r, g, b);

  // Hue state is independent — at pure grays HSV hue collapses to 0, which
  // would snap the slider. Keep the last non-gray hue.
  const [hue, setHue] = useState<number>(currentHsv.h);
  useEffect(() => {
    if (currentHsv.s > 0.001) setHue(currentHsv.h);
  }, [currentHsv.h, currentHsv.s]);

  function applyHsv(h: number, s: number, v: number) {
    const { r: r2, g: g2, b: b2 } = hsvToRgb(h, s, v);
    setPenVariantColor(variant, rgbTupleToHex(r2, g2, b2));
  }
  function applyAlpha(a01: number) {
    setPenVariantOpacity(variant, Math.max(0, Math.min(1, a01)));
  }
  function applyHex(raw: string) {
    const v = raw.trim();
    const normalised = v.startsWith("#") ? v : `#${v}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(normalised)) return;
    setPenVariantColor(variant, normalised.toUpperCase());
  }
  function applyRgb(ch: "r" | "g" | "b", value: number) {
    if (!Number.isFinite(value)) return;
    const next: [number, number, number] =
      ch === "r" ? [value, g, b] : ch === "g" ? [r, value, b] : [r, g, value];
    setPenVariantColor(variant, rgbTupleToHex(next[0], next[1], next[2]));
  }

  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<HTMLDivElement>(null);

  function pctFromX(ref: React.RefObject<HTMLElement>, clientX: number) {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }
  function updateFromSv(cx: number, cy: number) {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (cy - rect.top) / rect.height));
    applyHsv(hue, s, v);
  }
  function updateFromHue(cx: number) {
    const pct = pctFromX(hueRef, cx);
    const nextHue = pct * 360;
    setHue(nextHue);
    applyHsv(nextHue, currentHsv.s, currentHsv.v);
  }
  function updateFromAlpha(cx: number) {
    applyAlpha(pctFromX(alphaRef, cx));
  }
  function dragBind(update: (x: number, y: number) => void) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if ((e.buttons & 1) !== 1) return;
        update(e.clientX, e.clientY);
      },
      onPointerUp: (e: React.PointerEvent) => {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* pointer already released */
        }
      },
    };
  }

  const [hexDraft, setHexDraft] = useState<string>(color);
  useEffect(() => {
    setHexDraft(color);
  }, [color]);

  const selectedPaletteEntry = palette.find(
    (p) => p.hex.toUpperCase() === color.toUpperCase(),
  );
  const displayName = selectedPaletteEntry ? selectedPaletteEntry.name : "Custom";
  const alphaPct = Math.round(opacity * 100);

  return (
    <div className="flex flex-col w-full">
      <div className="flex items-center justify-between shrink-0 mb-2">
        <div className="text-xs font-medium text-ink-200">{variantLabel} colour</div>
      </div>

      <PenPaletteGrid
        value={color}
        palette={palette}
        onChange={(c) => setPenVariantColor(variant, c)}
      />

      <div className="mt-1.5 flex items-center justify-between text-[10px] min-h-[14px]">
        <span className="truncate text-ink-200">{displayName}</span>
        <span className="text-ink-500 font-mono tabular-nums">{color.toUpperCase()}</span>
      </div>

      <div className="border-t border-ink-700 my-2" />

      <div
        ref={svRef}
        role="slider"
        aria-label="Saturation and brightness"
        className="relative w-full h-[88px] rounded-md overflow-hidden cursor-crosshair select-none touch-none"
        style={{
          backgroundColor: `hsl(${hue}, 100%, 50%)`,
          backgroundImage:
            "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
        }}
        {...dragBind(updateFromSv)}
      >
        <div
          className="absolute w-3 h-3 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${currentHsv.s * 100}%`,
            top: `${(1 - currentHsv.v) * 100}%`,
            background: color,
          }}
        />
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <div
          ref={hueRef}
          role="slider"
          aria-label="Hue"
          aria-valuenow={Math.round(hue)}
          aria-valuemin={0}
          aria-valuemax={360}
          className="relative flex-1 h-2.5 rounded-full cursor-pointer select-none touch-none"
          style={{
            background:
              "linear-gradient(to right, #ff0000 0%, #ffff00 16.66%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.66%, #ff00ff 83.33%, #ff0000 100%)",
          }}
          {...dragBind((x) => updateFromHue(x))}
        >
          <div
            className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none"
            style={{
              left: `${(hue / 360) * 100}%`,
              background: `hsl(${hue}, 100%, 50%)`,
            }}
          />
        </div>
        <span className="text-[10px] text-ink-400 tabular-nums min-w-[28px] text-right">
          {Math.round(hue)}°
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <div
          ref={alphaRef}
          role="slider"
          aria-label="Opacity"
          aria-valuenow={alphaPct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="relative flex-1 h-2.5 rounded-full cursor-pointer select-none touch-none"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(${r},${g},${b},0), rgba(${r},${g},${b},1)), ${CHECKER_BG_URL}`,
            backgroundSize: "100% 100%, 10px 10px",
          }}
          {...dragBind((x) => updateFromAlpha(x))}
        >
          <div
            className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none"
            style={{
              left: `${opacity * 100}%`,
              background: color,
            }}
          />
        </div>
        <span className="text-[10px] text-ink-400 tabular-nums min-w-[28px] text-right">
          {alphaPct}%
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <div
          className="w-7 h-7 rounded border border-ink-700 shrink-0"
          style={{ background: color, opacity }}
          aria-label="Preview swatch"
        />
        <div className="flex-1 flex items-center gap-1">
          <span className="text-[10px] text-ink-500 shrink-0">HEX</span>
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={(e) => applyHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="flex-1 min-w-0 h-7 px-1.5 text-[11px] rounded bg-ink-900 border border-ink-700 outline-none focus:border-brand-600 text-ink-100 font-mono"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {(["r", "g", "b"] as const).map((ch, idx) => {
          const v = [r, g, b][idx];
          return (
            <div key={ch} className="flex items-center gap-1">
              <span className="text-[10px] text-ink-500 uppercase shrink-0">{ch}</span>
              <input
                type="number"
                min={0}
                max={255}
                value={v}
                onChange={(e) => applyRgb(ch, Number(e.target.value))}
                className="w-full min-w-0 h-6 px-1 text-[11px] rounded bg-ink-900 border border-ink-700 outline-none focus:border-brand-600 text-ink-100 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                aria-label={`${ch.toUpperCase()} channel`}
              />
            </div>
          );
        })}
      </div>

      {/* Cancel / Restore / Apply — enabled only when the current color or
          opacity differs from the baseline captured on open. */}
      <div className="mt-3 pt-2 border-t border-ink-700 flex items-center gap-1">
        <button
          type="button"
          onClick={handleCancel}
          disabled={!dirty}
          className="flex-1 h-7 rounded text-[11px] font-medium bg-ink-800 text-ink-200 hover:bg-ink-700 disabled:bg-ink-900 disabled:text-ink-600 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleRestore}
          disabled={!dirty}
          className="flex-1 h-7 rounded text-[11px] font-medium bg-ink-800 text-ink-200 hover:bg-ink-700 disabled:bg-ink-900 disabled:text-ink-600 disabled:cursor-not-allowed transition-colors"
        >
          Restore
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!dirty}
          className="flex-1 h-7 rounded text-[11px] font-medium bg-brand-500 text-white hover:bg-brand-400 disabled:bg-ink-800 disabled:text-ink-600 disabled:cursor-not-allowed transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function ToolOptionsBar() {
  const tool = useStore((s) => s.tool);
  const toolColors = useStore((s) => s.toolColors);
  const setToolColor = useStore((s) => s.setToolColor);
  const strokeWidth = useStore((s) => s.toolStrokeWidth);
  const setStrokeWidth = useStore((s) => s.setToolStrokeWidth);
  const fontSize = useStore((s) => s.toolFontSize);
  const setFontSize = useStore((s) => s.setToolFontSize);
  const eraserSize = useStore((s) => s.eraserSize);
  const setEraserSize = useStore((s) => s.setEraserSize);
  const eraserVariant = useStore((s) => s.eraserVariant);
  const setEraserVariant = useStore((s) => s.setEraserVariant);
  const penVariant = useStore((s) => s.penVariant);
  const penVariants = useStore((s) => s.penVariants);
  const setPenVariant = useStore((s) => s.setPenVariant);
  const setPenVariantColor = useStore((s) => s.setPenVariantColor);
  const setPenVariantWeight = useStore((s) => s.setPenVariantWeight);
  const setPenVariantOpacity = useStore((s) => s.setPenVariantOpacity);

  const [open, setOpen] = useState<null | "color" | "variant" | "eraserVariant">(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onMd(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    }
    if (open) document.addEventListener("mousedown", onMd);
    return () => document.removeEventListener("mousedown", onMd);
  }, [open]);

  const isPen = tool === "pen";
  const isEraser = tool === "eraser";
  const penLabel =
    penVariant === "marker"
      ? "Marker"
      : penVariant === "highlighter"
      ? "Highlighter"
      : "Pen";
  const eraserLabel = eraserVariant === "object" ? "Object Eraser" : "Eraser";
  const penSettings = penVariants[penVariant];
  const meta = isPen
    ? { icon: TOOL_META.pen.icon, label: penLabel }
    : isEraser
    ? { icon: TOOL_META.eraser.icon, label: eraserLabel }
    : TOOL_META[tool];
  const colorTools = ["pen", "rect", "line", "sticky", "text"];
  const showColor = colorTools.includes(tool);
  const showStroke = tool === "line";
  const showPenWeight = isPen;
  const showTransparency = isPen;
  const showFont = tool === "text";
  const showEraser = isEraser && eraserVariant === "stroke";
  const colorKey = tool;
  const colorVal = isPen
    ? penSettings.color
    : toolColors[colorKey] || "#2c2a27";

  return (
    <div
      ref={rootRef}
      className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 panel rounded-full shadow-2xl"
      style={{
        top: RULER_SIZE + 8,
        height: TOOLBAR_HEIGHT,
        background: "var(--bg-secondary)",
      }}
    >
      {isPen ? (
        <button
          onClick={() => setOpen(open === "variant" ? null : "variant")}
          title="Pen type"
          className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] transition-colors ${
            open === "variant" ? "row-active" : "hover:bg-ink-700 text-ink-200"
          }`}
        >
          <span className="text-ink-400">
            {penVariant === "marker" ? (
              <Brush size={13} />
            ) : penVariant === "highlighter" ? (
              <Highlighter size={13} />
            ) : (
              <Pen size={13} />
            )}
          </span>
          <span className="font-medium">{penLabel}</span>
          <ChevronDown size={11} />
        </button>
      ) : isEraser ? (
        <button
          onClick={() => setOpen(open === "eraserVariant" ? null : "eraserVariant")}
          title="Eraser type"
          className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] transition-colors ${
            open === "eraserVariant" ? "row-active" : "hover:bg-ink-700 text-ink-200"
          }`}
        >
          <span className="text-ink-400">
            {eraserVariant === "object" ? (
              <Crosshair size={13} />
            ) : (
              <Eraser size={13} />
            )}
          </span>
          <span className="font-medium">{eraserLabel}</span>
          <ChevronDown size={11} />
        </button>
      ) : (
        <div className="flex items-center gap-1.5 text-[11px] text-ink-200 whitespace-nowrap">
          <span className="text-ink-400">{meta?.icon}</span>
          <span className="font-medium">{meta?.label}</span>
        </div>
      )}

      {(showColor || showStroke || showPenWeight || showTransparency || showFont || showEraser) && (
        <div className="w-px h-5 bg-ink-700" />
      )}

      {showColor && (
        <button
          onClick={() => setOpen(open === "color" ? null : "color")}
          title="Color"
          className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors ${
            open === "color" ? "row-active" : "hover:bg-ink-700 text-ink-200"
          }`}
        >
          <Palette size={13} />
          <span
            className="inline-block w-3.5 h-3.5 rounded ring-1 ring-ink-700"
            style={{ background: colorVal }}
          />
          <ChevronDown size={11} />
        </button>
      )}

      {showStroke && (
        <div
          className="flex items-center gap-1.5"
          title="Stroke width in canvas pixels — scales with zoom."
        >
          <span className="text-[10px] uppercase tracking-wider text-ink-400">
            Stroke
          </span>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="w-24 accent-brand-500"
          />
          <span className="text-[11px] text-ink-200 tabular-nums text-right whitespace-nowrap">
            {`${strokeWidth}px @100%`}
          </span>
        </div>
      )}

      {showPenWeight && (
        <div
          className="flex items-center gap-1.5"
          title="Pen weight in canvas pixels — scales with zoom."
        >
          <span className="text-[10px] uppercase tracking-wider text-ink-400">
            Weight
          </span>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={penSettings.weight}
            onChange={(e) =>
              setPenVariantWeight(penVariant, Number(e.target.value))
            }
            className="w-24 accent-brand-500"
          />
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={penSettings.weight}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) {
                setPenVariantWeight(penVariant, Math.max(1, Math.min(100, Math.round(n))));
              }
            }}
            className="w-12 h-6 px-1.5 text-[11px] rounded bg-ink-700 border border-ink-700 outline-none focus:border-brand-600 text-ink-100 tabular-nums"
          />
          <span className="text-[11px] text-ink-400 whitespace-nowrap">{"px @100%"}</span>
        </div>
      )}

      {showTransparency && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-ink-400">
            Transparency
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round((1 - penSettings.opacity) * 100)}
            onChange={(e) =>
              setPenVariantOpacity(penVariant, 1 - Number(e.target.value) / 100)
            }
            className="w-24 accent-brand-500"
          />
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={Math.round((1 - penSettings.opacity) * 100)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) {
                const pct = Math.max(0, Math.min(100, Math.round(n)));
                setPenVariantOpacity(penVariant, 1 - pct / 100);
              }
            }}
            className="w-12 h-6 px-1.5 text-[11px] rounded bg-ink-700 border border-ink-700 outline-none focus:border-brand-600 text-ink-100 tabular-nums"
          />
          <span className="text-[11px] text-ink-400">%</span>
        </div>
      )}

      {showFont && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-ink-400">
            Size
          </span>
          <input
            type="number"
            min={8}
            max={200}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-14 h-6 px-1.5 text-xs rounded bg-ink-700 border border-ink-700 outline-none focus:border-brand-600 text-ink-100"
          />
          <span className="text-[11px] text-ink-400">px</span>
        </div>
      )}

      {showEraser && (
        <div
          className="flex items-center gap-1.5"
          title="Eraser size in canvas pixels — scales with zoom."
        >
          <span className="text-[10px] uppercase tracking-wider text-ink-400">
            Size
          </span>
          <input
            type="range"
            min={2}
            max={400}
            step={2}
            value={eraserSize}
            onChange={(e) => setEraserSize(Number(e.target.value))}
            className="w-24 accent-brand-500"
          />
          <span className="text-[11px] text-ink-200 tabular-nums text-right whitespace-nowrap">
            {`${eraserSize}px @100%`}
          </span>
        </div>
      )}

      {tool === "upload" && (
        <span className="text-[11px] text-ink-400">
          Click the upload button to choose an image
        </span>
      )}

      {open === "variant" && isPen && (
        <div
          role="menu"
          aria-label="Pen type"
          className="absolute top-full mt-2 left-0 z-30 panel rounded-md shadow-2xl py-1.5 px-1 w-40"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(["pen", "marker", "highlighter"] as PenVariant[]).map((v) => {
            const s = penVariants[v];
            const current = v === penVariant;
            const label = v === "pen" ? "Pen" : v === "marker" ? "Marker" : "Highlighter";
            const icon =
              v === "marker" ? <Brush size={13} /> : v === "highlighter" ? <Highlighter size={13} /> : <Pen size={13} />;
            return (
              <button
                key={v}
                role="menuitem"
                aria-current={current}
                onClick={() => {
                  setPenVariant(v);
                  setOpen(null);
                }}
                className={`w-full flex items-center gap-2 h-8 px-2 rounded text-xs text-left transition-colors ${
                  current ? "row-active text-ink-100" : "hover:bg-ink-700 text-ink-200"
                }`}
              >
                <span className="text-ink-300">{icon}</span>
                <span className="flex-1">{label}</span>
                <span
                  className="inline-block w-3 h-3 rounded-full ring-1 ring-ink-700"
                  style={{ background: s.color, opacity: s.opacity }}
                />
              </button>
            );
          })}
        </div>
      )}

      {open === "eraserVariant" && isEraser && (
        <div
          role="menu"
          aria-label="Eraser type"
          className="absolute top-full mt-2 left-0 z-30 panel rounded-md shadow-2xl py-1.5 px-1 w-44"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {([
            { id: "stroke" as const, label: "Eraser", icon: <Eraser size={13} /> },
            { id: "object" as const, label: "Object Eraser", icon: <Crosshair size={13} /> },
          ]).map((v) => {
            const current = v.id === eraserVariant;
            return (
              <button
                key={v.id}
                role="menuitem"
                aria-current={current}
                onClick={() => {
                  setEraserVariant(v.id);
                  setOpen(null);
                }}
                className={`w-full flex items-center gap-2 h-8 px-2 rounded text-xs text-left transition-colors ${
                  current ? "row-active text-ink-100" : "hover:bg-ink-700 text-ink-200"
                }`}
              >
                <span className="text-ink-300">{v.icon}</span>
                <span className="flex-1">{v.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {open === "color" && showColor && (
        <div
          className="absolute top-full mt-2 left-0 z-30 panel rounded-md shadow-2xl p-3 w-64"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {isPen ? (
            <PenColorPopover variant={penVariant} />
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
                {meta?.label} colour
              </div>
              <ColorPickerPanel
                value={colorVal}
                onChange={(c) => setToolColor(colorKey, c)}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

type PopoverKey =
  | "fill"
  | "border"
  | "borderColor"
  | "borderStyle"
  | "corners"
  | "size"
  | "rotation"
  | "polygon";

function ShapeOptionsBar() {
  const shape = useStore((s) => {
    const id = s.selectedShapeId;
    if (!id) return null;
    const sh = s.shapes.find((x) => x.id === id);
    return sh && sh.type === "shape" ? (sh as ShapeShape) : null;
  });
  const updateShape = useStore((s) => s.updateShape);
  const groupSelected = useStore((s) => s.groupSelected);
  const ungroupSelected = useStore((s) => s.ungroupSelected);
  const selectedShapeIds = useStore((s) => s.selectedShapeIds);

  const [open, setOpen] = useState<PopoverKey | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onMd(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    }
    if (open) document.addEventListener("mousedown", onMd);
    return () => document.removeEventListener("mousedown", onMd);
  }, [open]);

  if (!shape) return null;

  const style = shape.style;
  const isRect = shape.kind === "rectangle";
  const isPolygon = shape.kind === "polygon";
  const sides = shape.polygonSides ?? 5;
  // A group exists if 2+ are selected; ungroup applies if any selected has groupId.
  const canGroup = selectedShapeIds.length >= 2;
  const hasGroup = useStore.getState().shapes.some(
    (sh) => selectedShapeIds.includes(sh.id) && sh.groupId
  );

  function patchStyle(p: Partial<typeof style>) {
    if (!shape) return;
    updateShape(shape.id, { style: { ...style, ...p } } as Partial<Shape>);
  }

  function pickImage() {
    window.dispatchEvent(
      new CustomEvent("spaceshow:image-fill", { detail: { id: shape!.id } })
    );
  }

  return (
    <div
      ref={rootRef}
      className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 panel rounded-full shadow-2xl"
      style={{
        top: RULER_SIZE + 8,
        height: TOOLBAR_HEIGHT,
        background: "var(--bg-secondary)",
      }}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-ink-200 whitespace-nowrap">
        <span className="text-ink-400">
          <Square size={13} />
        </span>
        <span className="font-medium">{capitalize(shape.kind)}</span>
      </div>

      <Divider />

      {/* Fill */}
      <button
        onClick={() => setOpen(open === "fill" ? null : "fill")}
        title="Fill"
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors ${
          open === "fill" ? "row-active" : "hover:bg-ink-700 text-ink-200"
        }`}
      >
        <Palette size={13} />
        <span
          className="inline-block w-3.5 h-3.5 rounded ring-1 ring-ink-700"
          style={{ background: style.fillColor, opacity: style.fillOpacity }}
        />
        <ChevronDown size={11} />
      </button>

      {/* Border */}
      <button
        onClick={() => setOpen(open === "border" ? null : "border")}
        title="Border"
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors ${
          open === "border" ? "row-active" : "hover:bg-ink-700 text-ink-200"
        }`}
      >
        <span className="text-ink-300">Border</span>
        <ChevronDown size={11} />
      </button>

      {/* Corner radius (rectangle only) */}
      <button
        disabled={!isRect}
        onClick={() => isRect && setOpen(open === "corners" ? null : "corners")}
        title={isRect ? "Corner radius" : "Corner radius (rectangle only)"}
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors ${
          !isRect
            ? "opacity-40 cursor-not-allowed text-ink-300"
            : open === "corners"
            ? "row-active"
            : "hover:bg-ink-700 text-ink-200"
        }`}
      >
        <span>Corners</span>
        <span className="tabular-nums">{Math.round(style.cornerRadius)}</span>
        <ChevronDown size={11} />
      </button>

      {/* Polygon sides */}
      {isPolygon && (
        <button
          onClick={() => setOpen(open === "polygon" ? null : "polygon")}
          title="Polygon sides"
          className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors ${
            open === "polygon" ? "row-active" : "hover:bg-ink-700 text-ink-200"
          }`}
        >
          <span>Sides</span>
          <span className="tabular-nums">{sides}</span>
          <ChevronDown size={11} />
        </button>
      )}

      <Divider />

      {/* Size + rotation */}
      <button
        onClick={() => setOpen(open === "size" ? null : "size")}
        title="Position & size"
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors ${
          open === "size" ? "row-active" : "hover:bg-ink-700 text-ink-200"
        }`}
      >
        <span className="tabular-nums">
          {Math.round(shape.width)}×{Math.round(shape.height)}
        </span>
        <ChevronDown size={11} />
      </button>

      <button
        onClick={() => setOpen(open === "rotation" ? null : "rotation")}
        title="Rotation"
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors ${
          open === "rotation" ? "row-active" : "hover:bg-ink-700 text-ink-200"
        }`}
      >
        <RotateCw size={12} />
        <span className="tabular-nums">{Math.round(shape.rotation ?? 0)}°</span>
      </button>

      {/* Image fill */}
      <button
        onClick={pickImage}
        title="Fill with image"
        className="flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors hover:bg-ink-700 text-ink-200"
      >
        <ImageIcon size={13} />
      </button>

      <Divider />

      {/* Group / Ungroup */}
      <button
        disabled={!canGroup}
        onClick={() => groupSelected()}
        title="Group (Ctrl/Cmd+G)"
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors ${
          canGroup ? "hover:bg-ink-700 text-ink-200" : "opacity-40 cursor-not-allowed text-ink-300"
        }`}
      >
        <GroupIcon size={13} />
      </button>
      <button
        disabled={!hasGroup}
        onClick={() => ungroupSelected()}
        title="Ungroup (Ctrl/Cmd+Shift+G)"
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors ${
          hasGroup ? "hover:bg-ink-700 text-ink-200" : "opacity-40 cursor-not-allowed text-ink-300"
        }`}
      >
        <Ungroup size={13} />
      </button>

      {/* Popovers */}
      {open === "fill" && (
        <div
          className="absolute top-full mt-2 left-0 z-30 panel rounded-md shadow-2xl p-3 w-64"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
            Fill colour
          </div>
          <ColorPickerPanel
            value={style.fillColor}
            onChange={(c) => patchStyle({ fillColor: c })}
          />
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-ink-400 w-16">
              Opacity
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(style.fillOpacity * 100)}
              onChange={(e) =>
                patchStyle({ fillOpacity: Number(e.target.value) / 100 })
              }
              className="flex-1 accent-brand-500"
            />
            <span className="text-[11px] text-ink-200 tabular-nums w-9 text-right">
              {Math.round(style.fillOpacity * 100)}%
            </span>
          </div>
        </div>
      )}

      {open === "border" && (
        <div
          className="absolute top-full mt-2 left-0 z-30 panel rounded-md shadow-2xl p-3 w-72"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-ink-400">
              Border
            </span>
            <Switch
              checked={style.borderEnabled}
              onChange={(b) => patchStyle({ borderEnabled: b })}
            />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-ink-400 w-16">
              Weight
            </span>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={style.borderWeight}
              onChange={(e) =>
                patchStyle({ borderWeight: Number(e.target.value) })
              }
              disabled={!style.borderEnabled}
              className="flex-1 accent-brand-500 disabled:opacity-50"
            />
            <span className="text-[11px] text-ink-200 tabular-nums w-7 text-right">
              {style.borderWeight}px
            </span>
          </div>
          <div className="mb-3">
            <span className="text-[10px] uppercase tracking-wider text-ink-400 block mb-1">
              Style
            </span>
            <div className="flex gap-1">
              {(["solid", "dashed", "dotted", "double"] as LineStyle[]).map(
                (st) => (
                  <button
                    key={st}
                    disabled={!style.borderEnabled}
                    onClick={() => patchStyle({ borderStyle: st })}
                    className={`flex-1 h-7 px-1 rounded grid place-items-center text-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      style.borderStyle === st
                        ? "row-active"
                        : "hover:bg-ink-700 text-ink-200"
                    }`}
                  >
                    <StyleGlyph style={st} />
                  </button>
                )
              )}
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">
            Colour
          </div>
          <ColorPickerPanel
            value={style.borderColor}
            onChange={(c) => patchStyle({ borderColor: c })}
          />
        </div>
      )}

      {open === "corners" && isRect && (
        <div
          className="absolute top-full mt-2 left-0 z-30 panel rounded-md shadow-2xl p-3 w-56"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
            Corner radius
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={Math.round(Math.min(shape.width, shape.height) / 2)}
              step={1}
              value={style.cornerRadius}
              onChange={(e) =>
                patchStyle({ cornerRadius: Number(e.target.value) })
              }
              className="flex-1 accent-brand-500"
            />
            <span className="text-[11px] text-ink-200 tabular-nums w-7 text-right">
              {Math.round(style.cornerRadius)}
            </span>
          </div>
        </div>
      )}

      {open === "polygon" && isPolygon && (
        <div
          className="absolute top-full mt-2 left-0 z-30 panel rounded-md shadow-2xl p-3 w-56"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
            Polygon sides
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={3}
              max={12}
              step={1}
              value={sides}
              onChange={(e) =>
                updateShape(shape.id, {
                  polygonSides: Number(e.target.value),
                } as Partial<Shape>)
              }
              className="flex-1 accent-brand-500"
            />
            <span className="text-[11px] text-ink-200 tabular-nums w-6 text-right">
              {sides}
            </span>
          </div>
        </div>
      )}

      {open === "size" && (
        <div
          className="absolute top-full mt-2 left-0 z-30 panel rounded-md shadow-2xl p-3 w-72"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
            Position &amp; size
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="X"
              value={Math.round(shape.x)}
              onChange={(n) => updateShape(shape.id, { x: n } as Partial<Shape>)}
            />
            <NumField
              label="Y"
              value={Math.round(shape.y)}
              onChange={(n) => updateShape(shape.id, { y: n } as Partial<Shape>)}
            />
            <NumField
              label="W"
              value={Math.round(shape.width)}
              min={3}
              onChange={(n) =>
                updateShape(shape.id, { width: Math.max(3, n) } as Partial<Shape>)
              }
            />
            <NumField
              label="H"
              value={Math.round(shape.height)}
              min={3}
              onChange={(n) =>
                updateShape(shape.id, { height: Math.max(3, n) } as Partial<Shape>)
              }
            />
          </div>
        </div>
      )}

      {open === "rotation" && (
        <div
          className="absolute top-full mt-2 left-0 z-30 panel rounded-md shadow-2xl p-3 w-56"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
            Rotation
          </div>
          <div className="flex items-center gap-2">
            <button
              className="h-7 px-2 rounded text-xs hover:bg-ink-700 text-ink-200"
              onClick={() =>
                updateShape(shape.id, {
                  rotation: ((shape.rotation ?? 0) - 15) % 360,
                } as Partial<Shape>)
              }
            >
              −15°
            </button>
            <NumField
              label=""
              value={Math.round(shape.rotation ?? 0)}
              onChange={(n) =>
                updateShape(shape.id, { rotation: n % 360 } as Partial<Shape>)
              }
            />
            <button
              className="h-7 px-2 rounded text-xs hover:bg-ink-700 text-ink-200"
              onClick={() =>
                updateShape(shape.id, {
                  rotation: ((shape.rotation ?? 0) + 15) % 360,
                } as Partial<Shape>)
              }
            >
              +15°
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      {label && (
        <span className="text-[10px] uppercase tracking-wider text-ink-400 w-4">
          {label}
        </span>
      )}
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(n);
        }}
        className="flex-1 h-7 px-1.5 text-xs rounded bg-ink-700 border border-ink-700 outline-none focus:border-brand-600 text-ink-100"
      />
    </label>
  );
}

// ── Sheet Background Popover ───────────────────────────────────────────────
//
// Dedicated palette for the sheet background. Separate from the general-purpose
// ColorPickerPanel so the architect presets (two sets of 8 curated light/dark
// pairs) are the first-class way to pick. Selecting a preset also updates the
// sheet border colour to the paired value. Manual HEX/RGB editing below the
// palette only touches the background. The transparency slider adjusts the
// background alpha — stored inline in the hex as #RRGGBBAA when < 100% opaque.

interface BgPreset {
  name: string;
  bg: string;
  border: string;
  vibe: string;
}

const BG_LIGHT_PRESETS: BgPreset[] = [
  {
    name: "Pure White",
    bg: "#FFFFFF",
    border: "#E5E7EB",
    vibe: "The standard. Best for exporting pure PDFs or placing high-res renders.",
  },
  {
    name: "Butter Paper",
    bg: "#FDFBF7",
    border: "#EAE4D3",
    vibe: "A warm off-white mimicking tracing paper. Reduces eye strain.",
  },
  {
    name: "Drafting Blue",
    bg: "#F0F4F8",
    border: "#D1E0ED",
    vibe: "A very faint, cool blue. A subtle nod to classic engineering blueprints.",
  },
  {
    name: "Light Concrete",
    bg: "#F4F4F5",
    border: "#D4D4D8",
    vibe: "A neutral gray. Excellent for colorful interior design mood boards.",
  },
  {
    name: "Kraft Board",
    bg: "#F3EFEA",
    border: "#DCD3C6",
    vibe: "Earthy and warm. Great for material and texture presentations.",
  },
  {
    name: "Pale Mint",
    bg: "#F0FDF4",
    border: "#BBF7D0",
    vibe: "Reminiscent of a cutting mat or grid paper. Very technical feel.",
  },
  {
    name: "Soft Slate",
    bg: "#F1F5F9",
    border: "#CBD5E1",
    vibe: "A professional, corporate blue-gray. Very clean for client presentations.",
  },
  {
    name: "Warm Sand",
    bg: "#FAFAF9",
    border: "#E7E5E4",
    vibe: "High-end and minimalist. Perfect for luxury architectural portfolios.",
  },
];

const BG_DARK_PRESETS: BgPreset[] = [
  {
    name: "Charcoal Gray",
    bg: "#1E1E1E",
    border: "#333333",
    vibe: "The gold standard dark mode. Easy on the eyes for prolonged viewing.",
  },
  {
    name: "Midnight Blue",
    bg: "#0F172A",
    border: "#1E293B",
    vibe: "A deep, rich architectural blue. Looks highly premium.",
  },
  {
    name: "Deep Concrete",
    bg: "#18181B",
    border: "#27272A",
    vibe: "A true, desaturated dark neutral. Lets colorful models pop.",
  },
  {
    name: "Warm Obsidian",
    bg: "#1C1917",
    border: "#292524",
    vibe: "A slightly warm dark tone. Pairs beautifully with warm-lit lighting renders.",
  },
  {
    name: "Dark Slate",
    bg: "#111827",
    border: "#1F2937",
    vibe: "A cool-toned dark gray. Very modern and technical.",
  },
  {
    name: "Pitch Black",
    bg: "#000000",
    border: "#1A1A1A",
    vibe: "Pure black. Ideal for importing raw, high-contrast CAD line work.",
  },
  {
    name: "Twilight Indigo",
    bg: "#13111C",
    border: "#242133",
    vibe: "A subtle purple-blue undertone. Adds a sleek, software-centric feel.",
  },
  {
    name: "Dark Pine",
    bg: "#0F1714",
    border: "#1A2B25",
    vibe: "A very muted, dark technical green. Nostalgic for old-school drafting software.",
  },
];

// Split `#RRGGBB` or `#RRGGBBAA` into the 6-char hex + opacity [0..1].
function splitBgValue(v: string): { hex6: string; opacity: number } {
  if (typeof v !== "string") return { hex6: "#FFFFFF", opacity: 1 };
  const trimmed = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return { hex6: trimmed.toUpperCase(), opacity: 1 };
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) {
    const hex6 = trimmed.slice(0, 7).toUpperCase();
    const a = parseInt(trimmed.slice(7, 9), 16) / 255;
    return { hex6, opacity: a };
  }
  return { hex6: "#FFFFFF", opacity: 1 };
}

function composeBgValue(hex6: string, opacity: number): string {
  const clean = hex6.toUpperCase();
  if (opacity >= 0.999) return clean;
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  return clean + a.toString(16).padStart(2, "0").toUpperCase();
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbTupleToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, "0").toUpperCase())
      .join("")
  );
}
// hsvToRgb / rgbToHsv are defined earlier in this file (shared with the
// BorderColorPicker). hsvToRgb there returns { r, g, b } as floats, so callers
// here round via rgbTupleToHex.

/** SVG-encoded checker pattern for the alpha slider backdrop. */
const CHECKER_BG_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><rect width='5' height='5' fill='%23cbd5e1'/><rect x='5' y='5' width='5' height='5' fill='%23cbd5e1'/><rect x='5' width='5' height='5' fill='%23f8fafc'/><rect y='5' width='5' height='5' fill='%23f8fafc'/></svg>\")";

function SheetBackgroundPopover({
  sheet,
  onChangeBackground,
  onChangeBorderColor,
}: {
  sheet: Sheet;
  onChangeBackground: (value: string) => void;
  onChangeBorderColor: (value: string) => void;
}) {
  const split = splitBgValue(sheet.background);
  const [r, g, b] = hexToRgbTuple(split.hex6);
  const currentHsv = rgbToHsv(r, g, b);

  function applyPreset(p: BgPreset) {
    // Preserve current opacity when switching presets.
    onChangeBackground(composeBgValue(p.bg, split.opacity));
    onChangeBorderColor(p.border);
  }

  function applyHex(raw: string) {
    const v = raw.trim();
    const normalised = v.startsWith("#") ? v : `#${v}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(normalised)) return;
    onChangeBackground(composeBgValue(normalised.toUpperCase(), split.opacity));
  }

  function applyRgb(which: "r" | "g" | "b", value: number) {
    if (!Number.isFinite(value)) return;
    const next: [number, number, number] =
      which === "r" ? [value, g, b] : which === "g" ? [r, value, b] : [r, g, value];
    const hex = rgbTupleToHex(next[0], next[1], next[2]);
    onChangeBackground(composeBgValue(hex, split.opacity));
  }

  function applyAlpha(alpha01: number) {
    const clamped = Math.max(0, Math.min(1, alpha01));
    onChangeBackground(composeBgValue(split.hex6, clamped));
  }

  // Hue state needs to be independent — at pure grays (s === 0) the hue in
  // HSV is undefined, so deriving it fresh every render would snap the slider
  // back to 0° and make the picker unusable.
  const [hue, setHue] = useState<number>(currentHsv.h);
  useEffect(() => {
    if (currentHsv.s > 0.001) setHue(currentHsv.h);
  }, [currentHsv.h, currentHsv.s]);

  function applyHsv(h: number, s: number, v: number) {
    const { r: r2, g: g2, b: b2 } = hsvToRgb(h, s, v);
    onChangeBackground(composeBgValue(rgbTupleToHex(r2, g2, b2), split.opacity));
  }

  // Controlled HEX draft so preset/RGB edits reflect here, but typing works too.
  const [hexDraft, setHexDraft] = useState<string>(split.hex6);
  const [hexFocused, setHexFocused] = useState<boolean>(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hexFocused) setHexDraft(split.hex6);
  }, [split.hex6, hexFocused]);

  // Find the preset the current value matches, if any — used for the label.
  const activePreset =
    [...BG_LIGHT_PRESETS, ...BG_DARK_PRESETS].find(
      (p) => p.bg.toUpperCase() === split.hex6
    ) ?? null;

  // Hovered preset drives the live caption below the grid.
  const [hoveredPreset, setHoveredPreset] = useState<BgPreset | null>(null);
  const displayedPreset = hoveredPreset ?? activePreset;
  const displayedHex = hoveredPreset ? hoveredPreset.bg.toUpperCase() : split.hex6;

  // SV square + slider pointer handling
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<HTMLDivElement>(null);

  function pctFromX(ref: React.RefObject<HTMLDivElement>, clientX: number): number {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function updateFromSv(clientX: number, clientY: number) {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    applyHsv(hue, s, v);
  }

  function updateFromHue(clientX: number) {
    const pct = pctFromX(hueRef, clientX);
    const nextHue = pct * 360;
    setHue(nextHue);
    applyHsv(nextHue, currentHsv.s, currentHsv.v);
  }

  function updateFromAlpha(clientX: number) {
    applyAlpha(pctFromX(alphaRef, clientX));
  }

  /** Generic pointer-drag binder. Captures the pointer on a track so drags
   *  continue smoothly even if the cursor leaves the element. */
  function dragBind(update: (x: number, y: number) => void) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if ((e.buttons & 1) !== 1) return;
        update(e.clientX, e.clientY);
      },
      onPointerUp: (e: React.PointerEvent) => {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* pointer already released */
        }
      },
    };
  }

  const alphaPct = Math.round(split.opacity * 100);
  const allPresets = [...BG_LIGHT_PRESETS, ...BG_DARK_PRESETS];

  // --- Apply / Cancel / Restore -------------------------------------------
  // Snapshot the sheet's bg+border the moment the popover opens. Every edit
  // below writes through to the store (so the canvas previews live), but
  // Cancel/unmount rolls back to this baseline. Apply re-snapshots, which
  // also deactivates the three action buttons.
  const [baseline, setBaseline] = useState<{ bg: string; border: string }>({
    bg: sheet.background,
    border: sheet.border.color,
  });
  const dirty =
    sheet.background !== baseline.bg || sheet.border.color !== baseline.border;

  // Refs so the unmount cleanup always sees current values (avoids stale
  // closure and avoids re-running the effect when values change).
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;
  const latestSheetRef = useRef(sheet);
  latestSheetRef.current = sheet;
  const onChangeBgRef = useRef(onChangeBackground);
  onChangeBgRef.current = onChangeBackground;
  const onChangeBorderRef = useRef(onChangeBorderColor);
  onChangeBorderRef.current = onChangeBorderColor;
  // Tracks whether the user committed with Apply — if so, unmount must NOT
  // roll back (Apply already promoted the edits into the new baseline).
  const appliedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (appliedRef.current) return;
      const { bg, border } = baselineRef.current;
      const s = latestSheetRef.current;
      if (s.background !== bg) onChangeBgRef.current(bg);
      if (s.border.color !== border) onChangeBorderRef.current(border);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApply() {
    appliedRef.current = true;
    setBaseline({ bg: sheet.background, border: sheet.border.color });
    // Reset the flag on the next tick so subsequent edits become dirty again
    // and Cancel/unmount rollback logic resumes from this new baseline.
    setTimeout(() => {
      appliedRef.current = false;
    }, 0);
  }
  function handleCancel() {
    onChangeBackground(baseline.bg);
    onChangeBorderColor(baseline.border);
  }
  function handleRestore() {
    // Pure White default — matches the first "Pure White" preset.
    onChangeBackground(composeBgValue("#FFFFFF", split.opacity));
    onChangeBorderColor("#E5E7EB");
  }

  return (
    <div
      className="flex flex-col w-[236px] overflow-hidden"
      style={{ maxHeight: "min(460px, calc(100vh - 160px))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 mb-2">
        <div className="text-xs font-medium text-ink-200">Sheet Background</div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin pr-0.5 -mr-0.5">
        {/* Unified palette — Light row on top, Dark row on bottom */}
        <div
          className="grid grid-cols-8 gap-x-1.5 gap-y-1.5 px-0.5"
          onMouseLeave={() => setHoveredPreset(null)}
        >
          {allPresets.map((p) => {
            const selected = split.hex6 === p.bg.toUpperCase();
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                onMouseEnter={() => setHoveredPreset(p)}
                onFocus={() => setHoveredPreset(p)}
                onBlur={() => setHoveredPreset(null)}
                aria-label={p.name}
                title={p.name}
                className={`block w-full aspect-square rounded outline-none ${
                  selected
                    ? "ring-2 ring-brand-500"
                    : "ring-1 ring-ink-700 hover:ring-ink-400"
                }`}
                style={{ background: p.bg }}
              />
            );
          })}
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] min-h-[14px]">
          <span
            className={`truncate ${
              hoveredPreset ? "text-ink-100" : "text-ink-300"
            }`}
          >
            {displayedPreset ? displayedPreset.name : "Custom"}
          </span>
          <span className="text-ink-500 font-mono tabular-nums">
            {displayedHex}
          </span>
        </div>

        {/* Divider */}
        <div className="border-t border-ink-700 my-2" />

        {/* SV square (saturation × value) */}
        <div
          ref={svRef}
          role="slider"
          aria-label="Saturation and brightness"
          aria-valuetext={`S ${Math.round(currentHsv.s * 100)}%, V ${Math.round(currentHsv.v * 100)}%`}
          className="relative w-full h-[88px] rounded-md overflow-hidden cursor-crosshair select-none touch-none"
          style={{
            backgroundColor: `hsl(${hue}, 100%, 50%)`,
            backgroundImage:
              "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
          }}
          {...dragBind(updateFromSv)}
        >
          <div
            className="absolute w-3 h-3 rounded-full border-2 border-white pointer-events-none -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${currentHsv.s * 100}%`,
              top: `${(1 - currentHsv.v) * 100}%`,
              background: split.hex6,
            }}
          />
        </div>

        {/* Hue slider */}
        <div className="mt-2 flex items-center gap-1.5">
          <div
            ref={hueRef}
            role="slider"
            aria-label="Hue"
            aria-valuenow={Math.round(hue)}
            aria-valuemin={0}
            aria-valuemax={360}
            className="relative flex-1 h-2.5 rounded-full cursor-pointer select-none touch-none"
            style={{
              background:
                "linear-gradient(to right, #ff0000 0%, #ffff00 16.66%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.66%, #ff00ff 83.33%, #ff0000 100%)",
            }}
            {...dragBind((x) => updateFromHue(x))}
          >
            <div
              className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white pointer-events-none"
              style={{
                left: `${(hue / 360) * 100}%`,
                background: `hsl(${hue}, 100%, 50%)`,
              }}
            />
          </div>
          <span className="text-[10px] text-ink-400 tabular-nums min-w-[28px] text-right">
            {Math.round(hue)}°
          </span>
        </div>

        {/* Alpha slider with checker backdrop */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <div
            ref={alphaRef}
            role="slider"
            aria-label="Opacity"
            aria-valuenow={alphaPct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="relative flex-1 h-2.5 rounded-full cursor-pointer select-none touch-none"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(${r},${g},${b},0), rgba(${r},${g},${b},1)), ${CHECKER_BG_URL}`,
              backgroundSize: "100% 100%, 10px 10px",
            }}
            {...dragBind((x) => updateFromAlpha(x))}
          >
            <div
              className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white pointer-events-none"
              style={{
                left: `${split.opacity * 100}%`,
                background: split.hex6,
              }}
            />
          </div>
          <span className="text-[10px] text-ink-400 tabular-nums min-w-[28px] text-right">
            {alphaPct}%
          </span>
        </div>

        {/* HEX row with preview swatch */}
        <div className="mt-2 flex items-center gap-1.5">
          <div
            className="w-7 h-7 rounded border border-ink-700 shrink-0"
            style={{
              backgroundImage: `linear-gradient(${sheet.background}, ${sheet.background}), ${CHECKER_BG_URL}`,
              backgroundSize: "100% 100%, 10px 10px",
            }}
            aria-label="Preview swatch"
          />
          <div className="flex-1 flex items-center gap-1">
            <span className="text-[10px] text-ink-500 shrink-0">HEX</span>
            <input
              type="text"
              value={hexDraft}
              onChange={(e) => setHexDraft(e.target.value)}
              onFocus={() => setHexFocused(true)}
              onBlur={(e) => {
                setHexFocused(false);
                applyHex(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="flex-1 min-w-0 h-7 px-1.5 text-[11px] rounded bg-ink-900 border border-ink-700 outline-none focus:border-brand-600 text-ink-100 font-mono"
              aria-label="Background hex"
              spellCheck={false}
            />
          </div>
        </div>

        {/* RGB row */}
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {(["r", "g", "b"] as const).map((channel, idx) => {
            const value = [r, g, b][idx];
            return (
              <div key={channel} className="flex items-center gap-1">
                <span className="text-[10px] text-ink-500 uppercase shrink-0">
                  {channel}
                </span>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={value}
                  onChange={(e) => applyRgb(channel, Number(e.target.value))}
                  className="w-full min-w-0 h-6 px-1 text-[11px] rounded bg-ink-900 border border-ink-700 outline-none focus:border-brand-600 text-ink-100 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  aria-label={`${channel.toUpperCase()} channel`}
                />
              </div>
            );
          })}
        </div>

        {/* Cancel / Restore / Apply — activate only when the session has
            pending (un-applied) edits against the baseline snapshot. */}
        <div className="mt-3 pt-2 border-t border-ink-700 flex items-center gap-1">
          <button
            type="button"
            onClick={handleCancel}
            disabled={!dirty}
            className="flex-1 h-7 rounded text-[11px] font-medium bg-ink-800 text-ink-200 hover:bg-ink-700 disabled:bg-ink-900 disabled:text-ink-600 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRestore}
            disabled={!dirty}
            className="flex-1 h-7 rounded text-[11px] font-medium bg-ink-800 text-ink-200 hover:bg-ink-700 disabled:bg-ink-900 disabled:text-ink-600 disabled:cursor-not-allowed transition-colors"
          >
            Restore
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!dirty}
            className="flex-1 h-7 rounded text-[11px] font-medium bg-brand-500 text-white hover:bg-brand-400 disabled:bg-ink-800 disabled:text-ink-600 disabled:cursor-not-allowed transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
