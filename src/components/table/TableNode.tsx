import { Group, Rect, Shape as KShape, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { TableShape } from "../../types";
import {
  cellBBox,
  hitTestCell,
  resolveHBorder,
  resolveVBorder,
  tableBBox,
} from "../../lib/tableLayout";

/**
 * Konva renderer for a TableShape. Internal layout:
 *   1. Cell-backgrounds shape  (single sceneFunc — header tints + per-cell bgColor)
 *   2. Borders shape           (single sceneFunc — outer outline + interior grid + overrides)
 *   3. Per-cell <Text>         (only for non-empty cells; suppressed for the cell currently being edited)
 *   4. Selection ring          (only when selected — draws on top of borders)
 *   5. Hit-area Rect           (transparent, captures click/dblclick across the whole table)
 *
 * Drag handlers are passed in already-bound from the parent ShapeNode so we
 * inherit the same cross-sheet reparenting + group-drag semantics as every
 * other shape.
 */
export function TableNode({
  table,
  selected,
  accent,
  draggable,
  editingCell,
  onSelect,
  onDblClickCell,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  table: TableShape;
  selected: boolean;
  accent: string;
  draggable: boolean;
  /** When set, suppresses the Konva <Text> for that cell so the textarea
   *  overlay doesn't double-paint. */
  editingCell: { row: number; col: number } | null;
  onSelect: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDblClickCell: (row: number, col: number) => void;
  onDragStart: (e: KonvaEventObject<DragEvent>) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
}) {
  const { width, height } = tableBBox(table);
  const headerBg = "#f4f4f5";
  const tableFill = table.fill ?? "#ffffff";

  function handleDblClick(e: KonvaEventObject<MouseEvent | TouchEvent>) {
    // Resolve the pointer in this Group's local coords — accounts for the
    // table's rotation + the parent sheet's transform automatically.
    const local = (
      e.currentTarget as unknown as { getRelativePointerPosition?: () =>
        | { x: number; y: number }
        | null }
    ).getRelativePointerPosition?.();
    if (!local) return;
    const hit = hitTestCell(table, local.x, local.y);
    if (!hit) return;
    onDblClickCell(hit.row, hit.col);
  }

  return (
    <Group
      id={table.id}
      x={table.x}
      y={table.y}
      rotation={table.rotation ?? 0}
      draggable={draggable && !table.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      {/* 1. Cell backgrounds */}
      <KShape
        listening={false}
        sceneFunc={(ctx) => {
          let y = 0;
          for (let r = 0; r < table.cells.length; r++) {
            let x = 0;
            const rowCells = table.cells[r];
            for (let c = 0; c < rowCells.length; c++) {
              const cell = rowCells[c];
              const isHeader =
                (table.headerRow && r === 0) || (table.headerCol && c === 0);
              const fill = cell.bgColor ?? (isHeader ? headerBg : tableFill);
              ctx.fillStyle = fill;
              ctx.fillRect(x, y, table.colWidths[c], table.rowHeights[r]);
              x += table.colWidths[c];
            }
            y += table.rowHeights[r];
          }
        }}
      />

      {/* 2. Borders */}
      <KShape
        listening={false}
        sceneFunc={(ctx) => {
          // Outer outline: always painted with defaultBorder (or skipped if
          // weight=0). Interior edges are resolved per-edge so per-cell
          // border overrides win without touching neighbours.
          const def = table.defaultBorder;
          if (def && def.weight > 0) {
            ctx.strokeStyle = def.color;
            ctx.lineWidth = def.weight;
            ctx.beginPath();
            ctx.rect(0, 0, width, height);
            ctx.stroke();
          }

          // Vertical interior edges
          let x = 0;
          for (let c = 0; c < table.colWidths.length - 1; c++) {
            x += table.colWidths[c];
            // For each row, resolve the v-border at (row, c+1). To keep the
            // common case fast (uniform default border), we batch by border
            // identity within a column.
            let segStartY = 0;
            let cy = 0;
            let lastBorder: ReturnType<typeof resolveVBorder> = null;
            for (let r = 0; r <= table.rowHeights.length; r++) {
              const b =
                r < table.rowHeights.length
                  ? resolveVBorder(table, r, c + 1)
                  : null;
              if (b !== lastBorder) {
                if (lastBorder) {
                  ctx.strokeStyle = lastBorder.color;
                  ctx.lineWidth = lastBorder.weight;
                  ctx.beginPath();
                  ctx.moveTo(x, segStartY);
                  ctx.lineTo(x, cy);
                  ctx.stroke();
                }
                segStartY = cy;
                lastBorder = b;
              }
              if (r < table.rowHeights.length) cy += table.rowHeights[r];
            }
          }

          // Horizontal interior edges
          let y = 0;
          for (let r = 0; r < table.rowHeights.length - 1; r++) {
            y += table.rowHeights[r];
            let segStartX = 0;
            let cx = 0;
            let lastBorder: ReturnType<typeof resolveHBorder> = null;
            for (let c = 0; c <= table.colWidths.length; c++) {
              const b =
                c < table.colWidths.length
                  ? resolveHBorder(table, r + 1, c)
                  : null;
              if (b !== lastBorder) {
                if (lastBorder) {
                  ctx.strokeStyle = lastBorder.color;
                  ctx.lineWidth = lastBorder.weight;
                  ctx.beginPath();
                  ctx.moveTo(segStartX, y);
                  ctx.lineTo(cx, y);
                  ctx.stroke();
                }
                segStartX = cx;
                lastBorder = b;
              }
              if (c < table.colWidths.length) cx += table.colWidths[c];
            }
          }
        }}
      />

      {/* 3. Cell text (only for non-empty cells, except the one being edited) */}
      {table.cells.flatMap((row, r) =>
        row.map((cell, c) => {
          const t = cell.text;
          if (!t || !t.text) return null;
          if (
            editingCell &&
            editingCell.row === r &&
            editingCell.col === c
          ) {
            return null;
          }
          const bb = cellBBox(table, r, c);
          const isHeader =
            (table.headerRow && r === 0) || (table.headerCol && c === 0);
          const bold = t.bold || isHeader;
          const fontStyle = `${t.italic ? "italic " : ""}${
            bold ? "bold" : "normal"
          }`.trim();
          const padX = 6;
          const padY = 4;
          return (
            <Text
              key={`${r}-${c}`}
              x={bb.x + padX}
              y={bb.y + padY}
              width={Math.max(1, bb.width - padX * 2)}
              height={Math.max(1, bb.height - padY * 2)}
              text={t.text}
              fontFamily={t.font}
              fontSize={t.fontSize}
              fontStyle={fontStyle}
              textDecoration={t.underline ? "underline" : ""}
              fill={t.color}
              align={t.align}
              verticalAlign={t.verticalAlign ?? "top"}
              wrap="word"
              ellipsis
              listening={false}
            />
          );
        })
      )}

      {/* 4. Selection ring — drawn last so it sits above borders + text. */}
      {selected && (
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          stroke={accent}
          strokeWidth={2}
          listening={false}
        />
      )}

      {/* 5. Hit area — captures clicks even on empty cells. Transparent fill
            forces Konva to register hits on the entire table region. */}
      <Rect x={0} y={0} width={width} height={height} fill="transparent" />
    </Group>
  );
}
