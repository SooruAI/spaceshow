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
  polygon: "polygon",
  diamond: "path",
  star: "star",
  heart: "path",
  cloud: "path",
  "arrow-right": "path",
  "arrow-double": "path",
  "arrow-quad": "path",
  plus: "path",
  tickbox: "path",
  radio: "path",
  toggle: "path",
  slider: "path",
};

/**
 * Build an SVG path `d` string for a path-based shape kind, scaled to
 * (w, h). Coordinates are local to the shape — the caller positions the
 * Konva.Path node via x/y. All paths are closed with "Z".
 *
 * `opts` carries form-control state used by tickbox / radio / toggle /
 * slider. Defaults preserve the original "always set / centered" silhouette
 * so existing data renders unchanged when the caller doesn't pass any state.
 */
export interface ShapePathOpts {
  /** tickbox / radio / toggle: whether the control is on. */
  checked?: boolean;
  /** slider: current value. Defaults to midpoint of [min, max]. */
  value?: number;
  /** slider: range floor. Defaults to 0. */
  min?: number;
  /** slider: range ceiling. Defaults to 100. */
  max?: number;
}
export function shapePathFor(
  kind: ShapeKind,
  w: number,
  h: number,
  opts?: ShapePathOpts
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
      // Square outline always; checkmark sub-path only when `opts.checked`.
      // Empty-checked silhouette reads as an unticked checkbox; ticked adds
      // the diagonal stroke.
      const pad = 1;
      const outline =
        `M ${pad} ${pad} L ${W - pad} ${pad} L ${W - pad} ${H - pad} ` +
        `L ${pad} ${H - pad} Z`;
      if (!opts?.checked) return outline;
      return (
        `${outline} ` +
        `M ${W * 0.22} ${H * 0.5} L ${W * 0.45} ${H * 0.72} ` +
        `L ${W * 0.78} ${H * 0.28}`
      );
    }
    case "radio": {
      // Outer disc (CW) + middle disc (CCW) draws the empty ring. Center dot
      // (CW) is appended only when `opts.checked` so the default silhouette
      // is an unselected radio. Counter-winding still drives nonzero fill so
      // the ring renders as a ring (not a solid disc).
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) / 2;
      const ringInner = R * 0.65;   // inner cutout radius — controls ring thickness
      const dot = R * 0.32;          // center dot radius
      const ring =
        `M ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R} ${cy} ` +
        `A ${R} ${R} 0 1 1 ${cx - R} ${cy} Z ` +
        `M ${cx - ringInner} ${cy} A ${ringInner} ${ringInner} 0 1 0 ${cx + ringInner} ${cy} ` +
        `A ${ringInner} ${ringInner} 0 1 0 ${cx - ringInner} ${cy} Z`;
      if (!opts?.checked) return ring;
      return (
        `${ring} ` +
        `M ${cx - dot} ${cy} A ${dot} ${dot} 0 1 1 ${cx + dot} ${cy} ` +
        `A ${dot} ${dot} 0 1 1 ${cx - dot} ${cy} Z`
      );
    }
    case "toggle": {
      // Stadium pill (CW) with a counter-wound handle disc that subtracts a
      // circular hole. Handle sits on the LEFT when off, RIGHT when on — the
      // classic switch animation captured as two static positions.
      const radius = H / 2;
      const outer =
        `M ${radius} 0 H ${W - radius} ` +
        `A ${radius} ${radius} 0 0 1 ${W - radius} ${H} ` +
        `H ${radius} ` +
        `A ${radius} ${radius} 0 0 1 ${radius} 0 Z`;
      const handleR = radius * 0.7;
      const hcx = opts?.checked ? W - radius : radius;
      const hcy = H / 2;
      // CCW handle (sweep=0) → cut a hole via nonzero fill rule.
      const handle =
        `M ${hcx - handleR} ${hcy} ` +
        `A ${handleR} ${handleR} 0 1 0 ${hcx + handleR} ${hcy} ` +
        `A ${handleR} ${handleR} 0 1 0 ${hcx - handleR} ${hcy} Z`;
      return `${outer} ${handle}`;
    }
    case "slider": {
      // Thin horizontal track (stadium) plus a handle disc whose x-position
      // reflects `opts.value` interpolated across [min, max]. Default value
      // (no opts) keeps the handle centered to match the historic silhouette.
      const trackH = Math.max(2, H * 0.22);
      const trackY = (H - trackH) / 2;
      const trackR = trackH / 2;
      const handleR = Math.min(H * 0.46, W * 0.18);
      const min = opts?.min ?? 0;
      const max = opts?.max ?? 100;
      const range = max - min;
      const value =
        opts?.value !== undefined ? opts.value : (min + max) / 2;
      const frac =
        range === 0 ? 0.5 : Math.max(0, Math.min(1, (value - min) / range));
      // Constrain hcx so the handle never spills past the bbox edges.
      const hcx = handleR + frac * (W - 2 * handleR);
      const hcy = H / 2;
      const track =
        `M ${trackR} ${trackY} H ${W - trackR} ` +
        `A ${trackR} ${trackR} 0 0 1 ${W - trackR} ${trackY + trackH} ` +
        `H ${trackR} ` +
        `A ${trackR} ${trackR} 0 0 1 ${trackR} ${trackY} Z`;
      const handle =
        `M ${hcx - handleR} ${hcy} ` +
        `A ${handleR} ${handleR} 0 1 1 ${hcx + handleR} ${hcy} ` +
        `A ${handleR} ${handleR} 0 1 1 ${hcx - handleR} ${hcy} Z`;
      return `${track} ${handle}`;
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
    case "arrow-double": {
      // Horizontal double-headed arrow: tips at (0, H/2) and (W, H/2),
      // shaft of thickness 0.3·H between them, flared head bases at each end.
      const headW = Math.min(W * 0.25, H * 0.5);
      const shaftY1 = H * 0.35;
      const shaftY2 = H * 0.65;
      return (
        `M 0 ${H / 2} ` +
        `L ${headW} 0 L ${headW} ${shaftY1} ` +
        `L ${W - headW} ${shaftY1} L ${W - headW} 0 ` +
        `L ${W} ${H / 2} ` +
        `L ${W - headW} ${H} L ${W - headW} ${shaftY2} ` +
        `L ${headW} ${shaftY2} L ${headW} ${H} Z`
      );
    }
    case "arrow-quad": {
      // 4-pointed arrow (cross with arrowheads at every tip). Heads sit on
      // the cardinal axes, shafts meet in a square at the center, head bases
      // flare beyond the shaft thickness so the silhouette reads as arrows
      // rather than a plus.
      const headW = Math.min(W * 0.25, H * 0.5);   // horizontal head depth
      const headH = Math.min(H * 0.25, W * 0.5);   // vertical head depth
      const shaftY1 = H * 0.4;
      const shaftY2 = H * 0.6;
      const shaftX1 = W * 0.4;
      const shaftX2 = W * 0.6;
      const headTopY = H * 0.3;     // horizontal head base top (flared)
      const headBotY = H * 0.7;     // horizontal head base bottom (flared)
      const headLeftX = W * 0.3;    // vertical head base left (flared)
      const headRightX = W * 0.7;   // vertical head base right (flared)
      return (
        // start at left tip, traverse clockwise
        `M 0 ${H / 2} ` +
        `L ${headW} ${headTopY} L ${headW} ${shaftY1} ` +
        `L ${shaftX1} ${shaftY1} L ${shaftX1} ${headH} ` +
        `L ${headLeftX} ${headH} L ${W / 2} 0 L ${headRightX} ${headH} ` +
        `L ${shaftX2} ${headH} L ${shaftX2} ${shaftY1} ` +
        `L ${W - headW} ${shaftY1} L ${W - headW} ${headTopY} ` +
        `L ${W} ${H / 2} ` +
        `L ${W - headW} ${headBotY} L ${W - headW} ${shaftY2} ` +
        `L ${shaftX2} ${shaftY2} L ${shaftX2} ${H - headH} ` +
        `L ${headRightX} ${H - headH} L ${W / 2} ${H} L ${headLeftX} ${H - headH} ` +
        `L ${shaftX1} ${H - headH} L ${shaftX1} ${shaftY2} ` +
        `L ${headW} ${shaftY2} L ${headW} ${headBotY} Z`
      );
    }
    case "plus": {
      // 12-vertex plus / cross: vertical bar of width 0.3·W meets horizontal
      // bar of height 0.3·H at the center. Even arms in both directions.
      const sx1 = W * 0.35;
      const sx2 = W * 0.65;
      const sy1 = H * 0.35;
      const sy2 = H * 0.65;
      return (
        `M ${sx1} 0 L ${sx2} 0 L ${sx2} ${sy1} ` +
        `L ${W} ${sy1} L ${W} ${sy2} L ${sx2} ${sy2} ` +
        `L ${sx2} ${H} L ${sx1} ${H} L ${sx1} ${sy2} ` +
        `L 0 ${sy2} L 0 ${sy1} L ${sx1} ${sy1} Z`
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
  polygon: "Polygon",
  diamond: "Diamond",
  star: "Star",
  heart: "Heart",
  cloud: "Cloud",
  "arrow-right": "Arrow",
  "arrow-double": "Double Arrow",
  "arrow-quad": "Quad Arrow",
  plus: "Plus",
  tickbox: "Tickbox",
  radio: "Radio",
  toggle: "Toggle",
  slider: "Slider",
};
