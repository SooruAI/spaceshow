export type Tool =
  | "select"
  | "pen"
  | "eraser"
  | "rect"
  | "line"
  | "sticky"
  | "text"
  | "upload";

export type ShapeType =
  | "rect"
  | "line"
  | "pen"
  | "sticky"
  | "text"
  | "image";

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

export interface PenShape extends BaseShape {
  type: "pen";
  points: number[];
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

export type Shape =
  | RectShape
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
}

export interface Sheet {
  id: string;
  name: string;
  width: number;   // logical canvas size for the sheet
  height: number;
  x: number;       // position on the infinite board
  y: number;
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
