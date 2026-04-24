import { useRef, useState } from "react";
import { Stage, Layer, Group, Rect } from "react-konva";
import { Check, ChevronDown, LayoutGrid, ListFilter, Rows3 } from "lucide-react";
import { useStore } from "../store";
import type { Sheet, Shape } from "../types";
import { PresenterShape } from "./PresenterShape";
import { formatSheetSize } from "../lib/sheetFormat";
import {
  HideToggle,
  RowReorderControl,
  useClickOutside,
} from "./LeftSidebarRowControls";
import type { MoveDirection } from "./LeftSidebarRowControls";
import { useSidebarDragReorder } from "./useSidebarDragReorder";

// ─────────────────────────────────────────────────────────────────────────────
// SheetsTab — sheet-centric navigator for the left sidebar. Lists every sheet
// in the board as a card with a live Konva thumbnail, its name + size, a
// hide/unhide toggle, and a reorder popover. Clicking a row selects the sheet,
// makes it active, and animates a fit-to-viewport zoom-pan using the store's
// `zoomToSheet` action.
//
// Rows are drag-reorderable via the shared `useSidebarDragReorder` hook
// (scope="sheets") — the same drop targets as the Layers tab, so reorders
// commit against a single source of truth (`state.sheets`) and both tabs
// stay in sync for free.
//
// Filter pills (All / Unhidden / Hidden) drive a local `useState` — filter
// state is session-only on purpose; persistence would lock users into a stale
// view across reloads. Importantly, `visualIdx` in `dragProps` is always the
// sheet's FULL-array index so drag math stays stable when some rows are
// filtered out of the visible list.
// ─────────────────────────────────────────────────────────────────────────────

type Filter = "all" | "unhidden" | "hidden";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unhidden", label: "Unhidden" },
  { id: "hidden", label: "Hidden" },
];

type ViewMode = "list" | "grid";

// View-mode entries keep their glyph alongside the label so the trigger button
// can adopt the active option's icon — the control's leading icon then acts as
// a visual "current state" marker distinct from the filter dropdown next to it.
const VIEW_MODES: { id: ViewMode; label: string; Icon: typeof Rows3 }[] = [
  { id: "list", label: "List", Icon: Rows3 },
  { id: "grid", label: "Grid", Icon: LayoutGrid },
];

export function SheetsTab() {
  const sheets = useStore((s) => s.sheets);
  const shapes = useStore((s) => s.shapes);
  const activeSheetId = useStore((s) => s.activeSheetId);
  const selectedSheetId = useStore((s) => s.selectedSheetId);
  const setActiveSheet = useStore((s) => s.setActiveSheet);
  const selectSheet = useStore((s) => s.selectSheet);
  const toggleSheetHidden = useStore((s) => s.toggleSheetHidden);
  const moveSheetUp = useStore((s) => s.moveSheetUp);
  const moveSheetDown = useStore((s) => s.moveSheetDown);
  const moveSheetToTop = useStore((s) => s.moveSheetToTop);
  const moveSheetToBottom = useStore((s) => s.moveSheetToBottom);
  const zoomToSheet = useStore((s) => s.zoomToSheet);
  const viewMode = useStore((s) => s.sheetsViewMode);

  const [filter, setFilter] = useState<Filter>("all");

  const filtered = sheets.filter((s) => {
    if (filter === "unhidden") return !s.hidden;
    if (filter === "hidden") return s.hidden;
    return true;
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const { dragProps, insertionLine } = useSidebarDragReorder(scrollRef);

  // Count rule: show visible/total when a filter is applied, or just the
  // total when the view is unfiltered. Keeps the chrome calm by default but
  // exposes the filter effect the moment it matters.
  const countLabel =
    filter === "all"
      ? `${sheets.length} ${sheets.length === 1 ? "sheet" : "sheets"}`
      : `${filtered.length} of ${sheets.length}`;

  return (
    <>
      {/* Sub-header — filter + view-mode dropdowns anchored left, the
          contextual count pinned right via `ml-auto`. Pairing the two
          dropdowns immediately next to each other (`gap-1.5`) makes them
          read as a matching control cluster; the count stays out of their
          way so it never gets squeezed when the count label grows (e.g.
          "14 of 37"). */}
      <div className="px-2.5 py-1.5 border-b border-ink-800 flex items-center gap-1.5">
        <FilterDropdown filter={filter} onChange={setFilter} />
        <ViewModeDropdown />
        <span className="ml-auto text-[11px] text-ink-400 tabular-nums select-none">
          {countLabel}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto scroll-thin py-1"
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-[11px] text-ink-500">
            No sheets match this filter.
          </div>
        ) : (
          // Both row variants take the same props, so the parent picks the
          // visual shape with a one-line component swap and everything else
          // — click handlers, drag-reorder, hide/reorder controls — stays
          // identical across modes.
          filtered.map((sheet) => {
            const RowComponent =
              viewMode === "grid" ? SheetCardGrid : SheetCardRow;
            return (
              <RowComponent
                key={sheet.id}
                sheet={sheet}
                // Full-array index so reorder math stays correct under filters.
                sheetIndex={sheets.indexOf(sheet)}
                totalSheets={sheets.length}
                shapes={shapes.filter((sh) => sh.sheetId === sheet.id)}
                isActive={sheet.id === activeSheetId}
                isSelected={sheet.id === selectedSheetId}
                onSelect={() => {
                  setActiveSheet(sheet.id);
                  selectSheet(sheet.id);
                  zoomToSheet(
                    sheet.id,
                    window.innerWidth,
                    window.innerHeight,
                  );
                }}
                onToggleHidden={() => toggleSheetHidden(sheet.id)}
                onMove={(dir) => {
                  if (dir === "up") moveSheetUp(sheet.id);
                  else if (dir === "down") moveSheetDown(sheet.id);
                  else if (dir === "top") moveSheetToTop(sheet.id);
                  else if (dir === "bottom") moveSheetToBottom(sheet.id);
                }}
                dragProps={dragProps}
              />
            );
          })
        )}
        {insertionLine}
      </div>
    </>
  );
}

// ── SheetCardRow ──────────────────────────────────────────────────────────

type DragPropsFn = ReturnType<typeof useSidebarDragReorder>["dragProps"];

interface SheetCardRowProps {
  sheet: Sheet;
  sheetIndex: number;
  totalSheets: number;
  shapes: Shape[];
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleHidden: () => void;
  onMove: (dir: MoveDirection) => void;
  dragProps: DragPropsFn;
}

function SheetCardRow({
  sheet,
  sheetIndex,
  totalSheets,
  shapes,
  isActive,
  isSelected,
  onSelect,
  onToggleHidden,
  onMove,
  dragProps,
}: SheetCardRowProps) {
  return (
    <div
      data-row-id={sheet.id}
      {...dragProps("sheet", sheet.id, "sheets", sheetIndex, totalSheets)}
      onClick={onSelect}
      className={`group relative flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-opacity ${
        isActive
          ? "row-active"
          : isSelected
            ? "row-selected"
            : "hover:bg-ink-700"
      } ${sheet.hidden ? "opacity-60" : ""}`}
    >
      <div className="rounded overflow-hidden border border-ink-700 shrink-0">
        <SheetThumb sheet={sheet} shapes={shapes} width={56} height={42} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-ink-100 font-medium truncate">
          {sheet.name}
        </div>
        <div className="text-[10px] text-ink-400 tabular-nums truncate">
          {formatSheetSize(sheet)}
        </div>
      </div>
      <div
        className="flex items-center gap-0.5 shrink-0"
        // Controls manage their own click propagation already, but keep this
        // wrapper lean so the row's onSelect fires on card-body clicks only.
      >
        <HideToggle
          entity="sheet"
          hidden={sheet.hidden}
          onToggle={onToggleHidden}
          forceVisible={isActive || isSelected}
        />
        <RowReorderControl
          entity="sheet"
          canUp={sheetIndex > 0}
          canDown={sheetIndex < totalSheets - 1}
          onMove={onMove}
          forceVisible={isActive || isSelected}
        />
      </div>
    </div>
  );
}

// ── SheetCardGrid ──────────────────────────────────────────────────────────
// Grid-mode card. Same props interface as `SheetCardRow` so the parent can
// swap between them with a one-line conditional — all click / hide / reorder
// / drag behavior is identical, only the visual shape changes.
//
// Layout: a large thumbnail fills the card width; a footer row underneath
// carries the name + size + hide + reorder controls.  We compute the
// thumbnail height from the sheet's own aspect ratio so landscape sheets get
// a shorter preview and portrait sheets get a taller one — clamped to
// [90, 160] px so the cards stay in a predictable vertical rhythm and a
// long portrait sheet can't blow out the scroll area.
//
// The sidebar is fixed at `w-60` (240 px) and the inner scroll column has
// `px-2` (16 px total) plus a reserved ~8 px scrollbar gutter; that leaves
// ~216 px of usable width.  We size the thumbnail at CARD_INNER_WIDTH = 200
// — comfortably ≥ 75 % of the sidebar (180 px) per the product ask, with
// a little slack for the card's own border.

function SheetCardGrid({
  sheet,
  sheetIndex,
  totalSheets,
  shapes,
  isActive,
  isSelected,
  onSelect,
  onToggleHidden,
  onMove,
  dragProps,
}: SheetCardRowProps) {
  const CARD_INNER_WIDTH = 200;
  const rawHeight = CARD_INNER_WIDTH * (sheet.height / sheet.width);
  const thumbHeight = Math.max(90, Math.min(160, rawHeight));

  return (
    <div
      data-row-id={sheet.id}
      {...dragProps("sheet", sheet.id, "sheets", sheetIndex, totalSheets)}
      onClick={onSelect}
      className={`mx-2 my-2 rounded-md border bg-ink-800 overflow-hidden cursor-pointer transition-colors ${
        isActive
          ? "border-brand-500 row-active"
          : isSelected
            ? "border-brand-500/40 row-selected"
            : "border-ink-700 hover:border-brand-500/60 hover:bg-ink-700/40"
      } ${sheet.hidden ? "opacity-60" : ""}`}
    >
      <div className="bg-ink-900 flex items-center justify-center">
        <SheetThumb
          sheet={sheet}
          shapes={shapes}
          width={CARD_INNER_WIDTH}
          height={thumbHeight}
        />
      </div>
      <div className="flex items-center gap-2 px-2.5 py-2 border-t border-ink-800">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-ink-100 font-medium truncate">
            {sheet.name}
          </div>
          <div className="text-[10px] text-ink-400 tabular-nums truncate">
            {formatSheetSize(sheet)}
          </div>
        </div>
        {/* Controls are footer-anchored here (not hover-revealed like list
            mode) because a grid card reads as a full object — its actions
            are first-class affordances, not progressive-disclosure chrome. */}
        <div className="flex items-center gap-0.5 shrink-0">
          <HideToggle
            entity="sheet"
            hidden={sheet.hidden}
            onToggle={onToggleHidden}
            forceVisible
          />
          <RowReorderControl
            entity="sheet"
            canUp={sheetIndex > 0}
            canDown={sheetIndex < totalSheets - 1}
            onMove={onMove}
            forceVisible
          />
        </div>
      </div>
    </div>
  );
}

// ── FilterDropdown ─────────────────────────────────────────────────────────
// Compact dropdown that replaces the All / Unhidden / Hidden pill trio.
// The trigger shows the current filter label so the state is always
// visible at a glance; the popover uses the same menu pattern as
// `RowReorderControl` / `RowMoreMenu` for visual continuity with the rest
// of the sidebar chrome. A left-rail filter icon is a universal hint that
// this control narrows the list below.

function FilterDropdown({
  filter,
  onChange,
}: {
  filter: Filter;
  onChange: (f: Filter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const current = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Filter sheets: ${current.label}`}
        title="Filter sheets"
        className={
          "h-7 pl-2 pr-1.5 inline-flex items-center gap-1.5 rounded-md border text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 " +
          (open
            ? "bg-ink-700 border-ink-600 text-ink-100"
            : "bg-ink-800 border-ink-700 text-ink-200 hover:bg-ink-700 hover:text-ink-100")
        }
      >
        <ListFilter size={11} className="text-ink-400" />
        <span>{current.label}</span>
        <ChevronDown
          size={11}
          className={
            "text-ink-400 transition-transform " + (open ? "rotate-180" : "")
          }
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Filter sheets"
          className="absolute left-0 top-full mt-1 z-40 w-40 rounded-md border border-ink-700 bg-ink-800 text-ink-100 shadow-2xl py-1"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          {FILTERS.map((f) => {
            const selected = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(f.id);
                  setOpen(false);
                }}
                className={
                  "w-full flex items-center gap-2 pl-2 pr-2.5 py-1.5 text-xs text-left transition-colors " +
                  (selected
                    ? "text-ink-100 bg-ink-700/40"
                    : "text-ink-200 hover:bg-ink-700/70")
                }
              >
                <span className="w-3.5 shrink-0 flex items-center justify-center">
                  {selected ? (
                    <Check size={12} className="text-brand-400" />
                  ) : null}
                </span>
                <span className="flex-1">{f.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ViewModeDropdown ───────────────────────────────────────────────────────
// Mirrors `FilterDropdown`'s trigger + popover chrome so the two controls read
// as a matching pair in the sub-header. Differences:
//   • The trigger's leading icon reflects the *current* mode (Rows3 for List,
//     LayoutGrid for Grid) so the control's own shape previews its action.
//   • State lives in the store (`sheetsViewMode`/`setSheetsViewMode`) rather
//     than local `useState`, so a user's preference survives round-trips to
//     the Layers tab without resetting to the default.
//   • Menu items show the mode icon on the LEFT of the label (the filter
//     dropdown has no icons there). The right-side Check mark pattern is
//     identical.

function ViewModeDropdown() {
  const viewMode = useStore((s) => s.sheetsViewMode);
  const setViewMode = useStore((s) => s.setSheetsViewMode);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const current = VIEW_MODES.find((m) => m.id === viewMode) ?? VIEW_MODES[0];
  const TriggerIcon = current.Icon;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`View mode: ${current.label}`}
        title="Sheet view mode"
        className={
          "h-7 pl-2 pr-1.5 inline-flex items-center gap-1.5 rounded-md border text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 " +
          (open
            ? "bg-ink-700 border-ink-600 text-ink-100"
            : "bg-ink-800 border-ink-700 text-ink-200 hover:bg-ink-700 hover:text-ink-100")
        }
      >
        <TriggerIcon size={11} className="text-ink-400" />
        <span>{current.label}</span>
        <ChevronDown
          size={11}
          className={
            "text-ink-400 transition-transform " + (open ? "rotate-180" : "")
          }
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Sheet view mode"
          className="absolute left-0 top-full mt-1 z-40 w-40 rounded-md border border-ink-700 bg-ink-800 text-ink-100 shadow-2xl py-1"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          {VIEW_MODES.map((m) => {
            const selected = m.id === viewMode;
            const ItemIcon = m.Icon;
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setViewMode(m.id);
                  setOpen(false);
                }}
                className={
                  "w-full flex items-center gap-2 pl-2 pr-2.5 py-1.5 text-xs text-left transition-colors " +
                  (selected
                    ? "text-ink-100 bg-ink-700/40"
                    : "text-ink-200 hover:bg-ink-700/70")
                }
              >
                <ItemIcon size={12} className="text-ink-300 shrink-0" />
                <span className="flex-1">{m.label}</span>
                <span className="w-3.5 shrink-0 flex items-center justify-center">
                  {selected ? (
                    <Check size={12} className="text-brand-400" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── SheetThumb ─────────────────────────────────────────────────────────────
// Parameterized Konva preview — same render strategy as
// `SheetSelectionModal`'s thumbnail, with the canvas dimensions passed in as
// props so both the list-mode row (56×42) and the grid-mode card (~200 × ~90–160)
// share a single implementation. The letterbox math (`scale = min(W/sheet.w,
// H/sheet.h)`) handles any aspect — wide landscape, square, or tall portrait —
// without distortion.
//
// The visible-shapes filter prevents hidden shapes from leaking into the
// preview. Chrome (borders, rounded corners) is the caller's responsibility:
// list mode adds a 1px ink-700 border; grid mode relies on the outer card's
// border so we don't double-stroke.

function SheetThumb({
  sheet,
  shapes,
  width,
  height,
}: {
  sheet: Sheet;
  shapes: Shape[];
  width: number;
  height: number;
}) {
  const scale = Math.min(width / sheet.width, height / sheet.height);
  const offsetX = (width - sheet.width * scale) / 2;
  const offsetY = (height - sheet.height * scale) / 2;
  return (
    <div
      className="overflow-hidden flex items-center justify-center shrink-0"
      style={{ width, height, background: "#0c0e13" }}
    >
      <Stage width={width} height={height} listening={false}>
        <Layer listening={false}>
          <Group x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
            <Rect
              width={sheet.width}
              height={sheet.height}
              fill={sheet.background}
              listening={false}
            />
            {shapes
              .filter((s) => s.visible)
              .map((s) => (
                <PresenterShape key={s.id} shape={s} />
              ))}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
