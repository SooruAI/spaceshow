import { create } from "zustand";
import type {
  Board,
  Iteration,
  Orientation,
  PaperSize,
  Sheet,
  SheetBorder,
  Shape,
  Tool,
  ViewItem,
} from "./types";
import { paperToPx } from "./lib/paperSizes";

const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;

const A3_LAND = paperToPx("A3", "landscape");
const SHEET_W = A3_LAND.width;
const SHEET_H = A3_LAND.height;
const SHEET_GAP = 160;

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
    color: "#000000",
    style: "solid",
    sides: { top: false, right: false, bottom: false, left: false },
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

export type Filter = "all" | "favorites" | "hidden";
export type SortOrder = "asc" | "desc";
export type GridMode = "plain" | "dots" | "lines";

interface State {
  // project
  projectName: string;
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
  // settings
  showRulerH: boolean;
  showRulerV: boolean;
  gridMode: GridMode;
  gridGap: number;
  showSettings: boolean;
  showProfile: boolean;
  // tool config (used by drawing tools)
  toolColors: Record<string, string>;
  toolStrokeWidth: number;
  toolFontSize: number;
  eraserSize: number;

  // actions
  setProjectName: (name: string) => void;
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
  selectShape: (id: string | null) => void;
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
}

export const useStore = create<State>((set, get) => ({
  projectName: "Project_Name",
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
  },
  toolStrokeWidth: 3,
  toolFontSize: 28,
  eraserSize: 20,

  setProjectName: (name) => set({ projectName: name }),
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
  selectSheet: (id) => set({ selectedSheetId: id }),
  addSheet: () =>
    set((s) => {
      const last = s.sheets[s.sheets.length - 1];
      const lastW = last ? last.width : SHEET_W;
      const newSheet: Sheet = {
        id: uid("sheet"),
        name: nextSheetName(s.sheets),
        width: SHEET_W,
        height: SHEET_H,
        x: last ? last.x + lastW + SHEET_GAP : 0,
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
        sheets: [...s.sheets, newSheet],
        activeSheetId: newSheet.id,
        selectedSheetId: newSheet.id,
        expandedSheets: { ...s.expandedSheets, [newSheet.id]: true },
      };
    }),
  insertSheetAfter: (id) =>
    set((s) => {
      const idx = s.sheets.findIndex((sh) => sh.id === id);
      if (idx === -1) return {};
      const anchor = s.sheets[idx];
      const newSheet: Sheet = {
        id: uid("sheet"),
        name: nextSheetName(s.sheets),
        width: SHEET_W,
        height: SHEET_H,
        x: anchor.x + anchor.width + SHEET_GAP,
        y: 0,
        background: "#ffffff",
        paperSize: "A3",
        orientation: "landscape",
        margins: {},
        border: defaultBorder(),
        locked: false,
        hidden: false,
      };
      const shift = newSheet.width + SHEET_GAP;
      const sheets = s.sheets.map((sh, i) =>
        i > idx ? { ...sh, x: sh.x + shift } : sh
      );
      sheets.splice(idx + 1, 0, newSheet);
      return {
        sheets,
        activeSheetId: newSheet.id,
        selectedSheetId: newSheet.id,
        expandedSheets: { ...s.expandedSheets, [newSheet.id]: true },
      };
    }),
  duplicateSheet: (id) =>
    set((s) => {
      const idx = s.sheets.findIndex((sh) => sh.id === id);
      if (idx === -1) return {};
      const src = s.sheets[idx];
      const newSheet: Sheet = {
        ...src,
        id: uid("sheet"),
        name: `${src.name} copy`,
        x: src.x + src.width + SHEET_GAP,
      };
      const shift = newSheet.width + SHEET_GAP;
      const sheets = s.sheets.map((sh, i) =>
        i > idx ? { ...sh, x: sh.x + shift } : sh
      );
      sheets.splice(idx + 1, 0, newSheet);
      // clone shapes from src into the new sheet
      const clonedShapes: Shape[] = s.shapes
        .filter((sh) => sh.sheetId === src.id)
        .map((sh) => ({ ...sh, id: uid("shape"), sheetId: newSheet.id } as Shape));
      return {
        sheets,
        shapes: [...s.shapes, ...clonedShapes],
        activeSheetId: newSheet.id,
        selectedSheetId: newSheet.id,
        expandedSheets: { ...s.expandedSheets, [newSheet.id]: true },
      };
    }),
  deleteSheet: (id) =>
    set((s) => {
      const idx = s.sheets.findIndex((sh) => sh.id === id);
      if (idx === -1) return {};
      const removed = s.sheets[idx];
      const shift = removed.width + SHEET_GAP;
      const sheets = s.sheets
        .filter((sh) => sh.id !== id)
        .map((sh, i) => (i >= idx ? { ...sh, x: sh.x - shift } : sh));
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
    }),
  renameSheet: (id, name) =>
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id ? { ...sh, name: name.trim() || sh.name } : sh
      ),
    })),
  setSheetPaperSize: (id, size, orientation) =>
    set((s) => {
      const idx = s.sheets.findIndex((sh) => sh.id === id);
      if (idx === -1) return {};
      const target = s.sheets[idx];
      const dims =
        size === "custom"
          ? { width: target.width, height: target.height }
          : paperToPx(size, orientation);
      const oldW = target.width;
      const newW = dims.width;
      const dx = newW - oldW;
      const sheets = s.sheets.map((sh, i) => {
        if (i === idx) {
          return {
            ...sh,
            paperSize: size,
            orientation,
            width: dims.width,
            height: dims.height,
          };
        }
        if (i > idx) return { ...sh, x: sh.x + dx };
        return sh;
      });
      return { sheets };
    }),
  setSheetCustomSize: (id, w, h) =>
    set((s) => {
      const idx = s.sheets.findIndex((sh) => sh.id === id);
      if (idx === -1) return {};
      const target = s.sheets[idx];
      const dx = w - target.width;
      const sheets = s.sheets.map((sh, i) => {
        if (i === idx)
          return { ...sh, paperSize: "custom" as PaperSize, width: w, height: h };
        if (i > idx) return { ...sh, x: sh.x + dx };
        return sh;
      });
      return { sheets };
    }),
  setSheetBackground: (id, color) =>
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id ? { ...sh, background: color } : sh
      ),
    })),
  setSheetMargin: (id, side, value) =>
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id
          ? { ...sh, margins: { ...sh.margins, [side]: value } }
          : sh
      ),
    })),
  setSheetBorder: (id, patch) =>
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id ? { ...sh, border: { ...sh.border, ...patch } } : sh
      ),
    })),
  setSheetBorderSide: (id, side, on) =>
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
    })),
  toggleSheetLocked: (id) =>
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id ? { ...sh, locked: !sh.locked } : sh
      ),
    })),
  toggleSheetHidden: (id) =>
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === id ? { ...sh, hidden: !sh.hidden } : sh
      ),
    })),
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
  addShape: (sh) => set((s) => ({ shapes: [...s.shapes, sh] })),
  updateShape: (id, patch) =>
    set((s) => ({
      shapes: s.shapes.map((sh) =>
        sh.id === id ? ({ ...sh, ...patch } as Shape) : sh
      ),
    })),
  deleteShape: (id) =>
    set((s) => ({
      shapes: s.shapes.filter((sh) => sh.id !== id),
      selectedShapeId: s.selectedShapeId === id ? null : s.selectedShapeId,
    })),
  toggleShapeVisible: (id) =>
    set((s) => ({
      shapes: s.shapes.map((sh) =>
        sh.id === id ? ({ ...sh, visible: !sh.visible } as Shape) : sh
      ),
    })),
  selectShape: (id) => set({ selectedShapeId: id }),
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
    set({ toolStrokeWidth: Math.max(1, Math.min(40, Math.round(n))) }),
  setToolFontSize: (n) =>
    set({ toolFontSize: Math.max(8, Math.min(200, Math.round(n))) }),
  setEraserSize: (n) =>
    set({ eraserSize: Math.max(4, Math.min(100, Math.round(n))) }),
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

export { uid, SHEET_W, SHEET_H };
