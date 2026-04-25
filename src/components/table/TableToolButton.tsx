import { Table as TableIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore, uid } from "../../store";
import { defaultTable } from "../../lib/tableLayout";
import {
  pickViewportSheetId,
  viewportCenterInSheet,
} from "../../lib/viewInsert";

const PICKER_ROWS = 10;
const PICKER_COLS = 10;

/**
 * Toolbar button + 10×10 grid hover-picker.
 *
 * Mirrors `ShapesToolButton` flyout machinery: 80ms hover-open, 120ms close
 * debounce, outside-click + Escape, auto-close on tool switch.
 *
 * Click on the toolbar button activates the table tool (so the next canvas
 * click+drag draws a table) AND opens the picker. Clicking a cell in the
 * picker drops a centered table at the chosen size and snaps back to Select.
 */
export function TableToolButton() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const tableDims = useStore((s) => s.tableDims);
  const setTableDims = useStore((s) => s.setTableDims);
  const tableDefaults = useStore((s) => s.tableDefaults);
  const addShape = useStore((s) => s.addShape);
  const selectShape = useStore((s) => s.selectShape);

  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const isActive = tool === "table";

  function clearTimers() {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  const scheduleOpen = () => {
    clearTimers();
    hoverTimer.current = window.setTimeout(() => setOpen(true), 80);
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isActive) setOpen(false);
  }, [isActive]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimers(), []);

  function handleButtonClick() {
    clearTimers();
    if (!isActive) {
      setTool("table");
      setOpen(true);
      return;
    }
    setOpen((o) => !o);
  }

  function pickDims(rows: number, cols: number) {
    setTableDims(rows, cols);

    // Drop the table at the viewport center in whichever sheet is most
    // visible. Falls back to a default position when the viewport hasn't
    // been measured yet.
    const sheetId = pickViewportSheetId() ?? "board";
    const center = viewportCenterInSheet(sheetId);
    const w = cols * tableDefaults.defaultColWidth;
    const h = rows * tableDefaults.defaultRowHeight;
    const template = defaultTable({
      rows,
      cols,
      x: center.x - w / 2,
      y: center.y - h / 2,
      sheetId,
      defaults: tableDefaults,
    });
    const id = uid("shape");
    const table = { ...template, id };
    addShape(table);
    selectShape(id);
    setTool("select");
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  }

  const label = hover
    ? `${hover.r + 1} × ${hover.c + 1}`
    : `${tableDims.rows} × ${tableDims.cols}`;

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        title="Table — click to pick a grid, or drag on canvas"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`toolbar-btn ${isActive ? "toolbar-btn-active" : ""}`}
        onClick={handleButtonClick}
      >
        <TableIcon size={16} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Table size"
          className="absolute top-0 left-full ml-2 z-30 panel rounded-xl py-2 px-2 shadow-2xl"
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
        >
          <div
            className="grid gap-px bg-ink-700 p-px rounded"
            style={{ gridTemplateColumns: `repeat(${PICKER_COLS}, 14px)` }}
            onMouseLeave={() => setHover(null)}
          >
            {Array.from({ length: PICKER_ROWS * PICKER_COLS }, (_, i) => {
              const r = Math.floor(i / PICKER_COLS);
              const c = i % PICKER_COLS;
              const lit = !!hover && r <= hover.r && c <= hover.c;
              return (
                <button
                  key={i}
                  role="menuitem"
                  aria-label={`${r + 1} × ${c + 1}`}
                  className={`w-3.5 h-3.5 transition-colors ${
                    lit ? "bg-brand-500" : "bg-ink-900 hover:bg-ink-600"
                  }`}
                  onMouseEnter={() => setHover({ r, c })}
                  onClick={() => pickDims(r + 1, c + 1)}
                />
              );
            })}
          </div>
          <div className="mt-1.5 text-center text-xs text-ink-200">
            {label}
          </div>
        </div>
      )}
    </div>
  );
}
