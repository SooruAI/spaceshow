import { useEffect, useRef, useState } from "react";
import {
  Plus,
  ChevronDown,
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
  Eraser,
  Minus,
  StickyNote,
  Type,
  Upload,
  MousePointer2,
} from "lucide-react";
import { useStore } from "../store";
import type { LineStyle, Orientation, PaperSize, Sheet } from "../types";
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
  if (tool !== "select") return <ToolOptionsBar />;
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
  const setSheetBorderSide = useStore((s) => s.setSheetBorderSide);
  const toggleSheetLocked = useStore((s) => s.toggleSheetLocked);
  const toggleSheetHidden = useStore((s) => s.toggleSheetHidden);
  const shapes = useStore((s) => s.shapes);

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
      const payload = {
        sheet: { ...s, id: undefined as any },
        shapes: shapes
          .filter((sh) => sh.sheetId === s.id)
          .map((sh) => ({ ...sh, id: undefined as any })),
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
      const clones = (payload.shapes || []).map((sh: any) => ({
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
      className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 panel rounded-full shadow-2xl"
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
        <Popover anchor="left">
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
            Background
          </div>
          <ColorPickerPanel
            value={sheet.background}
            onChange={(c) => setSheetBackground(sheet.id, c)}
          />
        </Popover>
      )}
      {open === "margins" && (
        <Popover anchor="left">
          <MarginsPopover
            sheet={sheet}
            onChange={(side, v) => setSheetMargin(sheet.id, side, v)}
          />
        </Popover>
      )}
      {open === "borders" && (
        <Popover anchor="left" wide>
          <BordersPopover
            sheet={sheet}
            onPatch={(patch) => setSheetBorder(sheet.id, patch)}
            onSide={(side, on) => setSheetBorderSide(sheet.id, side, on)}
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
                const stage = (window as any).__spaceshow_stage;
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
}: {
  children: React.ReactNode;
  anchor: "left" | "right";
  wide?: boolean;
}) {
  return (
    <div
      className={`absolute top-full mt-2 z-30 panel rounded-md shadow-2xl p-3 ${
        wide ? "w-80" : "w-64"
      } ${anchor === "right" ? "right-0" : "left-0"}`}
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
  const [orientation, setOrientation] = useState<Orientation>(sheet.orientation);
  const [w, setW] = useState(Math.round(sheet.width));
  const [h, setH] = useState(Math.round(sheet.height));
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
            value={w}
            onChange={(e) => setW(Number(e.target.value))}
            className="flex-1 h-7 px-2 text-xs rounded bg-ink-700 border border-ink-700 outline-none focus:border-brand-600 text-ink-100"
          />
          <span className="text-ink-400 text-xs">×</span>
          <input
            type="number"
            value={h}
            onChange={(e) => setH(Number(e.target.value))}
            className="flex-1 h-7 px-2 text-xs rounded bg-ink-700 border border-ink-700 outline-none focus:border-brand-600 text-ink-100"
          />
          <button
            className="pill-btn h-7 px-2.5 text-xs"
            onClick={() => onCustom(Math.max(50, w), Math.max(50, h))}
          >
            Apply
          </button>
        </div>
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

function MarginsPopover({
  sheet,
  onChange,
}: {
  sheet: Sheet;
  onChange: (side: "top" | "right" | "bottom" | "left", v: number | undefined) => void;
}) {
  const sides: ("top" | "right" | "bottom" | "left")[] = [
    "top",
    "right",
    "bottom",
    "left",
  ];
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-ink-400">
        Margins (px from edge)
      </div>
      {sides.map((s) => {
        const v = sheet.margins[s];
        const enabled = typeof v === "number";
        return (
          <div key={s} className="flex items-center gap-2">
            <Switch
              checked={enabled}
              onChange={(on) => onChange(s, on ? 40 : undefined)}
            />
            <span className="text-sm text-ink-100 w-16 capitalize">{s}</span>
            <input
              type="number"
              disabled={!enabled}
              value={enabled ? v : ""}
              onChange={(e) => onChange(s, Number(e.target.value))}
              placeholder="—"
              className="flex-1 h-7 px-2 text-xs rounded bg-ink-700 border border-ink-700 outline-none focus:border-brand-600 text-ink-100 disabled:opacity-40"
            />
            <span className="text-[10px] text-ink-400">px</span>
          </div>
        );
      })}
    </div>
  );
}

function BordersPopover({
  sheet,
  onPatch,
  onSide,
}: {
  sheet: Sheet;
  onPatch: (p: Partial<Sheet["border"]>) => void;
  onSide: (side: "top" | "right" | "bottom" | "left", on: boolean) => void;
}) {
  const styles: { id: LineStyle; label: string; preview: string }[] = [
    { id: "solid", label: "Solid", preview: "—" },
    { id: "dashed", label: "Dashed", preview: "- -" },
    { id: "dotted", label: "Dotted", preview: "···" },
    { id: "double", label: "Double", preview: "=" },
  ];
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-ink-300">Weight</span>
          <span className="text-xs text-ink-200 tabular-nums">
            {sheet.border.weight}px
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={8}
          step={1}
          value={sheet.border.weight}
          onChange={(e) => onPatch({ weight: Number(e.target.value) })}
          className="w-full accent-brand-500"
        />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">
          Style
        </div>
        <div className="grid grid-cols-4 gap-1">
          {styles.map((st) => (
            <button
              key={st.id}
              onClick={() => onPatch({ style: st.id })}
              className={`h-8 rounded text-xs transition-colors ${
                sheet.border.style === st.id
                  ? "row-selected ring-1 ring-brand-600"
                  : "surface-2 hover:bg-ink-700 text-ink-200"
              }`}
              title={st.label}
            >
              {st.preview}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">
          Sides
        </div>
        <div className="grid grid-cols-3 gap-1 w-28 mx-auto">
          <div />
          <SideToggle
            label="T"
            on={sheet.border.sides.top}
            onClick={() => onSide("top", !sheet.border.sides.top)}
          />
          <div />
          <SideToggle
            label="L"
            on={sheet.border.sides.left}
            onClick={() => onSide("left", !sheet.border.sides.left)}
          />
          <div className="grid place-items-center text-ink-500 text-[10px]">
            <Square size={12} />
          </div>
          <SideToggle
            label="R"
            on={sheet.border.sides.right}
            onClick={() => onSide("right", !sheet.border.sides.right)}
          />
          <div />
          <SideToggle
            label="B"
            on={sheet.border.sides.bottom}
            onClick={() => onSide("bottom", !sheet.border.sides.bottom)}
          />
          <div />
        </div>
      </div>

      <div className="border-t border-ink-700 pt-2">
        <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">
          Colour
        </div>
        <ColorPickerPanel
          value={sheet.border.color}
          onChange={(c) => onPatch({ color: c })}
        />
      </div>
    </div>
  );
}

function SideToggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-7 rounded text-[11px] font-medium transition-colors ${
        on ? "bg-brand-600 text-white" : "surface-2 hover:bg-ink-700 text-ink-200"
      }`}
    >
      {label}
    </button>
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

  const [open, setOpen] = useState<null | "color">(null);
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

  const meta = TOOL_META[tool];
  const colorTools = ["pen", "rect", "line", "sticky", "text"];
  const showColor = colorTools.includes(tool);
  const showStroke = tool === "pen" || tool === "line";
  const showFont = tool === "text";
  const showEraser = tool === "eraser";
  const colorKey = tool;
  const colorVal = toolColors[colorKey] || "#2c2a27";

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
        <span className="text-ink-400">{meta?.icon}</span>
        <span className="font-medium">{meta?.label}</span>
      </div>

      {(showColor || showStroke || showFont || showEraser) && (
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
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-ink-400">
            Stroke
          </span>
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="w-24 accent-brand-500"
          />
          <span className="text-[11px] text-ink-200 tabular-nums w-6 text-right">
            {strokeWidth}px
          </span>
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
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-ink-400">
            Eraser
          </span>
          <input
            type="range"
            min={4}
            max={80}
            step={2}
            value={eraserSize}
            onChange={(e) => setEraserSize(Number(e.target.value))}
            className="w-24 accent-brand-500"
          />
          <span className="text-[11px] text-ink-200 tabular-nums w-7 text-right">
            {eraserSize}px
          </span>
        </div>
      )}

      {tool === "upload" && (
        <span className="text-[11px] text-ink-400">
          Click the upload button to choose an image
        </span>
      )}

      {open === "color" && showColor && (
        <div
          className="absolute top-full mt-2 left-0 z-30 panel rounded-md shadow-2xl p-3 w-64"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
            {meta?.label} colour
          </div>
          <ColorPickerPanel
            value={colorVal}
            onChange={(c) => setToolColor(colorKey, c)}
          />
        </div>
      )}
    </div>
  );
}
