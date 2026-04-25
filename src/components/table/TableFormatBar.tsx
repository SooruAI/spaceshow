import { useStore } from "../../store";
import type { Shape, TableShape } from "../../types";
import {
  addCol,
  addRow,
  deleteCol,
  deleteRow,
} from "../../lib/tableLayout";
import { RULER_SIZE } from "../Rulers";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  ArrowDownToLine,
  Heading1,
  Trash2,
} from "lucide-react";

/**
 * Top-center contextual bar for TableShape editing. Visible when:
 *   • A single TableShape is the active selection (select tool), OR
 *   • A table cell is currently being edited (editingText.kind === "table-cell").
 *
 * Controls (v1):
 *   • Add row above / below the active cell (or last row if no cell focus).
 *   • Add column left / right of the active cell (or last col).
 *   • Delete current row / column.
 *   • Toggle header row / header column styling.
 *
 * Resize / merged cells / per-edge border editing are all v2.
 *
 * The bar stacks below TextFormatBar when a cell is being edited, the same
 * way StickyFormatBar stacks with TextFormatBar — push down by one bar's
 * worth of height.
 */
export function TableFormatBar() {
  const selectedShapeId = useStore((s) => s.selectedShapeId);
  const selectedShapeIds = useStore((s) => s.selectedShapeIds);
  const shapes = useStore((s) => s.shapes);
  const tool = useStore((s) => s.tool);
  const editingText = useStore((s) => s.editingText);
  const updateShape = useStore((s) => s.updateShape);

  // Selection-mode visibility: single TableShape selected with select tool.
  const selectedShape = selectedShapeId
    ? shapes.find((s) => s.id === selectedShapeId)
    : null;
  const tableInSelection =
    tool === "select" &&
    !!selectedShape &&
    selectedShape.type === "table" &&
    selectedShapeIds.length <= 1
      ? (selectedShape as TableShape)
      : null;

  // Edit-mode visibility: a cell is being edited.
  const editingTable =
    editingText?.kind === "table-cell"
      ? (shapes.find((s) => s.id === editingText.id) as TableShape | undefined)
      : null;

  const tableMaybe = editingTable ?? tableInSelection;
  if (!tableMaybe) return null;
  // Capture into a non-null const so closure handlers (apply) inherit the
  // narrowed type — TS doesn't carry the truthiness narrowing across
  // function boundaries when the binding name itself is mutable-by-narrowing.
  const table: TableShape = tableMaybe;

  // Active row/col: when editing a cell, target that cell. When the table is
  // simply selected, target the last row/col so "add row" appends at the
  // natural place.
  const activeRow =
    editingText?.kind === "table-cell"
      ? editingText.row
      : table.cells.length - 1;
  const activeCol =
    editingText?.kind === "table-cell"
      ? editingText.col
      : table.colWidths.length - 1;

  function apply(patch: Partial<TableShape>) {
    if (Object.keys(patch).length === 0) return;
    updateShape(table.id, patch as Partial<Shape>);
  }

  // Stack below TextFormatBar (~46px) when a cell is being edited.
  const STACK_OFFSET = 46;
  const topPx =
    editingText?.kind === "table-cell"
      ? RULER_SIZE + 8 + STACK_OFFSET
      : RULER_SIZE + 8;

  return (
    <div
      data-table-format-bar
      className="absolute left-1/2 -translate-x-1/2 z-40 flex items-center gap-0.5 px-1.5 py-1 rounded-full shadow-xl ring-1 ring-black/40"
      style={{
        top: topPx,
        background: "var(--bg-secondary)",
        backdropFilter: "blur(6px)",
      }}
    >
      <BarButton
        title="Insert row above"
        onClick={() => apply(addRow(table, activeRow))}
      >
        <ArrowUpToLine size={14} />
      </BarButton>
      <BarButton
        title="Insert row below"
        onClick={() => apply(addRow(table, activeRow + 1))}
      >
        <ArrowDownToLine size={14} />
      </BarButton>
      <BarButton
        title="Delete row"
        disabled={table.cells.length <= 1}
        onClick={() => apply(deleteRow(table, activeRow))}
      >
        <Trash2 size={14} />
        <span className="ml-1 text-[10px]">row</span>
      </BarButton>

      <Divider />

      <BarButton
        title="Insert column left"
        onClick={() => apply(addCol(table, activeCol))}
      >
        <ArrowLeftToLine size={14} />
      </BarButton>
      <BarButton
        title="Insert column right"
        onClick={() => apply(addCol(table, activeCol + 1))}
      >
        <ArrowRightToLine size={14} />
      </BarButton>
      <BarButton
        title="Delete column"
        disabled={table.colWidths.length <= 1}
        onClick={() => apply(deleteCol(table, activeCol))}
      >
        <Trash2 size={14} />
        <span className="ml-1 text-[10px]">col</span>
      </BarButton>

      <Divider />

      <BarButton
        title="Toggle header row"
        active={!!table.headerRow}
        onClick={() => apply({ headerRow: !table.headerRow })}
      >
        <Heading1 size={14} />
        <span className="ml-1 text-[10px]">row</span>
      </BarButton>
      <BarButton
        title="Toggle header column"
        active={!!table.headerCol}
        onClick={() => apply({ headerCol: !table.headerCol })}
      >
        <Heading1 size={14} className="-rotate-90" />
        <span className="ml-1 text-[10px]">col</span>
      </BarButton>
    </div>
  );
}

function BarButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center h-7 px-2 rounded-md text-xs transition-colors ${
        active
          ? "bg-brand-500/20 text-ink-100"
          : disabled
          ? "text-ink-500 cursor-not-allowed"
          : "text-ink-200 hover:bg-ink-700"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-ink-700" />;
}
