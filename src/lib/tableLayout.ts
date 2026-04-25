import type { TableShape, TableCell, TableBorder, TextContent } from "../types";

/**
 * Pure helpers for TableShape geometry & mutations. Everything here is
 * referentially transparent — no store access, no React, no Konva.
 *
 * Source-of-truth invariant:
 *   table.cells.length        === table.rowHeights.length
 *   table.cells[r].length     === table.colWidths.length   (∀ r)
 *   tableBBox(table).width    === sum(table.colWidths)
 *   tableBBox(table).height   === sum(table.rowHeights)
 */

export interface TableDefaults {
  defaultColWidth: number;
  defaultRowHeight: number;
  borderColor: string;
  borderWeight: number;
  borderStyle: "solid" | "dashed" | "dotted";
  headerRowBg: string;
}

export function defaultTable(opts: {
  rows: number;
  cols: number;
  x: number;
  y: number;
  sheetId: string;
  fill?: string;
  defaults: TableDefaults;
}): TableShape {
  const rows = Math.max(1, opts.rows);
  const cols = Math.max(1, opts.cols);
  const cells: TableCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({} as TableCell))
  );
  return {
    // Caller assigns id via uid() — `defaultTable` returns a template.
    id: "",
    type: "table",
    sheetId: opts.sheetId,
    name: "Table",
    visible: true,
    locked: false,
    x: opts.x,
    y: opts.y,
    rotation: 0,
    cells,
    rowHeights: Array(rows).fill(opts.defaults.defaultRowHeight),
    colWidths: Array(cols).fill(opts.defaults.defaultColWidth),
    defaultBorder: {
      color: opts.defaults.borderColor,
      weight: opts.defaults.borderWeight,
      style: opts.defaults.borderStyle,
    },
    headerRow: false,
    headerCol: false,
    fill: opts.fill ?? "#ffffff",
  };
}

export function tableBBox(t: TableShape): { width: number; height: number } {
  let width = 0;
  for (const w of t.colWidths) width += w;
  let height = 0;
  for (const h of t.rowHeights) height += h;
  return { width, height };
}

export function cellBBox(t: TableShape, row: number, col: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let x = 0;
  for (let i = 0; i < col; i++) x += t.colWidths[i];
  let y = 0;
  for (let i = 0; i < row; i++) y += t.rowHeights[i];
  return { x, y, width: t.colWidths[col], height: t.rowHeights[row] };
}

/** Find which cell contains a table-local point. Returns null if outside. */
export function hitTestCell(
  t: TableShape,
  localX: number,
  localY: number,
): { row: number; col: number } | null {
  if (localX < 0 || localY < 0) return null;
  const { width, height } = tableBBox(t);
  if (localX > width || localY > height) return null;
  let cx = 0;
  let col = -1;
  for (let i = 0; i < t.colWidths.length; i++) {
    if (localX < cx + t.colWidths[i]) {
      col = i;
      break;
    }
    cx += t.colWidths[i];
  }
  let cy = 0;
  let row = -1;
  for (let i = 0; i < t.rowHeights.length; i++) {
    if (localY < cy + t.rowHeights[i]) {
      row = i;
      break;
    }
    cy += t.rowHeights[i];
  }
  if (row < 0 || col < 0) return null;
  return { row, col };
}

/** Distribute `total` evenly across `count` slots, rounding to ints summing
 *  back to total (last slot absorbs the remainder). Used by drag-to-draw. */
export function distributeWidths(total: number, count: number): number[] {
  if (count <= 0) return [];
  const safeTotal = Math.max(count, Math.floor(total));
  const base = Math.floor(safeTotal / count);
  const out = Array(count).fill(base);
  out[count - 1] = Math.max(1, safeTotal - base * (count - 1));
  return out;
}

export function replaceCell(
  cells: TableCell[][],
  row: number,
  col: number,
  patch: Partial<TableCell>,
): TableCell[][] {
  return cells.map((r, ri) =>
    ri !== row ? r : r.map((c, ci) => (ci !== col ? c : { ...c, ...patch }))
  );
}

export function setCellText(
  t: TableShape,
  row: number,
  col: number,
  next: TextContent,
): Partial<TableShape> {
  const existing = t.cells[row]?.[col] ?? {};
  return {
    cells: replaceCell(t.cells, row, col, { ...existing, text: next }),
  };
}

export function setCellBg(
  t: TableShape,
  row: number,
  col: number,
  bgColor: string | undefined,
): Partial<TableShape> {
  const existing = t.cells[row]?.[col] ?? {};
  return {
    cells: replaceCell(t.cells, row, col, { ...existing, bgColor }),
  };
}

/** Insert a fresh row at `atIndex` (0..rows). Existing rows at and beyond
 *  shift down. The new row inherits the row-height that's most common
 *  (mode), falling back to the table defaults' rowHeight. */
export function addRow(
  t: TableShape,
  atIndex: number,
  rowHeight?: number,
): Partial<TableShape> {
  const rows = t.cells.length;
  const i = Math.max(0, Math.min(rows, atIndex));
  const cols = t.colWidths.length;
  const newRow: TableCell[] = Array.from({ length: cols }, () => ({}));
  const cells = [...t.cells.slice(0, i), newRow, ...t.cells.slice(i)];
  const h = rowHeight ?? t.rowHeights[Math.min(rows - 1, i)] ?? 36;
  const rowHeights = [...t.rowHeights.slice(0, i), h, ...t.rowHeights.slice(i)];
  return { cells, rowHeights };
}

export function addCol(
  t: TableShape,
  atIndex: number,
  colWidth?: number,
): Partial<TableShape> {
  const cols = t.colWidths.length;
  const i = Math.max(0, Math.min(cols, atIndex));
  const cells = t.cells.map((r) => [
    ...r.slice(0, i),
    {} as TableCell,
    ...r.slice(i),
  ]);
  const w = colWidth ?? t.colWidths[Math.min(cols - 1, i)] ?? 120;
  const colWidths = [...t.colWidths.slice(0, i), w, ...t.colWidths.slice(i)];
  return { cells, colWidths };
}

export function deleteRow(t: TableShape, atIndex: number): Partial<TableShape> {
  if (t.cells.length <= 1) return {}; // refuse to delete the last row
  const i = Math.max(0, Math.min(t.cells.length - 1, atIndex));
  return {
    cells: [...t.cells.slice(0, i), ...t.cells.slice(i + 1)],
    rowHeights: [...t.rowHeights.slice(0, i), ...t.rowHeights.slice(i + 1)],
  };
}

export function deleteCol(t: TableShape, atIndex: number): Partial<TableShape> {
  if (t.colWidths.length <= 1) return {};
  const i = Math.max(0, Math.min(t.colWidths.length - 1, atIndex));
  return {
    cells: t.cells.map((r) => [...r.slice(0, i), ...r.slice(i + 1)]),
    colWidths: [...t.colWidths.slice(0, i), ...t.colWidths.slice(i + 1)],
  };
}

/** Resolve the border for an interior vertical edge (between col and col+1
 *  at row r). Returns null when the edge is invisible (weight 0). */
export function resolveVBorder(
  t: TableShape,
  row: number,
  colBoundary: number,
): TableBorder | null {
  const key = `${row}-${colBoundary}`;
  const override = t.borders?.v?.[key];
  const b = override ?? t.defaultBorder;
  if (!b || b.weight <= 0) return null;
  return b;
}

export function resolveHBorder(
  t: TableShape,
  rowBoundary: number,
  col: number,
): TableBorder | null {
  const key = `${rowBoundary}-${col}`;
  const override = t.borders?.h?.[key];
  const b = override ?? t.defaultBorder;
  if (!b || b.weight <= 0) return null;
  return b;
}
