import type { ShapeKind } from "../types";

/**
 * Renderer category for each ShapeKind. Drives which Konva component the
 * UnifiedShapeNode picks. Path-based kinds use shapePathFor() to compute
 * SVG `d` data; primitive kinds use Konva's built-ins (Rect, Ellipse,
 * RegularPolygon, Star) which accept width/height directly.
 */
export type ShapeRenderer = "rect" | "ellipse" | "polygon" | "star" | "path";

export const KIND_RENDERER: Record<ShapeKind, ShapeRenderer> = {
  rectangle: "rect",
  ellipse: "ellipse",
  triangle: "polygon",
  star: "star",
  cloud: "path",
  diamond: "path",
  heart: "path",
  rhombus: "path",
  tickbox: "path",
  polygon: "polygon",
  "arrow-left": "path",
  "arrow-right": "path",
  "arrow-up": "path",
  "arrow-down": "path",
};

/**
 * Build an SVG path `d` string for a path-based shape kind, scaled to
 * (w, h). Coordinates are local to the shape — the caller positions the
 * Konva.Path node via x/y. All paths are closed with "Z".
 */
export function shapePathFor(
  kind: ShapeKind,
  w: number,
  h: number
): string {
  const W = Math.max(1, w);
  const H = Math.max(1, h);
  switch (kind) {
    case "diamond": {
      // 4-pointed rhombus, vertices at the midpoints of each edge.
      const cx = W / 2;
      const cy = H / 2;
      return `M ${cx} 0 L ${W} ${cy} L ${cx} ${H} L 0 ${cy} Z`;
    }
    case "rhombus": {
      // Slanted parallelogram. Top-left vertex is offset by 20% of width.
      const off = W * 0.2;
      return `M ${off} 0 L ${W} 0 L ${W - off} ${H} L 0 ${H} Z`;
    }
    case "heart": {
      // Two arcs forming the lobes, meeting at the apex point.
      const cx = W / 2;
      const top = H * 0.3;
      const apex = H;
      return (
        `M ${cx} ${apex} ` +
        `C ${cx} ${apex} 0 ${H * 0.55} 0 ${top} ` +
        `C 0 ${H * 0.05} ${cx} ${H * 0.05} ${cx} ${H * 0.3} ` +
        `C ${cx} ${H * 0.05} ${W} ${H * 0.05} ${W} ${top} ` +
        `C ${W} ${H * 0.55} ${cx} ${apex} ${cx} ${apex} Z`
      );
    }
    case "cloud": {
      // 4-bump cloud silhouette via cubic Béziers along the top + flat-ish base.
      const r1 = H * 0.35;
      const baseY = H * 0.78;
      return (
        `M ${W * 0.18} ${baseY} ` +
        `C ${W * 0.02} ${baseY} ${W * 0.02} ${H * 0.42} ${W * 0.18} ${H * 0.42} ` +
        `C ${W * 0.18} ${H * 0.1} ${W * 0.45} ${H * 0.1} ${W * 0.5} ${H * 0.32} ` +
        `C ${W * 0.55} ${H * 0.05} ${W * 0.85} ${H * 0.05} ${W * 0.82} ${H * 0.36} ` +
        `C ${W * 0.99} ${H * 0.36} ${W * 0.99} ${baseY} ${W * 0.82} ${baseY} ` +
        `L ${W * 0.18} ${baseY} Z M 0 0 m 0 ${r1 * 0}`
      );
    }
    case "tickbox": {
      // Square outline + check mark inside (drawn as a single path).
      const pad = 1;
      return (
        `M ${pad} ${pad} L ${W - pad} ${pad} L ${W - pad} ${H - pad} ` +
        `L ${pad} ${H - pad} Z ` +
        `M ${W * 0.22} ${H * 0.5} L ${W * 0.45} ${H * 0.72} ` +
        `L ${W * 0.78} ${H * 0.28}`
      );
    }
    case "arrow-right": {
      const headW = Math.min(W * 0.35, H * 0.5);
      const shaftY1 = H * 0.35;
      const shaftY2 = H * 0.65;
      return (
        `M 0 ${shaftY1} L ${W - headW} ${shaftY1} ` +
        `L ${W - headW} 0 L ${W} ${H / 2} L ${W - headW} ${H} ` +
        `L ${W - headW} ${shaftY2} L 0 ${shaftY2} Z`
      );
    }
    case "arrow-left": {
      const headW = Math.min(W * 0.35, H * 0.5);
      const shaftY1 = H * 0.35;
      const shaftY2 = H * 0.65;
      return (
        `M ${W} ${shaftY1} L ${headW} ${shaftY1} ` +
        `L ${headW} 0 L 0 ${H / 2} L ${headW} ${H} ` +
        `L ${headW} ${shaftY2} L ${W} ${shaftY2} Z`
      );
    }
    case "arrow-up": {
      const headH = Math.min(H * 0.35, W * 0.5);
      const shaftX1 = W * 0.35;
      const shaftX2 = W * 0.65;
      return (
        `M ${shaftX1} ${H} L ${shaftX1} ${headH} ` +
        `L 0 ${headH} L ${W / 2} 0 L ${W} ${headH} ` +
        `L ${shaftX2} ${headH} L ${shaftX2} ${H} Z`
      );
    }
    case "arrow-down": {
      const headH = Math.min(H * 0.35, W * 0.5);
      const shaftX1 = W * 0.35;
      const shaftX2 = W * 0.65;
      return (
        `M ${shaftX1} 0 L ${shaftX1} ${H - headH} ` +
        `L 0 ${H - headH} L ${W / 2} ${H} L ${W} ${H - headH} ` +
        `L ${shaftX2} ${H - headH} L ${shaftX2} 0 Z`
      );
    }
    default:
      // Primitive kinds shouldn't call shapePathFor — emit a bbox rect as
      // a safe fallback so the renderer never crashes.
      return `M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z`;
  }
}

/** Human-readable label for the shape picker UI. */
export const KIND_LABEL: Record<ShapeKind, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  star: "Star",
  cloud: "Cloud",
  diamond: "Diamond",
  heart: "Heart",
  rhombus: "Rhombus",
  tickbox: "Tickbox",
  polygon: "Polygon",
  "arrow-left": "Arrow Left",
  "arrow-right": "Arrow Right",
  "arrow-up": "Arrow Up",
  "arrow-down": "Arrow Down",
};
