export type Tool =
  | "select"
  | "pen"
  | "eraser"
  | "rect"
  | "shape"
  | "line"
  | "sticky"
  | "text"
  | "upload";

export type ShapeType =
  | "rect"
  | "shape"
  | "line"
  | "pen"
  | "sticky"
  | "text"
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
  points: number[]; // flat [x1,y1,x2,y2,...]
}

export type PenVariant = "pen" | "marker" | "highlighter";

export type EraserVariant = "stroke" | "object";

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

export interface TextShape extends BaseShape {
  type: "text";
  text: string;
  fontSize: number;
  width?: number;
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
  bullets: boolean;
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
  | TextShape
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
