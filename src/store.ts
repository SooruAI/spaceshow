import { create } from "zustand";
import type {
  Attachment,
  Board,
  BulletStyle,
  Comment,
  CommentsView,
  EraserVariant,
  Guide,
  Iteration,
  LineMarkerKind,
  LinePattern,
  LineRouting,
  ListStyle,
  NumberStyle,
  Orientation,
  PaperSize,
  PenVariant,
  PenVariantSettings,
  Sheet,
  SheetBorder,
  Shape,
  ShapeKind,
  ShapeStyle,
  Thread,
  TipTapDoc,
  Tool,
  User,
  ViewItem,
} from "./types";
import { paperToPx } from "./lib/paperSizes";
import { DEFAULT_TEXT_FONT } from "./lib/fonts";

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
    type: "shape",
    kind: "rectangle",
    sheetId: "sheet_1",
    name: "Heading",
    visible: true,
    locked: false,
    x: 80,
    y: 360,
    width: 800,
    height: 80,
    style: {
      borderEnabled: false,
      borderWeight: 0,
      borderColor: "#2c2a27",
      borderStyle: "solid",
      cornerRadius: 0,
      fillColor: "#ffffff",
      fillOpacity: 0,
    },
    text: {
      text: "Welcome to SpaceShow",
      font: DEFAULT_TEXT_FONT,
      fontSize: 56,
      color: "#2c2a27",
      bold: false,
      italic: false,
      underline: false,
      align: "left",
      bullets: "none",
      indent: 0,
    },
  },
  {
    id: uid("shape"),
    type: "shape",
    kind: "rectangle",
    sheetId: "sheet_1",
    name: "Subheading",
    visible: true,
    locked: false,
    x: 80,
    y: 440,
    width: 800,
    height: 50,
    style: {
      borderEnabled: false,
      borderWeight: 0,
      borderColor: "#2c2a27",
      borderStyle: "solid",
      cornerRadius: 0,
      fillColor: "#ffffff",
      fillOpacity: 0,
    },
    text: {
      text: "Present your design iterations beautifully.",
      font: DEFAULT_TEXT_FONT,
      fontSize: 28,
      color: "#5a5754",
      bold: false,
      italic: false,
      underline: false,
      align: "left",
      bullets: "none",
      indent: 0,
    },
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

// ── Comments seed data ─────────────────────────────────────────────────────
const defaultUsers: User[] = [
  { id: "user_me",  name: "You",           avatarUrl: "", color: "#0d9488" },
  { id: "user_ana", name: "Ana Velasquez", avatarUrl: "", color: "#8b5cf6" },
  { id: "user_ben", name: "Ben Okafor",    avatarUrl: "", color: "#f97316" },
];

// Small TipTap JSON doc shortcut for seed comments (plain paragraphs).
function seedDoc(text: string): TipTapDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const SEED_THREAD_1 = "thread_seed_1";
const SEED_THREAD_2 = "thread_seed_2";
const SEED_COMMENT_1 = "comment_seed_1";
const SEED_COMMENT_2 = "comment_seed_2";
const SEED_COMMENT_3 = "comment_seed_3";

const defaultThreads: Thread[] = [
  {
    id: SEED_THREAD_1,
    canvasId: "sheet_1",
    coordinates: { x: 160, y: 120 },
    status: "open",
    createdAt: Date.now() - 1000 * 60 * 60 * 4,
  },
  {
    id: SEED_THREAD_2,
    canvasId: "sheet_1",
    coordinates: { x: 980, y: 500 },
    status: "open",
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
  },
];

const defaultComments: Comment[] = [
  {
    id: SEED_COMMENT_1,
    threadId: SEED_THREAD_1,
    authorId: "user_ana",
    content: seedDoc("Can we nudge the heading up a touch?"),
    createdAt: Date.now() - 1000 * 60 * 60 * 4,
    parentId: null,
  },
  {
    id: SEED_COMMENT_2,
    threadId: SEED_THREAD_1,
    authorId: "user_me",
    content: seedDoc("Yeah, I'll move it 16px."),
    createdAt: Date.now() - 1000 * 60 * 60 * 3.5,
    parentId: SEED_COMMENT_1,
  },
  {
    id: SEED_COMMENT_3,
    threadId: SEED_THREAD_2,
    authorId: "user_ben",
    content: seedDoc("Love the new palette — does it hold up in dark mode?"),
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
    parentId: null,
  },
];

const defaultAttachments: Attachment[] = [];

export type Filter = "all" | "unhidden" | "favorites" | "hidden";
export type SortOrder = "asc" | "desc";
export type GridMode = "plain" | "dots" | "lines";

// History model: we snapshot only the document (sheets + shapes + guides).
// Pan/zoom/UI flags are not undoable by design.
export interface HistorySnapshot {
  sheets: Sheet[];
  shapes: Shape[];
  guides: Guide[];
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
   * Anchor for Shift-click range selection in the sidebar. Every plain click
   * (no Shift/Cmd) in the sidebar updates this to the clicked row's id so a
   * subsequent Shift+click can compute the inclusive range. Null when there's
   * no meaningful anchor (e.g. just booted, or selection cleared).
   */
  lastAnchorShapeId: string | null;
  /**
   * Per-group metadata indexed by groupId. The group itself exists implicitly
   * when ≥ 2 shapes share a `groupId`; this dict adds display names + optional
   * color swatches so groups can be renamed in the sidebar. Entries are
   * created by `groupSelected` and GC'd by `ungroupSelected` when the last
   * member leaves. An absent entry falls back to `Group <n>` in the UI.
   */
  groupMeta: Record<string, { name: string; color?: string }>;
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
  /** Which tab is active in the left sidebar. "layers" preserves today's
   *  tree UX by default; "sheets" shows the thumbnail-based sheet navigator. */
  leftSidebarTab: "sheets" | "layers";
  /** How sheets are laid out in the Sheets tab. "list" is the compact row
   *  default; "grid" shows each sheet as a large card with a big thumbnail. */
  sheetsViewMode: "list" | "grid";
  showHamburger: boolean;
  showIterationDropdown: boolean;
  // ── Comments (spatial threads) ───────────────────────────────────────────
  /** Pins on the canvas. Each thread owns ≥ 1 Comment (the root) plus replies. */
  threads: Thread[];
  /** All comments across all threads. parentId=null marks the thread's root. */
  comments: Comment[];
  /** All attachments across all comments. */
  attachments: Attachment[];
  /** Seeded mock user list — stands in for auth in v1. */
  users: User[];
  /** The "you" id. Used as authorId for new comments. */
  currentUserId: string;
  showComments: boolean;
  /** Whether the sidebar is showing the thread list or a single thread. */
  commentsView: CommentsView;
  /** Focused thread id. Invariant: null ⇔ commentsView === "list". */
  activeThreadId: string | null;
  /** Hovered pin/row — drives cross-highlight between canvas + sidebar. */
  hoverThreadId: string | null;
  /** After dropping a new pin, the composer watches this to auto-focus. */
  pendingFocusThreadId: string | null;
  // ---- SpacePresent (presentation mode) -------------------------------------
  // Finite state machine. "idle" = editor, "selecting" = sheet-pick modal,
  // "presenting" = fullscreen slideshow, "ended" = end-of-present overlay.
  presentationStatus: "idle" | "selecting" | "presenting" | "ended";
  /** Which sheets are listed in the selection modal. */
  presentationSheetFilter: "unhidden" | "all" | "hidden";
  /** Sheet ids included in the slideshow (order defines slide order). */
  presentationSelectedIds: string[];
  /** 0-based index into presentationSelectedIds while presenting. */
  presentationIndex: number;
  /** Active presenter tool — drives cursor rendering + pen canvas input. */
  presentationTool: "cursor" | "pen" | "torch" | "eraser";
  /** Pen stroke color (screen-space). */
  presentationPenColor: string;
  /** Pen stroke weight in screen px (pen canvas is screen-space, not world). */
  presentationPenWeight: number;
  /** Pen stroke opacity, 0.1..1. Applied per stroke at draw time. */
  presentationPenOpacity: number;
  /** Which eraser behavior the tool performs: pixel-level (destination-out)
   *  or object-level (hit-test + remove whole strokes). */
  presentationEraserMode: "pixel" | "object";
  /** Eraser brush width in screen px (pixel mode only; object mode uses a
   *  fixed internal pick radius). */
  presentationEraserWidth: number;
  /** Monotonic counter that increments every time the presenter's "Clear
   *  all" action runs. PresenterView folds it into the PenOverlay's `key`
   *  so the overlay remounts and drops every stroke without threading the
   *  stroke array out of the component. Nothing else reads it. */
  presentationClearNonce: number;
  showLeftSidebar: boolean;
  showRightSidebar: boolean;
  showShortcuts: boolean;
  renamingSheetId: string | null;
  renamingShapeId: string | null;
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
  /** CSS font-family string used as the default for the next text element. */
  toolFont: string;
  /** Formatting defaults applied to the next text element (and editable from
   *  the floating bar while the text tool is active without an open edit). */
  toolTextDefaults: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    align: "left" | "center" | "right";
    bullets: ListStyle;
    indent: number;
    bgColor?: string;
    bulletStyle?: BulletStyle;
    numberStyle?: NumberStyle;
  };
  /** Eraser radius, in WORLD pixels. Visual cursor scales with zoom; the
   *  hit-test uses this value directly as the world-space radius. */
  eraserSize: number;
  // eraser sub-tool: "stroke" drags to erase pen-family strokes; "object" clicks to delete any shape
  eraserVariant: EraserVariant;
  // pen sub-tool ("pen" / "marker" / "highlighter") with per-variant settings
  penVariant: PenVariant;
  penVariants: Record<PenVariant, PenVariantSettings>;
  // line tool — config surfaced by the floating LineToolMenu. Rendering of
  // routing/pattern/markers/opacity is staged: only weight + color are live
  // today; the remaining fields are persisted so the follow-up renderer can
  // pick them up without migrating stored state.
  lineRouting: LineRouting;
  lineWeight: number;      // 0..10 world-px
  linePattern: LinePattern;
  lineStartMarker: LineMarkerKind;
  lineEndMarker: LineMarkerKind;
  lineOpacity: number;     // 0..1
  // shape sub-tool — drives the next created ShapeShape
  shapeKind: ShapeKind;
  shapeDefaults: ShapeStyle;
  // text-edit overlay — non-null while a shape's in-shape text is being edited
  editingTextShapeId: string | null;
  // clipboard + history
  clipboard: ClipboardState;
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  // guides — global, world-space reference lines (Photoshop/Canva-style).
  // Rendered on top of sheets inside the world transform group.
  guides: Guide[];
  selectedGuideId: string | null;

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
  /**
   * Reorder a sheet within the `sheets` array. Index 0 renders left-most on
   * the row. `moveSheetToTop` / `moveSheetToBottom` jump to the extremes.
   * All four are no-ops (no history push) when the index wouldn't change.
   */
  moveSheetUp: (id: string) => void;
  moveSheetDown: (id: string) => void;
  moveSheetToTop: (id: string) => void;
  moveSheetToBottom: (id: string) => void;
  /**
   * Drag-reorder primitive for sheets. `destIdx` is absolute in the `sheets`
   * array (0 = left-most). No-op + no history push when destination equals
   * source. Re-runs `layoutSheetsRow` after moving.
   */
  moveSheetToIndex: (id: string, destIdx: number) => void;
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
   * Reorder a shape within the `shapes` array, scoped to its own sheet
   * (neighbouring shapes with the same `sheetId`, including `"board"`).
   * Later indices render ON TOP in Konva, so `moveShapeToTop` pushes to the
   * highest in-scope index. No-op (no history push) when already at target.
   */
  moveShapeUp: (id: string) => void;
  moveShapeDown: (id: string) => void;
  moveShapeToTop: (id: string) => void;
  moveShapeToBottom: (id: string) => void;
  /**
   * Drag-reorder primitive: move shape `id` to absolute position `destIdx`
   * inside its (possibly new) scope. `destIdx` is 0-based in the destination
   * scope's filtered list — the sidebar shows that list REVERSED, so callers
   * must translate visual index to scope index (scope.length - 1 - visualIdx).
   * If `destSheetId` differs from the shape's current sheetId, the shape
   * migrates scopes (and its `groupId` is cleared unless `joinGroupId` is
   * provided, in which case it joins that group). No-op + no history push
   * when destination equals source.
   */
  moveShapeToIndex: (
    id: string,
    destIdx: number,
    destSheetId?: string,
    joinGroupId?: string | null
  ) => void;
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
  /** Record the anchor row for subsequent Shift-click range selection. */
  setLastAnchorShapeId: (id: string | null) => void;
  /** Rename a group (stored in `groupMeta`). Empty names are rejected. */
  setGroupName: (gid: string, name: string) => void;
  /** Set/clear a group's swatch color. Pass `undefined` to remove. */
  setGroupColor: (gid: string, color: string | undefined) => void;
  /** Move every shape in the current multi-selection by (dx, dy). */
  moveSelectedShapesBy: (dx: number, dy: number) => void;
  setShowHamburger: (b: boolean) => void;
  setShowIterationDropdown: (b: boolean) => void;
  setShowComments: (b: boolean) => void;
  setCommentsView: (v: CommentsView) => void;
  /** Setting a non-null id auto-switches to focused view. Null returns to list. */
  setActiveThread: (id: string | null) => void;
  setHoverThreadId: (id: string | null) => void;
  clearPendingFocus: () => void;
  /** Drop a new pin. Returns the new threadId. Creates an empty thread — the
   *  root Comment is added via addReply(...parentId:null) when the composer
   *  submits. */
  addThread: (args: {
    canvasId: string;
    coordinates: { x: number; y: number };
  }) => string;
  /** Add a comment to a thread. parentId=null = root (first comment in thread).
   *  Returns the new commentId. */
  addReply: (args: {
    threadId: string;
    parentId: string | null;
    content: TipTapDoc;
    attachments?: { fileUrl: string; fileType: "image" | "pdf"; fileName: string }[];
  }) => string;
  addAttachment: (args: {
    commentId: string;
    fileUrl: string;
    fileType: "image" | "pdf";
    fileName: string;
  }) => string;
  resolveThread: (id: string, resolved: boolean) => void;
  deleteThread: (id: string) => void;
  deleteComment: (id: string) => void;
  moveThread: (id: string, coordinates: { x: number; y: number }) => void;
  /** Mutex for the right rail — Views and Comments can't both be docked. */
  openRightPanel: (id: "views" | "comments" | null) => void;
  // ---- SpacePresent actions -------------------------------------------------
  /** Open the sheet-selection modal; seeds selection = every unhidden sheet. */
  startPresentation: () => void;
  /** Close the selection modal, back to idle editor. */
  cancelPresentation: () => void;
  /** Begin the slideshow (only valid when selectedIds is non-empty). */
  confirmPresentation: () => void;
  /** Advance one slide; returns "end" when stepping past the last slide so the
   *  view can trigger its end-of-present fade. Caller does NOT have to call
   *  anything else — this function transitions to "ended" on end. */
  nextSlide: () => "moved" | "end";
  /** Go back one slide; returns "blocked" at slide 0 so the view can trigger
   *  its shake animation. */
  prevSlide: () => "moved" | "blocked";
  /** From the end-of-present screen, jump back to the last slide. */
  returnToLastSlide: () => void;
  /** Exit presentation entirely (from any sub-state). */
  quitPresentation: () => void;
  setPresentationTool: (t: "cursor" | "pen" | "torch" | "eraser") => void;
  setPresentationSheetFilter: (f: "unhidden" | "all" | "hidden") => void;
  togglePresentationSelection: (id: string) => void;
  selectAllPresentation: () => void;
  clearPresentationSelection: () => void;
  /** Set the pen stroke color (any hex). */
  setPresentationPenColor: (color: string) => void;
  /** Set pen stroke weight; clamps to 1..24. */
  setPresentationPenWeight: (weight: number) => void;
  /** Set pen opacity; clamps to 0.1..1. */
  setPresentationPenOpacity: (opacity: number) => void;
  /** Switch between pixel- and object-eraser behavior. */
  setPresentationEraserMode: (mode: "pixel" | "object") => void;
  /** Set eraser width (pixel mode); clamps to 6..48. */
  setPresentationEraserWidth: (width: number) => void;
  /** Clear every pen / eraser stroke on the current slide. Implemented as
   *  a nonce bump — PresenterView remounts the overlay so its local
   *  strokesRef is recreated empty. */
  clearPresentationStrokes: () => void;
  fitAllSheets: (viewportW: number, viewportH: number) => void;
  /** Animated pan+zoom that fits a single sheet inside the viewport with
   *  240px of padding — intentionally roomy so the sheet sits "zoomed a
   *  little outwards" with breathing room, not edge-to-edge. Tweens the
   *  current `zoom` and `pan` to the fit target over ~200ms using easeOutCubic.
   *  Mirrors the `fitAllSheets` math, just over one sheet's bbox. */
  zoomToSheet: (id: string, viewportW: number, viewportH: number) => void;
  setLeftSidebarTab: (tab: "sheets" | "layers") => void;
  setSheetsViewMode: (mode: "list" | "grid") => void;
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
  setToolFont: (v: string) => void;
  setToolTextDefaults: (p: Partial<{
    bold: boolean;
    italic: boolean;
    underline: boolean;
    align: "left" | "center" | "right";
    bullets: ListStyle;
    indent: number;
    bgColor?: string;
    bulletStyle?: BulletStyle;
    numberStyle?: NumberStyle;
  }>) => void;
  setEraserSize: (n: number) => void;
  setEraserVariant: (v: EraserVariant) => void;
  setPenVariant: (v: PenVariant) => void;
  setPenVariantColor: (v: PenVariant, color: string) => void;
  setPenVariantWeight: (v: PenVariant, weight: number) => void;
  setPenVariantOpacity: (v: PenVariant, opacity: number) => void;
  setLineRouting: (r: LineRouting) => void;
  setLineWeight: (w: number) => void;
  setLinePattern: (p: LinePattern) => void;
  setLineStartMarker: (m: LineMarkerKind) => void;
  setLineEndMarker: (m: LineMarkerKind) => void;
  setLineOpacity: (v: number) => void;
  swapLineMarkers: () => void;
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
  /** Clear groupId on every member of `gid` and GC the metadata entry. Unlike
   *  `ungroupSelected`, this acts on a specific group regardless of current
   *  selection — the group row's "Ungroup" menu uses this. */
  ungroupGroup: (gid: string) => void;
  /** Move every member of `gid` up one slot — as a contiguous block, past the
   *  next same-sheet non-member shape. No-op when already at top of scope. */
  moveGroupUp: (gid: string) => void;
  /** Mirror of `moveGroupUp` downwards. */
  moveGroupDown: (gid: string) => void;
  /** Reposition every member of `gid` to the end of their sheet's scope (visual
   *  top of the reversed sidebar list). Members stay contiguous and keep their
   *  internal order. */
  moveGroupToTop: (gid: string) => void;
  /** Mirror of `moveGroupToTop` — members move to the start of the scope. */
  moveGroupToBottom: (gid: string) => void;
  /** Clone every member of `gid` with a fresh shared groupId, offset by (20,
   *  20), and seed a `Group N` metadata entry so the copy is renameable. */
  duplicateGroup: (gid: string) => void;
  /** Delete every member shape of `gid` and GC the metadata entry. */
  deleteGroup: (gid: string) => void;
  // UI flags
  setShowLeftSidebar: (b: boolean) => void;
  setShowRightSidebar: (b: boolean) => void;
  setShowShortcuts: (b: boolean) => void;
  startRenameSheet: (id: string) => void;
  stopRenameSheet: () => void;
  startRenameShape: (id: string) => void;
  stopRenameShape: () => void;
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
  // guides (world-space reference lines)
  /** Create a new guide at `value` (world Y for axis="h", world X for "v").
   *  Pushes history and selects the new guide. Returns the new id. */
  addGuide: (axis: "h" | "v", value: number) => string;
  /** Reposition without history — used on every drag tick. */
  updateGuide: (id: string, value: number) => void;
  /** Called on drag-release. Pushes a single history snapshot if the value
   *  actually changed from the pre-drag snapshot (otherwise no-op). Pass the
   *  value that was captured when the drag started. */
  commitGuide: (id: string, preDragValue: number) => void;
  /** Pushes history and removes the guide. Clears `selectedGuideId` if it
   *  matches the deleted id. */
  deleteGuide: (id: string) => void;
  /** Remove every guide (pushes history only if there were any). */
  clearGuides: () => void;
  setSelectedGuideId: (id: string | null) => void;
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
  const snap: HistorySnapshot = {
    sheets: s.sheets,
    shapes: s.shapes,
    guides: s.guides,
  };
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
  lastAnchorShapeId: null,
  groupMeta: {},

  iterations: defaultIterations,
  activeIterationId: "iter_1",
  views: defaultViews,
  viewFilter: "all",
  viewSort: "desc",

  expandedSheets: { sheet_1: true },
  leftSidebarTab: "layers",
  sheetsViewMode: "list",
  showHamburger: false,
  showIterationDropdown: false,
  threads: defaultThreads,
  comments: defaultComments,
  attachments: defaultAttachments,
  users: defaultUsers,
  currentUserId: "user_me",
  showComments: false,
  commentsView: "list" as CommentsView,
  activeThreadId: null,
  hoverThreadId: null,
  pendingFocusThreadId: null,
  presentationStatus: "idle",
  presentationSheetFilter: "unhidden",
  presentationSelectedIds: [],
  presentationIndex: 0,
  presentationTool: "cursor",
  presentationPenColor: "#0d9488",
  presentationPenWeight: 3,
  presentationPenOpacity: 1,
  presentationEraserMode: "pixel",
  presentationEraserWidth: 16,
  presentationClearNonce: 0,
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
  toolFontSize: 14,
  toolFont: DEFAULT_TEXT_FONT,
  toolTextDefaults: {
    bold: false,
    italic: false,
    underline: false,
    align: "left",
    bullets: "none",
    indent: 0,
    bgColor: undefined,
  },
  eraserSize: 20,
  eraserVariant: "stroke",
  penVariant: "pen",
  penVariants: {
    pen:         { color: "#1A73E8", weight: 4,  opacity: 1.0 },
    marker:      { color: "#D32F2F", weight: 8,  opacity: 1.0 },
    highlighter: { color: "#FFEB3B", weight: 20, opacity: 0.6 },
  },
  lineRouting: "straight",
  lineWeight: 2,
  linePattern: "solid",
  lineStartMarker: "none",
  lineEndMarker: "standardArrow",
  lineOpacity: 1,
  shapeKind: "rectangle",
  shapeDefaults: defaultShapeStyle(),
  editingTextShapeId: null,
  showLeftSidebar: true,
  showRightSidebar: true,
  showShortcuts: false,
  renamingSheetId: null,
  renamingShapeId: null,
  clipboard: { shape: null, sheet: null, multi: null },
  past: [],
  future: [],
  guides: [],
  selectedGuideId: null,

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
    set({
      selectedSheetId: id,
      selectedSheetIds: id ? [id] : [],
      selectedGuideId: id ? null : get().selectedGuideId,
    }),
  setLeftSidebarTab: (tab) => set({ leftSidebarTab: tab }),
  setSheetsViewMode: (mode) => set({ sheetsViewMode: mode }),
  setSelectedSheetIds: (ids) =>
    set({
      selectedSheetIds: ids,
      selectedSheetId: ids[0] ?? null,
      selectedGuideId: ids.length > 0 ? null : get().selectedGuideId,
    }),
  setLastAnchorShapeId: (id) => set({ lastAnchorShapeId: id }),
  setGroupName: (gid, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    pushHistory();
    set((s) => ({
      groupMeta: {
        ...s.groupMeta,
        [gid]: { ...(s.groupMeta[gid] ?? {}), name: trimmed },
      },
    }));
  },
  setGroupColor: (gid, color) => {
    pushHistory();
    set((s) => {
      const cur = s.groupMeta[gid] ?? { name: "" };
      const next = { ...cur, color };
      if (color === undefined) delete next.color;
      return { groupMeta: { ...s.groupMeta, [gid]: next } };
    });
  },
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
  moveSheetUp: (id) => {
    const s = get();
    const idx = s.sheets.findIndex((sh) => sh.id === id);
    if (idx <= 0) return; // already at top or not found
    pushHistory();
    const arr = [...s.sheets];
    const [sh] = arr.splice(idx, 1);
    arr.splice(idx - 1, 0, sh);
    set({ sheets: layoutSheetsRow(arr) });
  },
  moveSheetDown: (id) => {
    const s = get();
    const idx = s.sheets.findIndex((sh) => sh.id === id);
    if (idx === -1 || idx >= s.sheets.length - 1) return;
    pushHistory();
    const arr = [...s.sheets];
    const [sh] = arr.splice(idx, 1);
    arr.splice(idx + 1, 0, sh);
    set({ sheets: layoutSheetsRow(arr) });
  },
  moveSheetToTop: (id) => {
    const s = get();
    const idx = s.sheets.findIndex((sh) => sh.id === id);
    if (idx <= 0) return;
    pushHistory();
    const arr = [...s.sheets];
    const [sh] = arr.splice(idx, 1);
    arr.unshift(sh);
    set({ sheets: layoutSheetsRow(arr) });
  },
  moveSheetToBottom: (id) => {
    const s = get();
    const idx = s.sheets.findIndex((sh) => sh.id === id);
    if (idx === -1 || idx >= s.sheets.length - 1) return;
    pushHistory();
    const arr = [...s.sheets];
    const [sh] = arr.splice(idx, 1);
    arr.push(sh);
    set({ sheets: layoutSheetsRow(arr) });
  },
  moveSheetToIndex: (id, destIdx) => {
    const s = get();
    const srcIdx = s.sheets.findIndex((sh) => sh.id === id);
    if (srcIdx === -1) return;
    // `destIdx` is interpreted in the POST-removal array, so valid range is
    // [0, sheets.length - 1]. If destIdx equals srcIdx, no movement.
    const clamped = Math.max(0, Math.min(destIdx, s.sheets.length - 1));
    if (clamped === srcIdx) return;
    pushHistory();
    const arr = [...s.sheets];
    const [sh] = arr.splice(srcIdx, 1);
    arr.splice(clamped, 0, sh);
    set({ sheets: layoutSheetsRow(arr) });
  },
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
  // Shape reorder helpers — shapes[] order controls z-stacking in Konva
  // (later index = on top). Each move is scoped to siblings with the same
  // sheetId so reordering within Sheet 1 doesn't reshuffle Sheet 2.
  moveShapeUp: (id) => {
    const s = get();
    const idx = s.shapes.findIndex((sh) => sh.id === id);
    if (idx === -1) return;
    const scope = s.shapes[idx].sheetId;
    // next higher-index sibling in same scope
    let target = -1;
    for (let i = idx + 1; i < s.shapes.length; i++) {
      if (s.shapes[i].sheetId === scope) {
        target = i;
        break;
      }
    }
    if (target === -1) return;
    pushHistory();
    const arr = [...s.shapes];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    set({ shapes: arr });
  },
  moveShapeDown: (id) => {
    const s = get();
    const idx = s.shapes.findIndex((sh) => sh.id === id);
    if (idx === -1) return;
    const scope = s.shapes[idx].sheetId;
    let target = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (s.shapes[i].sheetId === scope) {
        target = i;
        break;
      }
    }
    if (target === -1) return;
    pushHistory();
    const arr = [...s.shapes];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    set({ shapes: arr });
  },
  moveShapeToTop: (id) => {
    const s = get();
    const idx = s.shapes.findIndex((sh) => sh.id === id);
    if (idx === -1) return;
    const scope = s.shapes[idx].sheetId;
    // highest-indexed sibling in same scope
    let maxScopeIdx = -1;
    for (let i = 0; i < s.shapes.length; i++) {
      if (s.shapes[i].sheetId === scope) maxScopeIdx = i;
    }
    if (maxScopeIdx === -1 || maxScopeIdx === idx) return;
    pushHistory();
    const arr = [...s.shapes];
    const [sh] = arr.splice(idx, 1);
    // After splice, the highest-scope-index shifts depending on whether idx < maxScopeIdx.
    // Since we just removed one entry at idx <= maxScopeIdx, re-find post-removal.
    let targetInsert = -1;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].sheetId === scope) targetInsert = i;
    }
    // Insert right AFTER targetInsert so the shape becomes the last in scope.
    arr.splice(targetInsert + 1, 0, sh);
    set({ shapes: arr });
  },
  moveShapeToBottom: (id) => {
    const s = get();
    const idx = s.shapes.findIndex((sh) => sh.id === id);
    if (idx === -1) return;
    const scope = s.shapes[idx].sheetId;
    // lowest-indexed sibling in same scope
    let minScopeIdx = -1;
    for (let i = 0; i < s.shapes.length; i++) {
      if (s.shapes[i].sheetId === scope) {
        minScopeIdx = i;
        break;
      }
    }
    if (minScopeIdx === -1 || minScopeIdx === idx) return;
    pushHistory();
    const arr = [...s.shapes];
    const [sh] = arr.splice(idx, 1);
    // Re-find the lowest scope index after removal — if idx < minScopeIdx this is impossible
    // (we'd already have returned); if idx > minScopeIdx then minScopeIdx is unchanged.
    let targetInsert = -1;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].sheetId === scope) {
        targetInsert = i;
        break;
      }
    }
    if (targetInsert === -1) {
      // No other same-scope shapes — just put it back where it was.
      arr.splice(idx, 0, sh);
    } else {
      arr.splice(targetInsert, 0, sh);
    }
    set({ shapes: arr });
  },
  moveShapeToIndex: (id, destIdx, destSheetId, joinGroupId) => {
    const s = get();
    const srcIdx = s.shapes.findIndex((sh) => sh.id === id);
    if (srcIdx === -1) return;
    const src = s.shapes[srcIdx];
    const targetScope = destSheetId ?? src.sheetId;
    // Same-scope early exit: if we aren't migrating sheets AND the current
    // scope-relative position equals destIdx (within the PRE-removal list
    // that excludes the shape itself), nothing would change.
    const scopeIdsBefore = s.shapes
      .filter((sh) => sh.sheetId === targetScope && sh.id !== id)
      .map((sh) => sh.id);
    const clamped = Math.max(0, Math.min(destIdx, scopeIdsBefore.length));
    // Translate destination scope index to absolute `shapes` array index.
    let insertAt = -1;
    if (scopeIdsBefore.length === 0) {
      // Destination scope is empty — just push to the end of the full array.
      insertAt = s.shapes.length - (src.sheetId === targetScope ? 1 : 0);
    } else if (clamped === scopeIdsBefore.length) {
      // Insert AFTER the last scope sibling.
      const lastSiblingId = scopeIdsBefore[scopeIdsBefore.length - 1];
      const arrWithoutSrc = s.shapes.filter((sh) => sh.id !== id);
      insertAt = arrWithoutSrc.findIndex((sh) => sh.id === lastSiblingId) + 1;
    } else {
      const pivotId = scopeIdsBefore[clamped];
      const arrWithoutSrc = s.shapes.filter((sh) => sh.id !== id);
      insertAt = arrWithoutSrc.findIndex((sh) => sh.id === pivotId);
    }
    // No-op check: if migrating NOTHING (same sheet, same groupId intent, same
    // final position), bail before pushHistory.
    const sameSheet = targetScope === src.sheetId;
    const finalGroupId =
      joinGroupId !== undefined ? joinGroupId : sameSheet ? src.groupId : null;
    if (sameSheet && finalGroupId === src.groupId) {
      // Compute what the index would be if we did nothing: srcIdx in the full
      // array. Translate to post-removal coordinates — if insertAt equals
      // srcIdx (or srcIdx-1 when the src is before insertAt), it's a no-op.
      const postRemovalSrcSlot = srcIdx;
      if (insertAt === postRemovalSrcSlot) return;
    }
    pushHistory();
    const arr = [...s.shapes];
    arr.splice(srcIdx, 1);
    const patched: Shape = {
      ...src,
      sheetId: targetScope,
      groupId: finalGroupId,
    } as Shape;
    arr.splice(insertAt, 0, patched);
    set({ shapes: arr });
  },
  selectShape: (id, bypassGroup) => {
    if (!id) {
      set({
        selectedShapeId: null,
        selectedShapeIds: [],
        lastAnchorShapeId: null,
        selectedGuideId: null,
      });
      return;
    }
    const s = get();
    const sh = s.shapes.find((x) => x.id === id);
    if (sh && !bypassGroup && sh.groupId) {
      const siblings = s.shapes
        .filter((x) => x.groupId === sh.groupId && x.visible !== false)
        .map((x) => x.id);
      set({
        selectedShapeId: id,
        selectedShapeIds: siblings,
        lastAnchorShapeId: id,
        selectedGuideId: null,
      });
      return;
    }
    set({
      selectedShapeId: id,
      selectedShapeIds: [id],
      lastAnchorShapeId: id,
      selectedGuideId: null,
    });
  },
  setSelectedShapeIds: (ids, bypassGroup) => {
    if (ids.length === 0) {
      set({ selectedShapeIds: [], selectedShapeId: null });
      return;
    }
    if (bypassGroup) {
      set({
        selectedShapeIds: ids,
        selectedShapeId: ids[0] ?? null,
        selectedGuideId: null,
      });
      return;
    }
    const s = get();
    const groupIds = new Set<string>();
    for (const id of ids) {
      const sh = s.shapes.find((x) => x.id === id);
      if (sh?.groupId) groupIds.add(sh.groupId);
    }
    if (groupIds.size === 0) {
      set({
        selectedShapeIds: ids,
        selectedShapeId: ids[0] ?? null,
        selectedGuideId: null,
      });
      return;
    }
    const expanded = new Set(ids);
    for (const sh of s.shapes) {
      if (sh.groupId && groupIds.has(sh.groupId) && sh.visible !== false) {
        expanded.add(sh.id);
      }
    }
    const out = Array.from(expanded);
    set({
      selectedShapeIds: out,
      selectedShapeId: out[0] ?? null,
      selectedGuideId: null,
    });
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
  // ── Comments actions ────────────────────────────────────────────────────
  // Comment actions intentionally do NOT call pushHistory — resolving or
  // replying to a comment should not be reverted by Cmd+Z on a layout change.
  setShowComments: (b) => set({ showComments: b }),
  setCommentsView: (v) => set({ commentsView: v }),
  setActiveThread: (id) =>
    set({ activeThreadId: id, commentsView: id ? "focused" : "list" }),
  setHoverThreadId: (id) => set({ hoverThreadId: id }),
  clearPendingFocus: () => set({ pendingFocusThreadId: null }),
  addThread: ({ canvasId, coordinates }) => {
    const id = uid("thread");
    set((s) => ({
      threads: [
        ...s.threads,
        {
          id,
          canvasId,
          coordinates,
          status: "open",
          createdAt: Date.now(),
        },
      ],
    }));
    return id;
  },
  addReply: ({ threadId, parentId, content, attachments }) => {
    const commentId = uid("comment");
    const now = Date.now();
    set((s) => {
      const newComment: Comment = {
        id: commentId,
        threadId,
        authorId: s.currentUserId,
        content,
        createdAt: now,
        parentId,
      };
      const newAttachments: Attachment[] = (attachments ?? []).map((a) => ({
        id: uid("attach"),
        commentId,
        ...a,
      }));
      return {
        comments: [...s.comments, newComment],
        attachments: [...s.attachments, ...newAttachments],
      };
    });
    return commentId;
  },
  addAttachment: ({ commentId, fileUrl, fileType, fileName }) => {
    const id = uid("attach");
    set((s) => ({
      attachments: [
        ...s.attachments,
        { id, commentId, fileUrl, fileType, fileName },
      ],
    }));
    return id;
  },
  resolveThread: (id, resolved) =>
    set((s) => ({
      threads: s.threads.map((t) =>
        t.id === id ? { ...t, status: resolved ? "resolved" : "open" } : t
      ),
    })),
  deleteThread: (id) =>
    set((s) => {
      const commentIds = new Set(
        s.comments.filter((c) => c.threadId === id).map((c) => c.id)
      );
      return {
        threads: s.threads.filter((t) => t.id !== id),
        comments: s.comments.filter((c) => c.threadId !== id),
        attachments: s.attachments.filter((a) => !commentIds.has(a.commentId)),
        activeThreadId: s.activeThreadId === id ? null : s.activeThreadId,
        commentsView:
          s.activeThreadId === id ? "list" : s.commentsView,
      };
    }),
  deleteComment: (id) =>
    set((s) => {
      const target = s.comments.find((c) => c.id === id);
      if (!target) return {};
      // If deleting the thread's root comment, cascade the whole thread.
      if (target.parentId === null) {
        const commentIds = new Set(
          s.comments.filter((c) => c.threadId === target.threadId).map((c) => c.id)
        );
        return {
          threads: s.threads.filter((t) => t.id !== target.threadId),
          comments: s.comments.filter((c) => c.threadId !== target.threadId),
          attachments: s.attachments.filter((a) => !commentIds.has(a.commentId)),
          activeThreadId:
            s.activeThreadId === target.threadId ? null : s.activeThreadId,
          commentsView:
            s.activeThreadId === target.threadId ? "list" : s.commentsView,
        };
      }
      return {
        comments: s.comments.filter((c) => c.id !== id),
        attachments: s.attachments.filter((a) => a.commentId !== id),
      };
    }),
  moveThread: (id, coordinates) =>
    set((s) => ({
      threads: s.threads.map((t) => (t.id === id ? { ...t, coordinates } : t)),
    })),
  openRightPanel: (id) =>
    set({
      showComments: id === "comments",
      showRightSidebar: id === "views",
      // Collapsing a focused thread back to list is the friendlier default when
      // closing and re-opening — keeps users oriented in the list overview.
      ...(id !== "comments"
        ? { activeThreadId: null, commentsView: "list" as CommentsView }
        : {}),
    }),
  // ---- SpacePresent actions -------------------------------------------------
  startPresentation: () =>
    set((s) => ({
      presentationStatus: "selecting",
      // Seed selection with every unhidden sheet so the common case
      // ("present everything visible") is one click: just hit Present.
      presentationSelectedIds: s.sheets.filter((sh) => !sh.hidden).map((sh) => sh.id),
      presentationSheetFilter: "unhidden",
      presentationIndex: 0,
      presentationTool: "cursor",
    })),
  cancelPresentation: () =>
    set({ presentationStatus: "idle", presentationSelectedIds: [] }),
  confirmPresentation: () =>
    set((s) => {
      if (s.presentationSelectedIds.length === 0) return {};
      return {
        presentationStatus: "presenting",
        presentationIndex: 0,
        presentationTool: "cursor",
      };
    }),
  nextSlide: () => {
    const s = get();
    const total = s.presentationSelectedIds.length;
    if (s.presentationStatus !== "presenting") return "moved";
    if (s.presentationIndex >= total - 1) {
      set({ presentationStatus: "ended" });
      return "end";
    }
    set({ presentationIndex: s.presentationIndex + 1 });
    return "moved";
  },
  prevSlide: () => {
    const s = get();
    if (s.presentationStatus !== "presenting") return "moved";
    if (s.presentationIndex <= 0) return "blocked";
    set({ presentationIndex: s.presentationIndex - 1 });
    return "moved";
  },
  returnToLastSlide: () =>
    set((s) => ({
      presentationStatus: "presenting",
      presentationIndex: Math.max(0, s.presentationSelectedIds.length - 1),
    })),
  quitPresentation: () =>
    set({
      presentationStatus: "idle",
      presentationSelectedIds: [],
      presentationIndex: 0,
      presentationTool: "cursor",
    }),
  setPresentationTool: (t) => set({ presentationTool: t }),
  setPresentationSheetFilter: (f) => set({ presentationSheetFilter: f }),
  togglePresentationSelection: (id) =>
    set((s) => ({
      presentationSelectedIds: s.presentationSelectedIds.includes(id)
        ? s.presentationSelectedIds.filter((x) => x !== id)
        : [...s.presentationSelectedIds, id],
    })),
  selectAllPresentation: () =>
    set((s) => {
      // "Select all" selects every sheet that matches the current filter —
      // mirrors what the user sees in the list.
      const visible = s.sheets.filter((sh) => {
        if (s.presentationSheetFilter === "unhidden") return !sh.hidden;
        if (s.presentationSheetFilter === "hidden") return sh.hidden;
        return true;
      });
      return { presentationSelectedIds: visible.map((sh) => sh.id) };
    }),
  clearPresentationSelection: () => set({ presentationSelectedIds: [] }),
  setPresentationPenColor: (color) => set({ presentationPenColor: color }),
  setPresentationPenWeight: (weight) =>
    set({ presentationPenWeight: Math.max(1, Math.min(100, Math.round(weight))) }),
  setPresentationPenOpacity: (opacity) =>
    set({ presentationPenOpacity: Math.max(0.1, Math.min(1, opacity)) }),
  setPresentationEraserMode: (mode) => set({ presentationEraserMode: mode }),
  setPresentationEraserWidth: (width) =>
    set({ presentationEraserWidth: Math.max(6, Math.min(48, Math.round(width))) }),
  clearPresentationStrokes: () =>
    set((s) => ({ presentationClearNonce: s.presentationClearNonce + 1 })),
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
  setLineRouting: (r) => set({ lineRouting: r }),
  setLineWeight: (w) =>
    set({ lineWeight: Math.max(0, Math.min(10, Math.round(w * 2) / 2)) }),
  setLinePattern: (p) => set({ linePattern: p }),
  setLineStartMarker: (m) => set({ lineStartMarker: m }),
  setLineEndMarker: (m) => set({ lineEndMarker: m }),
  setLineOpacity: (v) => set({ lineOpacity: Math.max(0, Math.min(1, v)) }),
  swapLineMarkers: () =>
    set((s) => ({
      lineStartMarker: s.lineEndMarker,
      lineEndMarker: s.lineStartMarker,
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
    // Number the new group based on existing metadata entries so the default
    // name is stable and unique within the project.
    const nextNumber = Object.keys(s.groupMeta).length + 1;
    set((s2) => ({
      shapes: s2.shapes.map((sh) =>
        ids.includes(sh.id) ? ({ ...sh, groupId: gid } as Shape) : sh
      ),
      groupMeta: {
        ...s2.groupMeta,
        [gid]: { name: `Group ${nextNumber}` },
      },
    }));
  },
  ungroupSelected: () => {
    const s = get();
    const ids = s.selectedShapeIds;
    if (ids.length === 0) return;
    pushHistory();
    // Capture the set of gids potentially being abandoned. After the shape
    // update we inspect which of those have zero remaining members and GC the
    // matching metadata entries.
    const touchedGids = new Set<string>();
    for (const sh of s.shapes) {
      if (ids.includes(sh.id) && sh.groupId) touchedGids.add(sh.groupId);
    }
    set((s2) => {
      const nextShapes = s2.shapes.map((sh) =>
        ids.includes(sh.id) ? ({ ...sh, groupId: null } as Shape) : sh
      );
      let nextMeta = s2.groupMeta;
      if (touchedGids.size > 0) {
        nextMeta = { ...s2.groupMeta };
        for (const gid of touchedGids) {
          const stillHasMembers = nextShapes.some((sh) => sh.groupId === gid);
          if (!stillHasMembers) delete nextMeta[gid];
        }
      }
      return { shapes: nextShapes, groupMeta: nextMeta };
    });
  },
  ungroupGroup: (gid) => {
    const s = get();
    const memberIds = new Set<string>();
    for (const sh of s.shapes) {
      if (sh.groupId === gid) memberIds.add(sh.id);
    }
    if (memberIds.size === 0) return;
    pushHistory();
    const nextShapes = s.shapes.map((sh) =>
      memberIds.has(sh.id) ? ({ ...sh, groupId: null } as Shape) : sh
    );
    const nextMeta = { ...s.groupMeta };
    delete nextMeta[gid];
    set({ shapes: nextShapes, groupMeta: nextMeta });
  },
  // ── Group-as-a-block reorder / duplicate / delete ─────────────────────────
  // Members of a group are always on the same sheet but need not be
  // array-contiguous before these actions run (cross-scope drag in Phase 3
  // can leave them interleaved). The moves therefore always extract members,
  // compute a new contiguous insertion point relative to non-members in scope,
  // then splice them back as a block.
  moveGroupUp: (gid) => {
    const s = get();
    const memberIds = new Set<string>();
    let sheetId: string | undefined;
    for (const sh of s.shapes) {
      if (sh.groupId === gid) {
        memberIds.add(sh.id);
        sheetId ??= sh.sheetId;
      }
    }
    if (!sheetId || memberIds.size === 0) return;
    // Find the max array index any member occupies; then the next non-member
    // scope shape above that is the pivot to jump over.
    let lastMemberIdx = -1;
    for (let i = 0; i < s.shapes.length; i++) {
      if (memberIds.has(s.shapes[i].id)) lastMemberIdx = i;
    }
    let pivotId: string | undefined;
    for (let i = lastMemberIdx + 1; i < s.shapes.length; i++) {
      if (s.shapes[i].sheetId === sheetId && !memberIds.has(s.shapes[i].id)) {
        pivotId = s.shapes[i].id;
        break;
      }
    }
    if (!pivotId) return; // already at top
    pushHistory();
    const members = s.shapes.filter((sh) => memberIds.has(sh.id));
    const without = s.shapes.filter((sh) => !memberIds.has(sh.id));
    const pivotIdx = without.findIndex((sh) => sh.id === pivotId);
    const arr = [...without];
    arr.splice(pivotIdx + 1, 0, ...members);
    set({ shapes: arr });
  },
  moveGroupDown: (gid) => {
    const s = get();
    const memberIds = new Set<string>();
    let sheetId: string | undefined;
    for (const sh of s.shapes) {
      if (sh.groupId === gid) {
        memberIds.add(sh.id);
        sheetId ??= sh.sheetId;
      }
    }
    if (!sheetId || memberIds.size === 0) return;
    // First member array index; next non-member scope shape BELOW that is the
    // pivot we insert BEFORE.
    let firstMemberIdx = -1;
    for (let i = 0; i < s.shapes.length; i++) {
      if (memberIds.has(s.shapes[i].id)) {
        firstMemberIdx = i;
        break;
      }
    }
    let pivotId: string | undefined;
    for (let i = firstMemberIdx - 1; i >= 0; i--) {
      if (s.shapes[i].sheetId === sheetId && !memberIds.has(s.shapes[i].id)) {
        pivotId = s.shapes[i].id;
        break;
      }
    }
    if (!pivotId) return; // already at bottom
    pushHistory();
    const members = s.shapes.filter((sh) => memberIds.has(sh.id));
    const without = s.shapes.filter((sh) => !memberIds.has(sh.id));
    const pivotIdx = without.findIndex((sh) => sh.id === pivotId);
    const arr = [...without];
    arr.splice(pivotIdx, 0, ...members);
    set({ shapes: arr });
  },
  moveGroupToTop: (gid) => {
    const s = get();
    const memberIds = new Set<string>();
    let sheetId: string | undefined;
    for (const sh of s.shapes) {
      if (sh.groupId === gid) {
        memberIds.add(sh.id);
        sheetId ??= sh.sheetId;
      }
    }
    if (!sheetId || memberIds.size === 0) return;
    // Early-out: if the last scope index is already a member, the block is
    // already at the top of its scope.
    let lastScopeIdx = -1;
    for (let i = 0; i < s.shapes.length; i++) {
      if (s.shapes[i].sheetId === sheetId) lastScopeIdx = i;
    }
    if (lastScopeIdx !== -1 && memberIds.has(s.shapes[lastScopeIdx].id)) {
      // Check whether moving would reorder non-members: if members are already
      // a suffix block at the end of scope, no-op.
      let suffix = true;
      for (let i = lastScopeIdx; i >= 0; i--) {
        if (s.shapes[i].sheetId !== sheetId) break;
        if (!memberIds.has(s.shapes[i].id)) {
          suffix = false;
          break;
        }
      }
      if (suffix) return;
    }
    pushHistory();
    const members = s.shapes.filter((sh) => memberIds.has(sh.id));
    const without = s.shapes.filter((sh) => !memberIds.has(sh.id));
    let lastScopeInWithout = -1;
    for (let i = 0; i < without.length; i++) {
      if (without[i].sheetId === sheetId) lastScopeInWithout = i;
    }
    const arr = [...without];
    arr.splice(lastScopeInWithout + 1, 0, ...members);
    set({ shapes: arr });
  },
  moveGroupToBottom: (gid) => {
    const s = get();
    const memberIds = new Set<string>();
    let sheetId: string | undefined;
    for (const sh of s.shapes) {
      if (sh.groupId === gid) {
        memberIds.add(sh.id);
        sheetId ??= sh.sheetId;
      }
    }
    if (!sheetId || memberIds.size === 0) return;
    let firstScopeIdx = -1;
    for (let i = 0; i < s.shapes.length; i++) {
      if (s.shapes[i].sheetId === sheetId) {
        firstScopeIdx = i;
        break;
      }
    }
    if (firstScopeIdx !== -1 && memberIds.has(s.shapes[firstScopeIdx].id)) {
      let prefix = true;
      for (let i = firstScopeIdx; i < s.shapes.length; i++) {
        if (s.shapes[i].sheetId !== sheetId) break;
        if (!memberIds.has(s.shapes[i].id)) {
          prefix = false;
          break;
        }
      }
      if (prefix) return;
    }
    pushHistory();
    const members = s.shapes.filter((sh) => memberIds.has(sh.id));
    const without = s.shapes.filter((sh) => !memberIds.has(sh.id));
    let firstScopeInWithout = -1;
    for (let i = 0; i < without.length; i++) {
      if (without[i].sheetId === sheetId) {
        firstScopeInWithout = i;
        break;
      }
    }
    const arr = [...without];
    if (firstScopeInWithout === -1) {
      // No non-member scope shapes — members are the only ones. Put them back.
      arr.push(...members);
    } else {
      arr.splice(firstScopeInWithout, 0, ...members);
    }
    set({ shapes: arr });
  },
  duplicateGroup: (gid) => {
    const s = get();
    const members = s.shapes.filter((sh) => sh.groupId === gid);
    if (members.length === 0) return;
    pushHistory();
    const newGid = uid("group");
    const clones: Shape[] = members.map(
      (sh) =>
        ({
          ...sh,
          id: uid("shape"),
          x: sh.x + 20,
          y: sh.y + 20,
          groupId: newGid,
        }) as Shape
    );
    // Seed metadata using either "<name> copy" or the fallback "Group N".
    const src = s.groupMeta[gid]?.name;
    const nextNumber = Object.keys(s.groupMeta).length + 1;
    const nextName = src ? `${src} copy` : `Group ${nextNumber}`;
    set({
      shapes: [...s.shapes, ...clones],
      groupMeta: { ...s.groupMeta, [newGid]: { name: nextName } },
      selectedShapeId: clones[0].id,
      selectedShapeIds: clones.map((c) => c.id),
      lastAnchorShapeId: clones[0].id,
    });
  },
  deleteGroup: (gid) => {
    const s = get();
    const memberIds = new Set<string>();
    for (const sh of s.shapes) {
      if (sh.groupId === gid) memberIds.add(sh.id);
    }
    if (memberIds.size === 0) return;
    pushHistory();
    const nextShapes = s.shapes.filter((sh) => !memberIds.has(sh.id));
    const nextMeta = { ...s.groupMeta };
    delete nextMeta[gid];
    const stillSelected = s.selectedShapeId && !memberIds.has(s.selectedShapeId)
      ? s.selectedShapeId
      : null;
    set({
      shapes: nextShapes,
      groupMeta: nextMeta,
      selectedShapeId: stillSelected,
      selectedShapeIds: s.selectedShapeIds.filter((id) => !memberIds.has(id)),
    });
  },
  setToolFontSize: (n) =>
    set({ toolFontSize: Math.max(8, Math.min(200, Math.round(n))) }),
  setToolFont: (v) => set({ toolFont: v }),
  setToolTextDefaults: (p) =>
    set((s) => ({ toolTextDefaults: { ...s.toolTextDefaults, ...p } })),
  setEraserSize: (n) =>
    set({ eraserSize: Math.max(2, Math.min(400, Math.round(n))) }),
  setEraserVariant: (v) => set({ eraserVariant: v }),
  // UI flag setters
  setShowLeftSidebar: (b) => set({ showLeftSidebar: b }),
  setShowRightSidebar: (b) => set({ showRightSidebar: b }),
  setShowShortcuts: (b) => set({ showShortcuts: b }),
  startRenameSheet: (id) => set({ renamingSheetId: id }),
  stopRenameSheet: () => set({ renamingSheetId: null }),
  startRenameShape: (id) => set({ renamingShapeId: id }),
  stopRenameShape: () => set({ renamingShapeId: null }),

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
  // ── guides ────────────────────────────────────────────────────────────
  addGuide: (axis, value) => {
    pushHistory();
    const id = uid("guide");
    set((s) => ({
      guides: [...s.guides, { id, axis, value }],
      selectedGuideId: id,
    }));
    return id;
  },
  updateGuide: (id, value) => {
    set((s) => ({
      guides: s.guides.map((g) => (g.id === id ? { ...g, value } : g)),
    }));
  },
  commitGuide: (id, preDragValue) => {
    const s = get();
    const g = s.guides.find((gg) => gg.id === id);
    if (!g) return;
    // If value hasn't changed, skip the history push — a "click without drag"
    // would otherwise pollute undo with no-op snapshots.
    if (g.value === preDragValue) return;
    // We're past the drag; push one snapshot representing pre-drag state.
    // Replay: roll back value, push, roll forward.
    const rolledBack = s.guides.map((gg) =>
      gg.id === id ? { ...gg, value: preDragValue } : gg
    );
    set({ guides: rolledBack });
    pushHistory();
    set({ guides: s.guides }); // restore post-drag state
  },
  deleteGuide: (id) => {
    pushHistory();
    set((s) => ({
      guides: s.guides.filter((g) => g.id !== id),
      selectedGuideId: s.selectedGuideId === id ? null : s.selectedGuideId,
    }));
  },
  clearGuides: () => {
    const s = get();
    if (s.guides.length === 0) return;
    pushHistory();
    set({ guides: [], selectedGuideId: null });
  },
  setSelectedGuideId: (id) => set({ selectedGuideId: id }),

  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    const future = [
      { sheets: s.sheets, shapes: s.shapes, guides: s.guides },
      ...s.future,
    ];
    set({
      past: s.past.slice(0, -1),
      future,
      sheets: prev.sheets,
      shapes: prev.shapes,
      guides: prev.guides ?? [],
    });
  },
  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    const past = [
      ...s.past,
      { sheets: s.sheets, shapes: s.shapes, guides: s.guides },
    ];
    if (past.length > HISTORY_LIMIT) past.shift();
    set({
      past,
      future: s.future.slice(1),
      sheets: next.sheets,
      shapes: next.shapes,
      guides: next.guides ?? [],
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

  zoomToSheet: (id, vw, vh) => {
    const sheet = get().sheets.find((s) => s.id === id);
    if (!sheet) return;
    // Larger padding than `fitAllSheets` on purpose: when the user picks a
    // single sheet from the Sheets-tab navigator, we want the sheet to sit
    // comfortably inside the canvas with visible breathing room around it
    // ("zoomed a little outwards"), not fill edge-to-edge. `fitAllSheets`
    // intentionally uses the tighter 120px because its job is the opposite —
    // cram every sheet onto the screen.
    const padding = 240;
    const scale = Math.min(
      (vw - padding) / sheet.width,
      (vh - padding) / sheet.height,
    );
    const targetZ = Math.min(4, Math.max(0.05, scale));
    const targetPan = {
      x: vw / 2 - (sheet.x + sheet.width / 2) * targetZ,
      y: vh / 2 - (sheet.y + sheet.height / 2) * targetZ,
    };
    const { zoom: fromZ, pan: fromPan } = get();
    const duration = 200;
    const t0 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    // easeOutCubic — fast start, settled tail. Matches the "snappy but soft"
    // motion feel used elsewhere without adding a dependency.
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const k = ease(t);
      set({
        zoom: fromZ + (targetZ - fromZ) * k,
        pan: {
          x: fromPan.x + (targetPan.x - fromPan.x) * k,
          y: fromPan.y + (targetPan.y - fromPan.y) * k,
        },
      });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
}));

// Late-bind the module-scoped storeRef so `pushHistory` can read the latest
// state and commit past/future snapshots back into the store.
storeRef = {
  getState: () => useStore.getState(),
  setState: (v) => useStore.setState(v),
};

// Dev-only: expose the zustand store on window so Claude Preview can drive
// state changes directly during verification (calling actions, reading state).
// This branch is DCE'd in production builds when import.meta.env.DEV is false.
if (import.meta.env?.DEV && typeof window !== "undefined") {
  (window as unknown as { useStore?: typeof useStore }).useStore = useStore;
}

export { uid, SHEET_W, SHEET_H };
