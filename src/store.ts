import { create } from "zustand";
import type {
  Board,
  EraserVariant,
  Iteration,
  Orientation,
  PaperSize,
  PenVariant,
  PenVariantSettings,
  Sheet,
  SheetBorder,
  Shape,
  ShapeKind,
  ShapeStyle,
  Tool,
  ViewItem,
} from "./types";
import { paperToPx } from "./lib/paperSizes";

const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;

function defaultShapeStyle(): ShapeStyle {
  return {
    borderEnabled: true,
    borderWeight: 2,
    borderColor: "#2c2a27",
    borderStyle: "solid",
    cornerRadius: 0,
    fillColor: "#0d9488",
    fillOpacity: 1,
  };
}

const A3_LAND = paperToPx("A3", "landscape");
const SHEET_W = A3_LAND.width;
const SHEET_H = A3_LAND.height;
const SHEET_GAP = 160;

const MIN_SHEET_DIM = 50;
const MAX_SHEET_DIM = 20000;

// Canonicalize the row: recompute every sheet.x from accumulated widths so the
// horizontal gap between consecutive sheets is always exactly SHEET_GAP.
// Preserves sheets[0].x so the viewport doesn't jump when only later sheets
// change. Forces y=0. Pure — returns a new array.
function layoutSheetsRow(sheets: Sheet[]): Sheet[] {
  if (sheets.length === 0) return sheets;
  let cursor = sheets[0].x;
  const out: Sheet[] = [];
  for (const sh of sheets) {
    out.push({ ...sh, x: cursor, y: 0 });
    cursor += sh.width + SHEET_GAP;
  }
  return out;
}

// Clamp dims to [MIN, MAX] and round to integers. Returns null for NaN,
// Infinity, zero, or negative inputs — callers treat null as reject + no-op.
function validateSheetDims(
  w: number,
  h: number
): { w: number; h: number } | null {
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w <= 0 || h <= 0) return null;
  return {
    w: Math.round(Math.min(MAX_SHEET_DIM, Math.max(MIN_SHEET_DIM, w))),
    h: Math.round(Math.min(MAX_SHEET_DIM, Math.max(MIN_SHEET_DIM, h))),
  };
}

// Guard paperToPx: fall back to current dims on unknown size / throw / NaN.
function resolvePaperDims(
  size: PaperSize,
  orientation: Orientation,
  fallback: { width: number; height: number }
): { width: number; height: number } {
  if (size === "custom") return fallback;
  try {
    const d = paperToPx(size, orientation);
    if (!d || !Number.isFinite(d.width) || !Number.isFinite(d.height))
      return fallback;
    return d;
  } catch {
    return fallback;
  }
}

function nextSheetName(sheets: { name: string }[]): string {
  // Pull the integer N out of any "Sheet N" labels and use max+1.
  // Falls back to sheets.length+1 if nothing parses (so custom-named sheets
  // don't break the sequence).
  let max = 0;
  for (const s of sheets) {
    const m = /^Sheet\s+(\d+)\s*$/.exec(s.name);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `Sheet ${(max || sheets.length) + 1}`;
}

function defaultBorder(): SheetBorder {
  return {
    weight: 0,
    color: "#1A1A1A",
    style: "solid",
    sides: { top: false, right: false, bottom: false, left: false },
    offsets: { top: 0, right: 0, bottom: 0, left: 0 },
    opacity: 1,
    radius: { tl: 0, tr: 0, bl: 0, br: 0 },
  };
}

function buildDefaultSheet(i: number, x: number): Sheet {
  return {
    id: `sheet_${i + 1}`,
    name: `Sheet ${i + 1}`,
    width: SHEET_W,
    height: SHEET_H,
    x,
    y: 0,
    background: "#ffffff",
    paperSize: "A3",
    orientation: "landscape",
    margins: {},
    border: defaultBorder(),
    locked: false,
    hidden: false,
  };
}

const defaultSheets: Sheet[] = Array.from({ length: 6 }, (_, i) =>
  buildDefaultSheet(i, i * (SHEET_W + SHEET_GAP))
);

const defaultShapes: Shape[] = [
  {
    id: uid("shape"),
    type: "rect",
    sheetId: "sheet_1",
    name: "Background",
    visible: true,
    locked: false,
    x: 0,
    y: 0,
    width: SHEET_W,
    height: SHEET_H,
    fill: "#f5f1e8",
  },
  {
    id: uid("shape"),
    type: "rect",
    sheetId: "sheet_1",
    name: "Picture - A",
    visible: true,
    locked: false,
    x: 80,
    y: 90,
    width: 360,
    height: 220,
    fill: "#0d9488",
  },
  {
    id: uid("shape"),
    type: "rect",
    sheetId: "sheet_1",
    name: "Picture - B",
    visible: true,
    locked: false,
    x: 480,
    y: 90,
    width: 360,
    height: 220,
    fill: "#fdcb6e",
  },
  {
    id: uid("shape"),
    type: "text",
    sheetId: "sheet_1",
    name: "Heading",
    visible: true,
    locked: false,
    x: 80,
    y: 360,
    text: "Welcome to SpaceShow",
    fontSize: 56,
    fill: "#2c2a27",
  },
  {
    id: uid("shape"),
    type: "text",
    sheetId: "sheet_1",
    name: "Subheading",
    visible: true,
    locked: false,
    x: 80,
    y: 440,
    text: "Present your design iterations beautifully.",
    fontSize: 28,
    fill: "#5a5754",
  },
  {
    id: uid("shape"),
    type: "rect",
    sheetId: "sheet_1",
    name: "Picture - C",
    visible: true,
    locked: false,
    x: 880,
    y: 360,
    width: 320,
    height: 260,
    fill: "#0f766e",
  },
];

const defaultBoards: Board[] = [
  { id: "board_1", name: "Board - 1" },
  { id: "board_2", name: "Board - 2" },
];

const defaultIterations: Iteration[] = [
  { id: "iter_1", name: "Iteration 1" },
  { id: "iter_2", name: "Iteration 2" },
  { id: "iter_3", name: "Iteration 3" },
  { id: "iter_4", name: "Iteration 4" },
  { id: "iter_5", name: "Iteration 5" },
];

const palettes = [
  "from-indigo-500 to-purple-500",
  "from-emerald-500 to-teal-500",
  "from-rose-500 to-orange-500",
  "from-sky-500 to-cyan-400",
  "from-amber-500 to-yellow-300",
  "from-fuchsia-500 to-pink-500",
  "from-lime-500 to-emerald-400",
  "from-violet-600 to-indigo-400",
];
const defaultViews: ViewItem[] = Array.from({ length: 12 }, (_, i) => ({
  id: `view_${i + 1}`,
  name: `View ${i + 1}`,
  iterationId: defaultIterations[i % defaultIterations.length].id,
  thumbnail: palettes[i % palettes.length],
  favorite: i % 4 === 0,
  hidden: false,
  addedAt: Date.now() - i * 1000 * 60 * 60 * 24,
}));

export type Filter = "all" | "unhidden" | "favorites" | "hidden";
export type SortOrder = "asc" | "desc";
export type GridMode = "plain" | "dots" | "lines";

// History model: we snapshot only the document (sheets + shapes). Pan/zoom/UI
// flags are not undoable by design.
export interface HistorySnapshot {
  sheets: Sheet[];
  shapes: Shape[];
}

// Clipboard payload — one entry for shapes and one for sheets, kept in-memory
// so paste works within the session. `multi` captures a mixed batch from a
// marquee or Shift+click multi-selection so Cmd+C / Cmd+V round-trip the whole
// set in one go.
export interface ClipboardState {
  shape: Shape | null;
  sheet: { sheet: Omit<Sheet, "id">; shapes: Omit<Shape, "id" | "sheetId">[] } | null;
  multi: {
    shapes: Shape[];
    sheets: { sheet: Omit<Sheet, "id">; shapes: Omit<Shape, "id" | "sheetId">[] }[];
  } | null;
}

interface State {
  // project
  projectName: string;
  presentationName: string;
  // canvas
  tool: Tool;
  zoom: number; // 0..4 (0%..400%)
  pan: { x: number; y: number };
  // structures
  boards: Board[];
  activeBoardId: string;
  sheets: Sheet[];
  shapes: Shape[];
  activeSheetId: string;
  selectedSheetId: string | null;
  selectedShapeId: string | null;
  /**
   * Multi-selection from marquee. Always kept in sync with `selectedShapeId`:
   * single-click selection sets this to `[id]`; clearing selection sets `[]`.
   * Marquee selection is the only path that can populate more than one entry.
   */
  selectedShapeIds: string[];
  /**
   * Multi-selection of sheets. Mirrors `selectedSheetId` on single clicks;
   * populated by Shift+click or marquee when sheets are included.
   */
  selectedSheetIds: string[];
  // panels
  iterations: Iteration[];
  activeIterationId: string;
  views: ViewItem[];
  viewFilter: Filter;
  viewSort: SortOrder;
  // ui
  expandedSheets: Record<string, boolean>;
  showHamburger: boolean;
  showIterationDropdown: boolean;
  comments: { id: string; text: string; ts: number }[];
  showComments: boolean;
  presenting: boolean;
  showLeftSidebar: boolean;
  showRightSidebar: boolean;
  showShortcuts: boolean;
  renamingSheetId: string | null;
  // settings
  showRulerH: boolean;
  showRulerV: boolean;
  gridMode: GridMode;
  gridGap: number;
  showSettings: boolean;
  showProfile: boolean;
  // tool config (used by drawing tools)
  toolColors: Record<string, string>;
  /** Stroke width for new line/shape drawings, in WORLD pixels. Scales with
   *  zoom (Canva-style) — see src/lib/zoom.ts. */
  toolStrokeWidth: number;
  toolFontSize: number;
  /** Eraser radius, in WORLD pixels. Visual cursor scales with zoom; the
   *  hit-test uses this value directly as the world-space radius. */
  eraserSize: number;
  // eraser sub-tool: "stroke" drags to erase pen-family strokes; "object" clicks to delete any shape
  eraserVariant: EraserVariant;
  // pen sub-tool ("pen" / "marker" / "highlighter") with per-variant settings
  penVariant: PenVariant;
  penVariants: Record<PenVariant, PenVariantSettings>;
  // shape sub-tool — drives the next created ShapeShape
  shapeKind: ShapeKind;
  shapeDefaults: ShapeStyle;
  // text-edit overlay — non-null while a shape's in-shape text is being edited
  editingTextShapeId: string | null;
  // clipboard + history
  clipboard: ClipboardState;
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  // actions
  setProjectName: (name: string) => void;
  setPresentationName: (name: string) => void;
  setTool: (t: Tool) => void;
  setZoom: (z: number) => void;
  setPan: (p: { x: number; y: number }) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (factor: number, cx: number, cy: number) => void;
  setActiveBoard: (id: string) => void;
  addBoard: () => void;
  duplicateBoard: () => void;
  setActiveSheet: (id: string) => void;
  selectSheet: (id: string | null) => void;
  addSheet: () => void;
  insertSheetAfter: (id: string) => void;
  duplicateSheet: (id: string) => void;
  deleteSheet: (id: string) => void;
  renameSheet: (id: string, name: string) => void;
  setSheetPaperSize: (id: string, size: PaperSize, orientation: Orientation) => void;
  setSheetCustomSize: (id: string, w: number, h: number) => void;
  setSheetBackground: (id: string, color: string) => void;
  setSheetMargin: (id: string, side: "top" | "right" | "bottom" | "left", value: number | undefined) => void;
  setSheetBorder: (id: string, patch: Partial<SheetBorder>) => void;
  setSheetBorderSide: (id: string, side: "top" | "right" | "bottom" | "left", on: boolean) => void;
  /**
   * Raw position write — bypasses layoutSheetsRow so the user's manual drag
   * is preserved. Next add/delete/duplicate will re-flow via the row layout.
   */
  setSheetPosition: (id: string, x: number, y: number) => void;
  /** Raw rotation (degrees). Normalised into [-180, 180]. */
  setSheetRotation: (id: string, deg: number) => void;
  toggleSheetLocked: (id: string) => void;
  toggleSheetHidden: (id: string) => void;
  toggleSheetExpanded: (id: string) => void;
  setActiveIteration: (id: string) => void;
  setViewFilter: (f: Filter) => void;
  setViewSort: (s: SortOrder) => void;
  toggleViewFavorite: (id: string) => void;
  addShape: (s: Shape) => void;
  updateShape: (id: string, patch: Partial<Shape>) => void;
  deleteShape: (id: string) => void;
  toggleShapeVisible: (id: string) => void;
  toggleShapeLocked: (id: string) => void;
  /**
   * Select a single shape. When the shape has a non-null groupId, the
   * selection auto-expands to every sibling sharing that groupId — unless
   * `bypassGroup` is true (Alt-click).
   */
  selectShape: (id: string | null, bypassGroup?: boolean) => void;
  /**
   * Replace the multi-selection. Also updates `selectedShapeId` to ids[0]
   * (or null). When any id has a non-null groupId, expands to siblings
   * (unless `bypassGroup` is true).
   */
  setSelectedShapeIds: (ids: string[], bypassGroup?: boolean) => void;
  /** Replace the sheet multi-selection. Mirrors `selectedSheetId` to ids[0] (or null). */
  setSelectedSheetIds: (ids: string[]) => void;
  /** Move every shape in the current multi-selection by (dx, dy). */
  moveSelectedShapesBy: (dx: number, dy: number) => void;
  setShowHamburger: (b: boolean) => void;
  setShowIterationDropdown: (b: boolean) => void;
  addComment: (text: string) => void;
  setShowComments: (b: boolean) => void;
  setPresenting: (b: boolean) => void;
  fitAllSheets: (viewportW: number, viewportH: number) => void;
  setShowRulerH: (b: boolean) => void;
  setShowRulerV: (b: boolean) => void;
  setShowRulerBoth: (b: boolean) => void;
  setGridMode: (m: GridMode) => void;
  setGridGap: (n: number) => void;
  setShowSettings: (b: boolean) => void;
  setShowProfile: (b: boolean) => void;
  setToolColor: (tool: string, color: string) => void;
  setToolStrokeWidth: (n: number) => void;
  setToolFontSize: (n: number) => void;
  setEraserSize: (n: number) => void;
  setEraserVariant: (v: EraserVariant) => void;
  setPenVariant: (v: PenVariant) => void;
  setPenVariantColor: (v: PenVariant, color: string) => void;
  setPenVariantWeight: (v: PenVariant, weight: number) => void;
  setPenVariantOpacity: (v: PenVariant, opacity: number) => void;
  setShapeKind: (k: ShapeKind) => void;
  setShapeDefaults: (patch: Partial<ShapeStyle>) => void;
  /** Enter in-shape text-edit mode for the given shape. */
  beginTextEdit: (id: string) => void;
  /** Exit text-edit mode (committed=true means the textarea wrote its value). */
  endTextEdit: () => void;
  /** Assign a new shared groupId to every shape currently in selectedShapeIds. */
  groupSelected: () => void;
  /** Clear groupId on every shape currently in selectedShapeIds. */
  ungroupSelected: () => void;
  // UI flags
  setShowLeftSidebar: (b: boolean) => void;
  setShowRightSidebar: (b: boolean) => void;
  setShowShortcuts: (b: boolean) => void;
  startRenameSheet: (id: string) => void;
  stopRenameSheet: () => void;
  // clipboard (shapes & sheets)
  copyShape: (id: string) => void;
  cutShape: (id: string) => void;
  pasteShape: () => void;
  duplicateShape: (id: string) => void;
  copySheetToClip: (id: string) => void;
  pasteSheetFromClip: () => void;
  /** Copy every currently-selected shape and sheet to clipboard.multi. */
  copyMultiToClip: (shapeIds: string[], sheetIds: string[]) => void;
  /** Paste clipboard.multi — shapes go to the active sheet with +20 offset,
   *  sheets are appended to the row. Selects the pasted items. */
  pasteMultiFromClip: () => void;
  /** Rotate every shape and sheet currently in the multi-selection by `deg`. */
  rotateSelectedBy: (deg: number) => void;
  /** Set visibility/lock flags for the whole multi-selection at once. */
  setMultiVisible: (visible: boolean) => void;
  setMultiLocked: (locked: boolean) => void;
  // history
  beginHistoryCoalesce: (key: string) => void;
  endHistoryCoalesce: () => void;
  undo: () => void;
  redo: () => void;
}

// Actions that mutate document state (sheets/shapes) are wrapped with
// `withHistory` so they push a snapshot onto `past` and clear `future`.
// During a coalescing gesture (e.g. a single pen stroke producing many
// updateShape calls), only the FIRST snapshot is kept so undo rewinds the
// whole gesture as one step.
const HISTORY_LIMIT = 50;
let coalesceKey: string | null = null;
let coalesceFirstPushed = false;

// Helper is module-scoped so actions defined below can close over the store
// handle via a late-bound reference. We assign it right after create() runs.
let storeRef: {
  getState: () => State;
  setState: (
    partial:
      | Partial<State>
      | ((s: State) => Partial<State>)
  ) => void;
} | null = null;

function pushHistory(): void {
  if (!storeRef) return;
  const s = storeRef.getState();
  if (coalesceKey) {
    if (coalesceFirstPushed) return;
    coalesceFirstPushed = true;
  }
  const snap: HistorySnapshot = { sheets: s.sheets, shapes: s.shapes };
  const past = [...s.past, snap];
  if (past.length > HISTORY_LIMIT) past.shift();
  storeRef.setState({ past, future: [] });
}

export const useStore = create<State>((set, get) => ({
  projectName: "Project_Name",
  presentationName: "Presentation_Name",
  tool: "select",
  zoom: 0.6,
  pan: { x: 200, y: 120 },

  boards: defaultBoards,
  activeBoardId: "board_1",
  sheets: defaultSheets,
  shapes: defaultShapes,
  activeSheetId: "sheet_1",
  selectedSheetId: null,
  selectedShapeId: null,
  selectedShapeIds: [],
  selectedSheetIds: [],

  iterations: defaultIterations,
  activeIterationId: "iter_1",
  views: defaultViews,
  viewFilter: "all",
  viewSort: "desc",

  expandedSheets: { sheet_1: true },
  showHamburger: false,
  showIterationDropdown: false,
  comments: [
    { id: uid("c"), text: "Move the heading up a little.", ts: Date.now() - 3600_000 },
    { id: uid("c"), text: "Love the new color palette!", ts: Date.now() - 1800_000 },
  ],
  showComments: false,
  presenting: false,
  showRulerH: true,
  showRulerV: true,
  gridMode: "dots",
  gridGap: 50,
  showSettings: false,
  showProfile: false,
  toolColors: {
    pen: "#2c2a27",
    rect: "#0d9488",
    line: "#2c2a27",
    sticky: "#fdcb6e",
    text: "#2c2a27",
    shape: "#0d9488",
  },
  toolStrokeWidth: 3,
  toolFontSize: 28,
  eraserSize: 20,
  eraserVariant: "stroke",
  penVariant: "pen",
  penVariants: {
    pen:         { color: "#1A73E8", weight: 4,  opacity: 1.0 },
    marker:      { color: "#D32F2F", weight: 8,  opacity: 1.0 },
    highlighter: { color: "#FFEB3B", weight: 20, opacity: 0.6 },
  },
  shapeKind: "rectangle",
  shapeDefaults: defaultShapeStyle(),
  editingTextShapeId: null,
  showLeftSidebar: true,
  showRightSidebar: true,
  showShortcuts: false,
  renamingSheetId: null,
  clipboard: { shape: null, sheet: null, multi: null },
  past: [],
  future: [],

  setProjectName: (name) => set({ projectName: name }),
  setPresentationName: (name) => set({ presentationName: name }),
  setTool: (t) => set({ tool: t }),
  setZoom: (z) => set({ zoom: Math.min(4, Math.max(0.05, z)) }),
  setPan: (p) => set({ pan: p }),
  panBy: (dx, dy) =>
    set((s) => ({ pan: { x: s.pan.x + dx, y: s.pan.y + dy } })),
  zoomAt: (factor, cx, cy) => {
    const { zoom, pan } = get();
    const newZoom = Math.min(4, Math.max(0.05, zoom * factor));
    // keep cx/cy as world-space invariant
    const worldX = (cx - pan.x) / zoom;
    const worldY = (cy - pan.y) / zoom;
    const newPan = { x: cx - worldX * newZoom, y: cy - worldY * newZoom };
    set({ zoom: newZoom, pan: newPan });
  },
  setActiveBoard: (id) => set({ activeBoardId: id }),
  addBoard: () =>
    set((s) => {
      const n = s.boards.length + 1;
      return {
        boards: [...s.boards, { id: uid("board"), name: `Board - ${n}` }],
      };
    }),
  duplicateBoard: () =>
    set((s) => {
      const cur = s.boards.find((b) => b.id === s.activeBoardId);
      if (!cur) return {};
      return {
        boards: [...s.boards, { id: uid("board"), name: `${cur.name} copy` }],
      };
    }),
  setActiveSheet: (id) =>
    set((s) => ({
      activeSheetId: id,
      expandedSheets: { ...s.expandedSheets, [id]: true },
    })),
  selectSheet: (id) =>
    set({ selectedSheetId: id, selectedSheetIds: id ? [id] : [] }),
  setSelectedSheetIds: (ids) =>
    set({ selectedSheetIds: ids, selectedSheetId: ids[0] ?? null }),
  addSheet: () => {
    pushHistory();
    set((s) => {
      const newSheet: Sheet = {
        id: uid("sheet"),
        name: nextSheetName(s.sheets),
        width: SHEET_W,
        height: SHEET_H,
        x: 0,
        y: 0,
        background: "#ffffff",
        paperSize: "A3",
        orientation: "landscape",
        margins: {},
        border: defaultBorder(),
        locked: false,
        hidden: false,
      };
      return {
        sheets: layoutSheetsRow([...s.sheets, newSheet]),
        activeSheetId: newSheet.id,
        selectedSheetId: newSheet.id,
        expandedSheets: { ...s.expandedSheets, [newSheet.id]: true },
      };
    });
  },
  insertSheetAfter: (id) => {
    set((s) => {
      const idx = s.sheets.findIndex((sh) => sh.id === id);
      if (idx === -1) {
        console.warn("[insertSheetAfter] sheet not found:", id);
        return {};
      }
      pushHistory();
      const newSheet: Sheet = {
        id: uid("sheet"),
        name: nextSheetName(s.sheets),
        width: SHEET_W,
        height: SHEET_H,
        x: 0,
        y: 0,
        background: "#ffffff",
        paperSize: "A3",
        orientation: "landscape",
        margins: {},
        border: defaultBorder(),
        locked: false,
        hidden: false,
      };
      const arr = [...s.sheets];
      arr.splice(idx + 1, 0, newSheet);
      return {
        sheets: layoutSheetsRow(arr),
        activeSheetId: newSheet.id,
        selectedSheetId: newSheet.id,
        expandedSheets: { ...s.expandedSheets, [newSheet.id]: true },
      };
    });
  },
  duplicateSheet: (id) => {
    set((s) => {
      const idx = s.sheets.findIndex((sh) => sh.id === id);
      if (idx === -1) {
        console.warn("[duplicateSheet] sheet not found:", id);
        return {};
      }
      pushHistory();
      const src = s.sheets[idx];
      const newSheet: Sheet = {
        ...src,
        id: uid("sheet"),
        name: `${src.name} copy`,
        x: 0,
      };
      const arr = [...s.sheets];
      arr.splice(idx + 1, 0, newSheet);
      // clone shapes from src into the new sheet
      const clonedShapes: Shape[] = s.shapes
        .filter((sh) => sh.sheetId === src.id)
        .map((sh) => ({ ...sh, id: uid("shape"), sheetId: newSheet.id } as Shape));
      return {
        sheets: layoutSheetsRow(arr),
        shapes: [...s.shapes, ...clonedShapes],
        activeSheetId: newSheet.id,
        selectedSheetId: newSheet.id,
        expandedSheets: { ...s.expandedSheets, [newSheet.id]: true },
      };
    });
  },
  deleteSheet: (id) => {
    set((s) => {
      const idx = s.sheets.findIndex((sh) => sh.id === id);
      if (idx === -1) {
        console.warn("[deleteSheet] sheet not found:", id);
        return {};
      }
      pushHistory();
      const sheets = layoutSheetsRow(s.sheets.filter((sh) => sh.id !== id));
      const shapes = s.shapes.filter((sh) => sh.sheetId !== id);
      const nextActive =
        s.activeSheetId === id ? sheets[0]?.id ?? "board" : s.activeSheetId;
      return {
        sheets,
        shapes,
        activeSheetId: nextActive,
        selectedSheetId:
          s.selectedSheetId === id ? null : s.selectedSheetId,
      };
    });
  },
  renameSheet: (id, name) => {
    pushHistory();
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id ? { ...sh, name: name.trim() || sh.name } : sh
      ),
    }));
  },
  setSheetPaperSize: (id, size, orientation) => {
    set((s) => {
      const idx = s.sheets.findIndex((sh) => sh.id === id);
      if (idx === -1) {
        console.warn("[setSheetPaperSize] sheet not found:", id);
        return {};
      }
      const target = s.sheets[idx];
      const raw = resolvePaperDims(size, orientation, {
        width: target.width,
        height: target.height,
      });
      const ok = validateSheetDims(raw.width, raw.height);
      if (!ok) {
        console.warn("[setSheetPaperSize] invalid dims:", raw);
        return {};
      }
      pushHistory();
      const updated = s.sheets.map((sh, i) =>
        i === idx
          ? {
              ...sh,
              paperSize: size,
              orientation,
              width: ok.w,
              height: ok.h,
            }
          : sh
      );
      return { sheets: layoutSheetsRow(updated) };
    });
  },
  setSheetCustomSize: (id, w, h) => {
    set((s) => {
      const idx = s.sheets.findIndex((sh) => sh.id === id);
      if (idx === -1) {
        console.warn("[setSheetCustomSize] sheet not found:", id);
        return {};
      }
      const ok = validateSheetDims(w, h);
      if (!ok) {
        console.warn("[setSheetCustomSize] invalid dims:", { w, h });
        return {};
      }
      pushHistory();
      const updated = s.sheets.map((sh, i) =>
        i === idx
          ? {
              ...sh,
              paperSize: "custom" as PaperSize,
              width: ok.w,
              height: ok.h,
            }
          : sh
      );
      return { sheets: layoutSheetsRow(updated) };
    });
  },
  setSheetBackground: (id, color) => {
    pushHistory();
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id ? { ...sh, background: color } : sh
      ),
    }));
  },
  setSheetMargin: (id, side, value) => {
    pushHistory();
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id
          ? { ...sh, margins: { ...sh.margins, [side]: value } }
          : sh
      ),
    }));
  },
  setSheetBorder: (id, patch) => {
    pushHistory();
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id ? { ...sh, border: { ...sh.border, ...patch } } : sh
      ),
    }));
  },
  setSheetBorderSide: (id, side, on) => {
    pushHistory();
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id
          ? {
              ...sh,
              border: {
                ...sh.border,
                sides: { ...sh.border.sides, [side]: on },
              },
            }
          : sh
      ),
    }));
  },
  setSheetPosition: (id, x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // Deliberately does NOT call layoutSheetsRow — this write is how the user
    // escapes the default row arrangement via a manual drag.
    pushHistory();
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id && !sh.locked
          ? { ...sh, x: Math.round(x), y: Math.round(y) }
          : sh
      ),
    }));
  },
  setSheetRotation: (id, deg) => {
    if (!Number.isFinite(deg)) return;
    // Normalise to [-180, 180] so repeated spins don't drift to huge numbers.
    let d = ((deg % 360) + 360) % 360;
    if (d > 180) d -= 360;
    pushHistory();
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id && !sh.locked ? { ...sh, rotation: d } : sh
      ),
    }));
  },
  toggleSheetLocked: (id) => {
    pushHistory();
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id ? { ...sh, locked: !sh.locked } : sh
      ),
    }));
  },
  toggleSheetHidden: (id) => {
    pushHistory();
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id ? { ...sh, hidden: !sh.hidden } : sh
      ),
    }));
  },
  toggleSheetExpanded: (id) =>
    set((s) => ({
      expandedSheets: { ...s.expandedSheets, [id]: !s.expandedSheets[id] },
    })),
  setActiveIteration: (id) =>
    set({ activeIterationId: id, showIterationDropdown: false }),
  setViewFilter: (f) => set({ viewFilter: f }),
  setViewSort: (s) => set({ viewSort: s }),
  toggleViewFavorite: (id) =>
    set((s) => ({
      views: s.views.map((v) =>
        v.id === id ? { ...v, favorite: !v.favorite } : v
      ),
    })),
  addShape: (sh) => {
    pushHistory();
    set((s) => ({ shapes: [...s.shapes, sh] }));
  },
  updateShape: (id, patch) => {
    pushHistory();
    set((s) => ({
      shapes: s.shapes.map((sh) =>
        sh.id === id ? ({ ...sh, ...patch } as Shape) : sh
      ),
    }));
  },
  deleteShape: (id) => {
    pushHistory();
    set((s) => ({
      shapes: s.shapes.filter((sh) => sh.id !== id),
      selectedShapeId: s.selectedShapeId === id ? null : s.selectedShapeId,
    }));
  },
  toggleShapeVisible: (id) =>
    set((s) => ({
      shapes: s.shapes.map((sh) =>
        sh.id === id ? ({ ...sh, visible: !sh.visible } as Shape) : sh
      ),
    })),
  toggleShapeLocked: (id) =>
    set((s) => ({
      shapes: s.shapes.map((sh) =>
        sh.id === id ? ({ ...sh, locked: !sh.locked } as Shape) : sh
      ),
    })),
  selectShape: (id, bypassGroup) => {
    if (!id) {
      set({ selectedShapeId: null, selectedShapeIds: [] });
      return;
    }
    const s = get();
    const sh = s.shapes.find((x) => x.id === id);
    if (sh && !bypassGroup && sh.groupId) {
      const siblings = s.shapes
        .filter((x) => x.groupId === sh.groupId && x.visible !== false)
        .map((x) => x.id);
      set({ selectedShapeId: id, selectedShapeIds: siblings });
      return;
    }
    set({ selectedShapeId: id, selectedShapeIds: [id] });
  },
  setSelectedShapeIds: (ids, bypassGroup) => {
    if (ids.length === 0) {
      set({ selectedShapeIds: [], selectedShapeId: null });
      return;
    }
    if (bypassGroup) {
      set({ selectedShapeIds: ids, selectedShapeId: ids[0] ?? null });
      return;
    }
    const s = get();
    const groupIds = new Set<string>();
    for (const id of ids) {
      const sh = s.shapes.find((x) => x.id === id);
      if (sh?.groupId) groupIds.add(sh.groupId);
    }
    if (groupIds.size === 0) {
      set({ selectedShapeIds: ids, selectedShapeId: ids[0] ?? null });
      return;
    }
    const expanded = new Set(ids);
    for (const sh of s.shapes) {
      if (sh.groupId && groupIds.has(sh.groupId) && sh.visible !== false) {
        expanded.add(sh.id);
      }
    }
    const out = Array.from(expanded);
    set({ selectedShapeIds: out, selectedShapeId: out[0] ?? null });
  },
  moveSelectedShapesBy: (dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (dx === 0 && dy === 0) return;
    set((s) => {
      const ids = new Set(s.selectedShapeIds);
      if (ids.size === 0) return {};
      return {
        shapes: s.shapes.map((sh) =>
          ids.has(sh.id) && !sh.locked
            ? ({ ...sh, x: sh.x + dx, y: sh.y + dy } as Shape)
            : sh
        ),
      };
    });
  },
  setShowHamburger: (b) => set({ showHamburger: b }),
  setShowIterationDropdown: (b) => set({ showIterationDropdown: b }),
  addComment: (text) =>
    set((s) => ({
      comments: [...s.comments, { id: uid("c"), text, ts: Date.now() }],
    })),
  setShowComments: (b) => set({ showComments: b }),
  setPresenting: (b) => set({ presenting: b }),
  setShowRulerH: (b) => set({ showRulerH: b }),
  setShowRulerV: (b) => set({ showRulerV: b }),
  setShowRulerBoth: (b) => set({ showRulerH: b, showRulerV: b }),
  setGridMode: (m) => set({ gridMode: m }),
  setGridGap: (n) => set({ gridGap: Math.max(10, Math.min(400, Math.round(n))) }),
  setShowSettings: (b) => set({ showSettings: b, showProfile: b ? false : false }),
  setShowProfile: (b) => set({ showProfile: b, showSettings: b ? false : false }),
  setToolColor: (tool, color) =>
    set((s) => ({ toolColors: { ...s.toolColors, [tool]: color } })),
  setToolStrokeWidth: (n) =>
    set({ toolStrokeWidth: Math.max(1, Math.min(100, Math.round(n))) }),
  setPenVariant: (v) => set({ penVariant: v }),
  setPenVariantColor: (v, color) =>
    set((s) => ({
      penVariants: { ...s.penVariants, [v]: { ...s.penVariants[v], color } },
    })),
  setPenVariantWeight: (v, weight) =>
    set((s) => ({
      penVariants: {
        ...s.penVariants,
        [v]: {
          ...s.penVariants[v],
          weight: Math.max(1, Math.min(100, Math.round(weight))),
        },
      },
    })),
  setPenVariantOpacity: (v, opacity) =>
    set((s) => ({
      penVariants: {
        ...s.penVariants,
        [v]: {
          ...s.penVariants[v],
          opacity: Math.max(0, Math.min(1, opacity)),
        },
      },
    })),
  setShapeKind: (k) => set({ shapeKind: k }),
  setShapeDefaults: (patch) =>
    set((s) => ({ shapeDefaults: { ...s.shapeDefaults, ...patch } })),
  beginTextEdit: (id) => set({ editingTextShapeId: id }),
  endTextEdit: () => set({ editingTextShapeId: null }),
  groupSelected: () => {
    const s = get();
    const ids = s.selectedShapeIds;
    if (ids.length < 2) return;
    pushHistory();
    const gid = uid("group");
    set((s2) => ({
      shapes: s2.shapes.map((sh) =>
        ids.includes(sh.id) ? ({ ...sh, groupId: gid } as Shape) : sh
      ),
    }));
  },
  ungroupSelected: () => {
    const s = get();
    const ids = s.selectedShapeIds;
    if (ids.length === 0) return;
    pushHistory();
    set((s2) => ({
      shapes: s2.shapes.map((sh) =>
        ids.includes(sh.id) ? ({ ...sh, groupId: null } as Shape) : sh
      ),
    }));
  },
  setToolFontSize: (n) =>
    set({ toolFontSize: Math.max(8, Math.min(200, Math.round(n))) }),
  setEraserSize: (n) =>
    set({ eraserSize: Math.max(2, Math.min(400, Math.round(n))) }),
  setEraserVariant: (v) => set({ eraserVariant: v }),
  // UI flag setters
  setShowLeftSidebar: (b) => set({ showLeftSidebar: b }),
  setShowRightSidebar: (b) => set({ showRightSidebar: b }),
  setShowShortcuts: (b) => set({ showShortcuts: b }),
  startRenameSheet: (id) => set({ renamingSheetId: id }),
  stopRenameSheet: () => set({ renamingSheetId: null }),

  // Clipboard actions — in-memory; copy/cut never push history.
  copyShape: (id) => {
    const s = get();
    const sh = s.shapes.find((x) => x.id === id);
    if (!sh) return;
    set({ clipboard: { ...s.clipboard, shape: { ...sh } } });
  },
  cutShape: (id) => {
    const s = get();
    const sh = s.shapes.find((x) => x.id === id);
    if (!sh) return;
    pushHistory();
    set({
      clipboard: { ...s.clipboard, shape: { ...sh } },
      shapes: s.shapes.filter((x) => x.id !== id),
      selectedShapeId: s.selectedShapeId === id ? null : s.selectedShapeId,
    });
  },
  pasteShape: () => {
    const s = get();
    const src = s.clipboard.shape;
    if (!src) return;
    pushHistory();
    const copy = {
      ...src,
      id: uid("shape"),
      sheetId: s.activeSheetId,
      x: src.x + 20,
      y: src.y + 20,
    } as Shape;
    set({ shapes: [...s.shapes, copy], selectedShapeId: copy.id });
  },
  duplicateShape: (id) => {
    const s = get();
    const sh = s.shapes.find((x) => x.id === id);
    if (!sh) return;
    pushHistory();
    const copy = {
      ...sh,
      id: uid("shape"),
      x: sh.x + 20,
      y: sh.y + 20,
    } as Shape;
    set({ shapes: [...s.shapes, copy], selectedShapeId: copy.id });
  },
  copySheetToClip: (id) => {
    const s = get();
    const sh = s.sheets.find((x) => x.id === id);
    if (!sh) return;
    const { id: _omit, ...rest } = sh;
    const shapeTemplates = s.shapes
      .filter((x) => x.sheetId === id)
      .map((x) => {
        const { id: _sid, sheetId: _shid, ...sr } = x;
        return sr as Omit<Shape, "id" | "sheetId">;
      });
    set({ clipboard: { ...s.clipboard, sheet: { sheet: rest, shapes: shapeTemplates } } });
  },
  pasteSheetFromClip: () => {
    const s = get();
    const clip = s.clipboard.sheet;
    if (!clip) return;
    pushHistory();
    const anchorId =
      s.selectedSheetId ||
      s.activeSheetId ||
      (s.sheets.length ? s.sheets[s.sheets.length - 1].id : null);
    if (!anchorId) return;
    const idx = s.sheets.findIndex((sh) => sh.id === anchorId);
    if (idx === -1) return;
    const newSheet: Sheet = {
      ...clip.sheet,
      id: uid("sheet"),
      name: nextSheetName(s.sheets),
      x: 0,
      y: 0,
    };
    const arr = [...s.sheets];
    arr.splice(idx + 1, 0, newSheet);
    const clonedShapes: Shape[] = clip.shapes.map((sr) => ({
      ...(sr as Omit<Shape, "id" | "sheetId">),
      id: uid("shape"),
      sheetId: newSheet.id,
    }) as Shape);
    set({
      sheets: layoutSheetsRow(arr),
      shapes: [...s.shapes, ...clonedShapes],
      activeSheetId: newSheet.id,
      selectedSheetId: newSheet.id,
      expandedSheets: { ...s.expandedSheets, [newSheet.id]: true },
    });
  },

  // Multi-selection batch ops. Shortcuts and toolbar buttons call these so
  // Cmd+C / Cmd+V / hide / lock / rotate all apply across a mixed selection
  // of shapes and sheets atomically (single undo step).
  copyMultiToClip: (shapeIds, sheetIds) => {
    const s = get();
    const shapesCopy: Shape[] = s.shapes
      .filter((x) => shapeIds.includes(x.id))
      .map((x) => ({ ...x } as Shape));
    const sheetEntries: {
      sheet: Omit<Sheet, "id">;
      shapes: Omit<Shape, "id" | "sheetId">[];
    }[] = [];
    for (const sid of sheetIds) {
      const sh = s.sheets.find((x) => x.id === sid);
      if (!sh) continue;
      const { id: _omit, ...rest } = sh;
      const shapeTemplates = s.shapes
        .filter((x) => x.sheetId === sid)
        .map((x) => {
          const { id: _sid, sheetId: _shid, ...sr } = x;
          return sr as Omit<Shape, "id" | "sheetId">;
        });
      sheetEntries.push({ sheet: rest, shapes: shapeTemplates });
    }
    if (shapesCopy.length === 0 && sheetEntries.length === 0) return;
    set({
      clipboard: {
        ...s.clipboard,
        multi: { shapes: shapesCopy, sheets: sheetEntries },
      },
    });
  },
  pasteMultiFromClip: () => {
    const s = get();
    const clip = s.clipboard.multi;
    if (!clip) return;
    if (clip.shapes.length === 0 && clip.sheets.length === 0) return;
    pushHistory();
    // Remap each old groupId to a fresh groupId so pasted groups stay grouped
    // but don't accidentally merge with existing on-canvas groups.
    const groupRemap = new Map<string, string>();
    for (const src of clip.shapes) {
      const gid = src.groupId;
      if (gid && !groupRemap.has(gid)) groupRemap.set(gid, uid("group"));
    }
    const pastedShapes: Shape[] = clip.shapes.map((src) => {
      const oldGid = src.groupId;
      const newGid = oldGid ? groupRemap.get(oldGid) ?? null : null;
      return {
        ...src,
        id: uid("shape"),
        sheetId: s.activeSheetId,
        x: src.x + 20,
        y: src.y + 20,
        groupId: newGid,
      } as Shape;
    });
    let nextSheets = [...s.sheets];
    const sheetBornShapes: Shape[] = [];
    const pastedSheetIds: string[] = [];
    for (const entry of clip.sheets) {
      const newSheet: Sheet = {
        ...entry.sheet,
        id: uid("sheet"),
        name: nextSheetName(nextSheets),
        x: 0,
        y: 0,
      };
      nextSheets.push(newSheet);
      pastedSheetIds.push(newSheet.id);
      for (const sr of entry.shapes) {
        sheetBornShapes.push({
          ...(sr as Omit<Shape, "id" | "sheetId">),
          id: uid("shape"),
          sheetId: newSheet.id,
        } as Shape);
      }
    }
    nextSheets = layoutSheetsRow(nextSheets);
    const newShapeIds = pastedShapes.map((x) => x.id);
    set({
      sheets: nextSheets,
      shapes: [...s.shapes, ...pastedShapes, ...sheetBornShapes],
      selectedShapeIds: newShapeIds,
      selectedShapeId: newShapeIds[0] ?? null,
      selectedSheetIds: pastedSheetIds,
      selectedSheetId: pastedSheetIds[0] ?? null,
    });
  },
  rotateSelectedBy: (deg) => {
    if (!Number.isFinite(deg) || deg === 0) return;
    const s = get();
    if (s.selectedShapeIds.length === 0 && s.selectedSheetIds.length === 0) {
      return;
    }
    pushHistory();
    set((s2) => {
      const shapeIds = new Set(s2.selectedShapeIds);
      const sheetIds = new Set(s2.selectedSheetIds);
      return {
        shapes: s2.shapes.map((sh) =>
          shapeIds.has(sh.id) && !sh.locked
            ? ({ ...sh, rotation: ((sh.rotation ?? 0) + deg) } as Shape)
            : sh
        ),
        sheets: s2.sheets.map((sh) => {
          if (!sheetIds.has(sh.id) || sh.locked) return sh;
          let d = (((sh.rotation ?? 0) + deg) % 360 + 360) % 360;
          if (d > 180) d -= 360;
          return { ...sh, rotation: d };
        }),
      };
    });
  },
  setMultiVisible: (visible) => {
    const s = get();
    if (s.selectedShapeIds.length === 0 && s.selectedSheetIds.length === 0) {
      return;
    }
    pushHistory();
    set((s2) => {
      const shapeIds = new Set(s2.selectedShapeIds);
      const sheetIds = new Set(s2.selectedSheetIds);
      return {
        shapes: s2.shapes.map((sh) =>
          shapeIds.has(sh.id) ? ({ ...sh, visible } as Shape) : sh
        ),
        sheets: s2.sheets.map((sh) =>
          sheetIds.has(sh.id) ? { ...sh, hidden: !visible } : sh
        ),
      };
    });
  },
  setMultiLocked: (locked) => {
    const s = get();
    if (s.selectedShapeIds.length === 0 && s.selectedSheetIds.length === 0) {
      return;
    }
    pushHistory();
    set((s2) => {
      const shapeIds = new Set(s2.selectedShapeIds);
      const sheetIds = new Set(s2.selectedSheetIds);
      return {
        shapes: s2.shapes.map((sh) =>
          shapeIds.has(sh.id) ? ({ ...sh, locked } as Shape) : sh
        ),
        sheets: s2.sheets.map((sh) =>
          sheetIds.has(sh.id) ? { ...sh, locked } : sh
        ),
      };
    });
  },

  // History
  beginHistoryCoalesce: (key) => {
    coalesceKey = key;
    coalesceFirstPushed = false;
  },
  endHistoryCoalesce: () => {
    coalesceKey = null;
    coalesceFirstPushed = false;
  },
  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    const future = [{ sheets: s.sheets, shapes: s.shapes }, ...s.future];
    set({
      past: s.past.slice(0, -1),
      future,
      sheets: prev.sheets,
      shapes: prev.shapes,
    });
  },
  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    const past = [...s.past, { sheets: s.sheets, shapes: s.shapes }];
    if (past.length > HISTORY_LIMIT) past.shift();
    set({
      past,
      future: s.future.slice(1),
      sheets: next.sheets,
      shapes: next.shapes,
    });
  },

  fitAllSheets: (vw, vh) => {
    const sheets = get().sheets;
    if (!sheets.length) return;
    const minX = Math.min(...sheets.map((s) => s.x));
    const minY = Math.min(...sheets.map((s) => s.y));
    const maxX = Math.max(...sheets.map((s) => s.x + s.width));
    const maxY = Math.max(...sheets.map((s) => s.y + s.height));
    const w = maxX - minX;
    const h = maxY - minY;
    const padding = 120;
    const scale = Math.min((vw - padding) / w, (vh - padding) / h);
    const z = Math.min(4, Math.max(0.05, scale));
    const pan = {
      x: vw / 2 - ((minX + maxX) / 2) * z,
      y: vh / 2 - ((minY + maxY) / 2) * z,
    };
    set({ zoom: z, pan });
  },
}));

// Late-bind the module-scoped storeRef so `pushHistory` can read the latest
// state and commit past/future snapshots back into the store.
storeRef = {
  getState: () => useStore.getState(),
  setState: (v) => useStore.setState(v),
};

export { uid, SHEET_W, SHEET_H };
