export type Tool =
  | "select"
  | "pen"
  | "eraser"
  | "rect"
  | "shape"
  | "line"
  | "sticky"
  | "text"
  | "upload"
  | "comment";

export type ShapeType =
  | "rect"
  | "shape"
  | "line"
  | "pen"
  | "sticky"
  | "image";

export type ShapeKind =
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "star"
  | "cloud"
  | "diamond"
  | "heart"
  | "rhombus"
  | "tickbox"
  | "polygon"
  | "arrow-left"
  | "arrow-right"
  | "arrow-up"
  | "arrow-down";

export interface BaseShape {
  id: string;
  type: ShapeType;
  sheetId: string;     // which sheet (or "board" for free layers)
  name: string;
  visible: boolean;
  locked: boolean;
  x: number;
  y: number;
  rotation?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** How strokeWidth should be interpreted.
   *  "world" (new default): strokeWidth is in world units, scales with zoom
   *  like content — Canva-style. Missing/"screen": legacy value stored as
   *  "screen-px at creation-zoom"; rendered via `/zoom` so it stays a
   *  constant size on screen. Kept for backward-compat with saved files. */
  strokeWidthUnit?: "screen" | "world";
  /** Shapes sharing a non-null groupId are treated as one selection unit. */
  groupId?: string | null;
}

export interface RectShape extends BaseShape {
  type: "rect";
  width: number;
  height: number;
}

export interface LineShape extends BaseShape {
  type: "line";
  /** User-placed pivots: flat [startX, startY, w1X, w1Y, …, endX, endY].
   *  Corners (for elbow) and Bézier control points (for curved) are derived
   *  at render time — the pivots are the first-class state. */
  points: number[];
  routing?: LineRouting;
  pattern?: LinePattern;
  startMarker?: LineMarkerKind;
  endMarker?: LineMarkerKind;
  /** 0..1. Multiplied into the stroke's alpha channel at render time. */
  opacity?: number;
  /** Fixed per-line so the elbow shape doesn't flip across the 45° diagonal
   *  while the user drags a waypoint. "HV" = horizontal leg first.
   *  Only meaningful when routing === "elbow". */
  elbowOrientation?: "HV" | "VH";
  /** −2..+2 signed perpendicular offset of Bézier controls as a fraction of
   *  the chord length. 0 = straight. Only meaningful when routing === "curved". */
  curvature?: number;
}

export type PenVariant = "pen" | "marker" | "highlighter";

export type EraserVariant = "stroke" | "object";

/** Routing style for lines — straight segment, right-angled elbow, or
 *  smooth curve. Only "straight" is rendered today; the other values are
 *  recorded so the future scene renderer can respect them. */
export type LineRouting = "straight" | "elbow" | "curved";

/** Stroke pattern for lines. */
export type LinePattern = "solid" | "dashed" | "dotted";

/** End-cap glyph. Mirrored on the Start side via an SVG transform. */
export type LineMarkerKind =
  | "none"
  | "standardArrow"
  | "solidArrow"
  | "openCircle"
  | "solidCircle"
  | "openSquare"
  | "solidSquare"
  | "openDiamond"
  | "solidDiamond"
  | "flatBar";

export const LINE_ROUTINGS: ReadonlyArray<{
  value: LineRouting;
  label: string;
}> = [
  { value: "straight", label: "Straight" },
  { value: "elbow", label: "Elbow" },
  { value: "curved", label: "Curved" },
];

export const LINE_PATTERNS: ReadonlyArray<{
  value: LinePattern;
  label: string;
}> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

export const LINE_MARKER_KINDS: ReadonlyArray<{
  value: LineMarkerKind;
  label: string;
}> = [
  { value: "none", label: "None" },
  { value: "standardArrow", label: "Standard arrow" },
  { value: "solidArrow", label: "Solid arrow" },
  { value: "openCircle", label: "Open circle" },
  { value: "solidCircle", label: "Solid circle" },
  { value: "openSquare", label: "Open square" },
  { value: "solidSquare", label: "Solid square" },
  { value: "openDiamond", label: "Open diamond" },
  { value: "solidDiamond", label: "Solid diamond" },
  { value: "flatBar", label: "Flat bar" },
];

export const LINE_COLOR_PRESETS: ReadonlyArray<{
  label: string;
  value: string;
}> = [
  { label: "Black", value: "#2c2a27" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Red", value: "#ef4444" },
  { label: "Green", value: "#22c55e" },
  { label: "Orange", value: "#f97316" },
  { label: "Purple", value: "#8b5cf6" },
  { label: "Pink", value: "#ec4899" },
  { label: "White", value: "#ffffff" },
];

export interface PenVariantSettings {
  color: string;
  weight: number;
  /** 0..1 — 1 is fully opaque. UI shows transparency as `1 - opacity`. */
  opacity: number;
}

/** One "hole" punched in a pen stroke by the stroke eraser. Coords are in
 *  the pen shape's local frame (same as `points`). Rendered as a
 *  destination-out circle inside the shape's cached Konva group, so the hole
 *  reveals whatever is underneath (not just the sheet background). */
export interface EraseMark {
  cx: number;
  cy: number;
  r: number;
  /** How r (and cx/cy distance math) should be interpreted.
   *  "world" (new default): r is in world units. Missing/"screen": legacy
   *  marks stored in screen-px; rendered via `/zoom`. */
  unit?: "screen" | "world";
}

export interface PenShape extends BaseShape {
  type: "pen";
  points: number[];
  variant?: PenVariant;
  opacity?: number;
  /** Accumulated erase marks — each one punches a hole in the rendered stroke. */
  eraseMarks?: EraseMark[];
}

export interface StickyShape extends BaseShape {
  type: "sticky";
  width: number;
  height: number;
  text: string;
}

export interface ImageShape extends BaseShape {
  type: "image";
  width: number;
  height: number;
  src: string;
}

/** Per-shape style payload for the unified ShapeShape system. */
export interface ShapeStyle {
  borderEnabled: boolean;
  borderWeight: number;     // 0–20 px
  borderColor: string;
  borderStyle: LineStyle;
  /** Only applied for kind === "rectangle". Other kinds ignore this. */
  cornerRadius: number;
  fillColor: string;
  /** 0–1 opacity applied to fill (and pattern image when set). */
  fillOpacity: number;
  /** Optional image fill — when present, overrides solid fillColor. */
  imageFill?: {
    src: string;
    fit: "cover" | "contain";
    /** Optional crop in image-pixel space. Overrides default fit math. */
    crop?: { x: number; y: number; w: number; h: number };
  };
}

export type ListStyle = "none" | "bulleted" | "numbered";

/** Bullet glyph styles. The visible glyph cascades with `indent`: at indent N
 *  the rendered glyph is the cascade element offset by N from the base style.
 *  See `src/lib/listFormat.ts`. */
export type BulletStyle = "disc" | "circle" | "square" | "dash" | "arrow";

/** Number-format styles. Same cascading rule as `BulletStyle`. */
export type NumberStyle =
  | "decimal"
  | "decimal-paren"
  | "alpha-lower"
  | "alpha-upper"
  | "roman-lower";

/** In-shape text content with rich formatting. */
export interface TextContent {
  text: string;
  font: string;       // CSS font-family
  fontSize: number;   // px
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  /** Vertical alignment of text within the box. Defaults to "top". Mostly
   *  visible when the box is taller than the wrapped content (e.g. after the
   *  user manually resizes a text shape via the Transformer handles). */
  verticalAlign?: "top" | "middle" | "bottom";
  bullets: ListStyle;
  /** 0..6 indent levels. */
  indent: number;
  /** Optional background fill behind the text. Undefined = transparent. */
  bgColor?: string;
  /** Base bullet style at indent 0; undefined = "disc". Cascades with indent. */
  bulletStyle?: BulletStyle;
  /** Base number style at indent 0; undefined = "decimal". Cascades with indent. */
  numberStyle?: NumberStyle;
  /** When true (default) the box auto-grows/shrinks to fit text during edit;
   *  flipped to false the moment the user manually resizes via the transform
   *  handles so we respect their explicit size and word-wrap inside it. */
  autoFit?: boolean;
}

/** Unified shape primitive — covers all 14 design-tool kinds. */
export interface ShapeShape extends BaseShape {
  type: "shape";
  kind: ShapeKind;
  width: number;
  height: number;
  style: ShapeStyle;
  /** Optional in-shape text (Figma/PowerPoint style). */
  text?: TextContent;
  /** Only meaningful when kind === "polygon". 3–12. */
  polygonSides?: number;
}

export type Shape =
  | RectShape
  | ShapeShape
  | LineShape
  | PenShape
  | StickyShape
  | ImageShape;

export type PaperSize =
  | "A0"
  | "A1"
  | "A2"
  | "A3"
  | "A4"
  | "A5"
  | "A6"
  | "custom";
export type Orientation = "landscape" | "portrait";
export type LineStyle = "solid" | "dotted" | "dashed" | "double";

export interface SheetMargins {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface SheetBorder {
  weight: number; // 0-8
  color: string;
  style: LineStyle;
  sides: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  /** px inset from each edge. 0 = hugs the edge. */
  offsets: { top: number; right: number; bottom: number; left: number };
  /** 0–1, applied as stroke opacity on the rendered border. */
  opacity: number;
  /** Per-corner radius in px. Only rendered when all 4 sides are enabled. */
  radius: { tl: number; tr: number; bl: number; br: number };
}

export interface Sheet {
  id: string;
  name: string;
  width: number;   // logical canvas size for the sheet
  height: number;
  x: number;       // position on the infinite board
  y: number;
  /**
   * Rotation in degrees around the sheet's visual center. Undefined is
   * treated as 0. Applied only at the render layer — layout/export math
   * continues to treat (x, y, width, height) as the axis-aligned bbox that
   * contained the sheet before it was rotated.
   */
  rotation?: number;
  background: string;
  paperSize: PaperSize;
  orientation: Orientation;
  margins: SheetMargins;
  border: SheetBorder;
  locked: boolean;
  hidden: boolean;
}

export interface Board {
  id: string;
  name: string;
}

/** A global, world-space reference line. "h" guides are horizontal — they
 *  have a world-Y value and span the whole board left-to-right. "v" guides
 *  are vertical — they have a world-X value and span top-to-bottom.
 *  Guides are NOT per-sheet; a single flat list lives at the top level and
 *  renders over all sheets/board layers. */
export interface Guide {
  id: string;
  axis: "h" | "v";
  /** World-space position: Y for horizontal guides, X for vertical. */
  value: number;
}

export interface Iteration {
  id: string;
  name: string;
}

export interface ViewItem {
  id: string;
  name: string;
  iterationId: string;
  thumbnail: string;     // gradient/color for fake thumbnail
  favorite: boolean;
  hidden: boolean;
  addedAt: number;
}

// ── Comments domain ───────────────────────────────────────────────────────
/** Opaque TipTap JSONContent. Treated as-is at the store seam so types.ts
 *  doesn't pull TipTap types into every module. */
export type TipTapDoc = { type: "doc"; content?: unknown[] };

export type CommentsView = "list" | "focused";

/** A spatial comment pin anchored to a sheet or the free board. Coordinates
 *  are sheet-local when canvasId !== "board" (same convention as shapes). */
export interface Thread {
  id: string;
  canvasId: string;               // sheetId or "board"
  coordinates: { x: number; y: number };
  status: "open" | "resolved";
  createdAt: number;
}

/** A single Comment in a thread. parentId=null marks the root comment;
 *  replies carry the root comment's id as parentId. */
export interface Comment {
  id: string;
  threadId: string;
  authorId: string;
  content: TipTapDoc;
  createdAt: number;
  parentId: string | null;
}

/** File attached to a Comment. fileUrl is a data URL in v1 — treat as an
 *  opaque blob-handle stand-in; a backend will replace it later. */
export interface Attachment {
  id: string;
  commentId: string;
  fileUrl: string;
  fileType: "image" | "pdf";
  fileName: string;
}

export interface User {
  id: string;
  name: string;
  avatarUrl: string;
  color?: string;
}
