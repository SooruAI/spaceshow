import { useMemo, useRef, useEffect } from "react";
import { Stage, Layer, Group, Rect } from "react-konva";
import { Check, Minus, Eye, EyeOff, Play, X } from "lucide-react";
import { useStore } from "../store";
import type { Sheet, Shape } from "../types";
import { PresenterShape } from "./PresenterShape";
import { formatSheetSize } from "../lib/sheetFormat";
import { RowReorderControl } from "./LeftSidebarRowControls";
import type { MoveDirection } from "./LeftSidebarRowControls";
import { useSidebarDragReorder } from "./useSidebarDragReorder";

type DragPropsFn = ReturnType<typeof useSidebarDragReorder>["dragProps"];

type FilterId = "unhidden" | "all" | "hidden";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "unhidden", label: "Unhidden" },
  { id: "all", label: "All" },
  { id: "hidden", label: "Hidden" },
];

/**
 * Premium sheet-picker shown as the first step of SpacePresent. Users filter
 * sheets (Unhidden / All / Hidden), toggle individual selection, or flip a
 * Select-All checkbox (supports an indeterminate partial-selection state).
 *
 * Each row gets a live mini-thumbnail rendered through the same
 * `PresenterShape` components used by the fullscreen presenter, so what the
 * user sees in the modal is exactly what they'll see on stage.
 */
export function SheetSelectionModal() {
  const sheets = useStore((s) => s.sheets);
  const shapes = useStore((s) => s.shapes);
  const filter = useStore((s) => s.presentationSheetFilter);
  const selected = useStore((s) => s.presentationSelectedIds);
  const setFilter = useStore((s) => s.setPresentationSheetFilter);
  const toggleSel = useStore((s) => s.togglePresentationSelection);
  const selectAll = useStore((s) => s.selectAllPresentation);
  const clearSel = useStore((s) => s.clearPresentationSelection);
  const cancel = useStore((s) => s.cancelPresentation);
  const confirm = useStore((s) => s.confirmPresentation);
  // Reorder actions — the modal mutates the same `sheets` array the rest of
  // the app reads from, so reordering here instantly updates the presentation
  // order AND the sidebar's Sheets/Layers views. No separate "presentation
  // order" concept is needed.
  const moveSheetUp = useStore((s) => s.moveSheetUp);
  const moveSheetDown = useStore((s) => s.moveSheetDown);
  const moveSheetToTop = useStore((s) => s.moveSheetToTop);
  const moveSheetToBottom = useStore((s) => s.moveSheetToBottom);

  const filtered = useMemo(() => {
    if (filter === "unhidden") return sheets.filter((s) => !s.hidden);
    if (filter === "hidden") return sheets.filter((s) => s.hidden);
    return sheets;
  }, [sheets, filter]);

  // Select-All state is relative to the currently visible filter view. Users
  // expect "Select all" on the "All" tab to select every sheet — even hidden
  // ones — but on "Unhidden" it should only select unhidden sheets.
  const filteredIds = useMemo(() => filtered.map((s) => s.id), [filtered]);
  const allSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.includes(id));
  const someSelected =
    filteredIds.some((id) => selected.includes(id)) && !allSelected;

  const confirmDisabled = selected.length === 0;
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  // Drag-to-reorder — the hook wires up HTML5 drag events on each row and
  // positions an `insertionLine` absolutely inside the scroll container (hence
  // the `relative` class on that div below). Reorder goes through the same
  // `moveSheetToIndex` action the sidebar uses, so dragging here reorders the
  // canonical `sheets` array the rest of the app reads from.
  const scrollRef = useRef<HTMLDivElement>(null);
  const { dragProps, insertionLine } = useSidebarDragReorder(scrollRef);

  useEffect(() => {
    firstFocusableRef.current?.focus();
  }, []);

  function handleSelectAllClick() {
    if (allSelected) {
      // Clear only from the filtered set so selections from other filters
      // aren't accidentally dropped.
      const remaining = selected.filter((id) => !filteredIds.includes(id));
      if (remaining.length === selected.length) clearSel();
      else
        useStore.setState({ presentationSelectedIds: remaining });
      return;
    }
    if (someSelected) {
      // Indeterminate → promote to all.
      selectAll();
      return;
    }
    selectAll();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="space-present-modal-title"
        className="w-[640px] max-w-full max-h-[80vh] flex flex-col rounded-2xl bg-ink-800 border border-ink-700 shadow-[0_30px_80px_rgba(0,0,0,0.5)] overflow-hidden animate-fade-scale-in"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between">
          <div>
            <h2
              id="space-present-modal-title"
              className="font-heading text-xl font-semibold text-ink-100 tracking-tight"
            >
              SpacePresent
            </h2>
            <p className="mt-0.5 text-sm text-ink-400">
              Pick sheets to present.
            </p>
          </div>
          <button
            type="button"
            onClick={cancel}
            aria-label="Close"
            className="w-8 h-8 rounded-md flex items-center justify-center text-ink-400 hover:text-ink-100 hover:bg-ink-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="px-5 pb-3">
          <div className="inline-flex items-center gap-0.5 bg-ink-900 rounded-full p-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={
                  "h-7 px-3 text-xs font-medium rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 " +
                  (filter === f.id
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-ink-300 hover:text-ink-100")
                }
                aria-pressed={filter === f.id}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Select all */}
        <div className="px-5 py-2 border-t border-ink-700 flex items-center gap-3">
          <FancyCheckbox
            state={
              allSelected ? "checked" : someSelected ? "indeterminate" : "unchecked"
            }
            onClick={handleSelectAllClick}
            ariaLabel="Select all"
          />
          <span
            className="text-sm text-ink-200 select-none cursor-pointer"
            onClick={handleSelectAllClick}
          >
            Select all
          </span>
          <span className="ml-auto text-xs text-ink-400 tabular-nums">
            {selected.length} of {filtered.length} selected
          </span>
        </div>

        {/* List */}
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-y-auto px-3 py-2 min-h-[160px]"
        >
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-ink-400">
              No sheets match this filter.
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {filtered.map((sh) => (
                <SheetRow
                  key={sh.id}
                  sheet={sh}
                  shapes={shapes.filter((s) => s.sheetId === sh.id)}
                  selected={selected.includes(sh.id)}
                  sheetIndex={sheets.indexOf(sh)}
                  totalSheets={sheets.length}
                  onToggle={() => toggleSel(sh.id)}
                  onMove={(dir) => {
                    if (dir === "up") moveSheetUp(sh.id);
                    else if (dir === "down") moveSheetDown(sh.id);
                    else if (dir === "top") moveSheetToTop(sh.id);
                    else if (dir === "bottom") moveSheetToBottom(sh.id);
                  }}
                  dragProps={dragProps}
                />
              ))}
            </ul>
          )}
          {/* Drop-position indicator (thin brand-colored line between rows).
              Must live inside the `relative` scroll container so its `top`
              coordinate — which is relative to that container — renders at
              the right spot even when the list is scrolled. */}
          {insertionLine}
        </div>

        {/* Footer */}
        <div className="border-t border-ink-700 px-5 py-3 flex items-center gap-3">
          <span className="text-sm text-ink-400 tabular-nums">
            {selected.length} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              ref={firstFocusableRef}
              type="button"
              onClick={cancel}
              className="pill-btn"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={confirmDisabled}
              className={
                "pill-btn pill-btn-accent inline-flex items-center gap-1.5 " +
                (confirmDisabled
                  ? "opacity-40 pointer-events-none"
                  : "shadow-[0_0_0_3px_rgba(13,148,136,0.25)]")
              }
            >
              <Play size={14} />
              Present
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Single sheet row — thumbnail + name + size label + hidden badge.
 *
 * The row itself is a `<div role="button">` rather than a `<button>` so it
 * can legally contain the inner `<button role="checkbox">` without creating
 * a nested-interactive-element DOM warning.
 */
function SheetRow({
  sheet,
  shapes,
  selected,
  sheetIndex,
  totalSheets,
  onToggle,
  onMove,
  dragProps,
}: {
  sheet: Sheet;
  shapes: Shape[];
  selected: boolean;
  /** Position in the full `sheets` array — drives which reorder menu items
   *  are enabled. We intentionally use the full-array index (not the filtered
   *  index) so "Move up" always means "one position up in the canonical order
   *  the rest of the app reads from", regardless of which filter is active. */
  sheetIndex: number;
  totalSheets: number;
  onToggle: () => void;
  onMove: (dir: MoveDirection) => void;
  /** HTML5 drag handlers from `useSidebarDragReorder`. Spreading them on the
   *  row's outer div is enough to make the row a drag source AND a drop target;
   *  the hook handles the rest (insertion line, `moveSheetToIndex` dispatch). */
  dragProps: DragPropsFn;
}) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        data-row-id={sheet.id}
        {...dragProps("sheet", sheet.id, "sheets", sheetIndex, totalSheets)}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-pressed={selected}
        aria-label={`Toggle ${sheet.name}`}
        className={
          "w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 " +
          (selected
            ? "ring-1 ring-brand-500/50 bg-ink-700/40"
            : "hover:bg-ink-700/60")
        }
      >
        <FancyCheckbox
          state={selected ? "checked" : "unchecked"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          ariaLabel={`Select ${sheet.name}`}
        />
        <SheetThumb sheet={sheet} shapes={shapes} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink-100 font-medium truncate">
            {sheet.name}
          </div>
          <div className="text-xs text-ink-400 tabular-nums truncate">
            {formatSheetSize(sheet)}
          </div>
        </div>
        {sheet.hidden && (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-400 bg-ink-900 border border-ink-700 rounded-full px-2 py-0.5">
            <EyeOff size={11} />
            Hidden
          </span>
        )}
        {!sheet.hidden && selected && (
          <span className="inline-flex items-center gap-1 text-[11px] text-brand-500 bg-brand-600/10 border border-brand-600/30 rounded-full px-2 py-0.5">
            <Eye size={11} />
            Selected
          </span>
        )}
        {/* Reorder control — `popoverAlign="end"` pins the popover's right
            edge to the trigger so it opens LEFTWARD into the modal instead
            of clipping past the right edge of the 640px dialog. The control
            stops its own click propagation so the row-toggle doesn't fire. */}
        <RowReorderControl
          entity="sheet"
          canUp={sheetIndex > 0}
          canDown={sheetIndex < totalSheets - 1}
          onMove={onMove}
          forceVisible
          popoverAlign="end"
        />
      </div>
    </li>
  );
}

/**
 * 96×72 Konva Stage showing the sheet fit-scaled with its real shapes
 * rendered by PresenterShape. Gives the user an instant preview of what each
 * slide looks like without leaving the modal.
 */
function SheetThumb({ sheet, shapes }: { sheet: Sheet; shapes: Shape[] }) {
  const W = 96;
  const H = 72;
  const scale = Math.min(W / sheet.width, H / sheet.height);
  const offsetX = (W - sheet.width * scale) / 2;
  const offsetY = (H - sheet.height * scale) / 2;
  return (
    <div
      className="w-[96px] h-[72px] rounded-md overflow-hidden border border-ink-700 flex items-center justify-center shrink-0"
      style={{ background: "#0c0e13" }}
    >
      <Stage width={W} height={H} listening={false}>
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

/** Rounded 18px checkbox with checked / indeterminate / unchecked states. */
function FancyCheckbox({
  state,
  onClick,
  ariaLabel,
}: {
  state: "checked" | "indeterminate" | "unchecked";
  onClick: (e: React.MouseEvent) => void;
  ariaLabel: string;
}) {
  const filled = state !== "unchecked";
  return (
    <button
      type="button"
      onClick={onClick}
      role="checkbox"
      aria-checked={
        state === "indeterminate" ? "mixed" : state === "checked"
      }
      aria-label={ariaLabel}
      className={
        "w-[18px] h-[18px] rounded-[5px] flex items-center justify-center transition-colors border focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 shrink-0 " +
        (filled
          ? "bg-brand-600 border-brand-600 text-white"
          : "bg-ink-900 border-ink-600 hover:border-ink-500")
      }
    >
      {state === "checked" && <Check size={12} strokeWidth={3} />}
      {state === "indeterminate" && <Minus size={12} strokeWidth={3} />}
    </button>
  );
}

