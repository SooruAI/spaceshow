/**
 * LineMarkerEnds — Konva renderer for a LineShape's start + end markers.
 *
 * The user picks an end glyph in the top toolbar (`LineToolMenu`) and it
 * persists on `shape.startMarker` / `shape.endMarker`. The sibling
 * `markers.tsx` file only renders an SVG *preview* for the dropdown row;
 * the glyph never reaches the canvas from there. This component closes
 * that gap — it walks the same 10 `LineMarkerKind` variants and emits
 * Konva primitives anchored at each endpoint and rotated along the
 * outward tangent of whatever routing the line is using.
 *
 * Both the editor (`Canvas.tsx`) and the presenter (`PresenterShape.tsx`)
 * use this component so the two surfaces stay pixel-consistent.
 *
 * ─── Endpoint tangents ─────────────────────────────────────────────
 * Each routing needs its own "outward direction at the endpoint":
 *   • straight        — chord direction, reversed at the start.
 *   • elbow           — first / last polyline segment, reversed at the
 *                       start. Walks past zero-length neighbours so a
 *                       collapsed first corner doesn't produce NaN.
 *   • curved          — negated out-handle at anchor 0 / negated
 *                       in-handle at anchor N. Falls back to the chord
 *                       when both handles are zero (legacy
 *                       straight-as-curve).
 *   • arc             — tangent perpendicular to the radius at the
 *                       endpoint, sign chosen so the "into arc" side
 *                       agrees with the direction of travel through m.
 *
 * The returned angle is in radians and points *outward* — i.e. rotating
 * the glyph (defined back-edge-at-origin, body extending to +x) by this
 * angle puts the marker's back edge at the endpoint with the tip
 * extending *past* the endpoint along the outward tangent. One
 * convention for both ends keeps the renderer branch-free, and having
 * the whole glyph sit beyond the stored endpoint matches how
 * terminators typically read in ER / UML / flowchart tools — the line
 * "ends into" its end-cap rather than being shadowed by it.
 *
 * ─── Zoom / unit handling ──────────────────────────────────────────
 * Mirrors `dashForLinePattern` so pattern and marker stay in the same
 * coordinate space:
 *   • "world" strokeWidths  — glyph sizes stay in world units; the
 *     parent worldGroup's `scale(zoom)` renders them at the right
 *     screen size.
 *   • "screen" strokeWidths — glyph sizes are pre-divided by zoom so
 *     the parent group's transform cancels, leaving a constant screen
 *     size (matching the stored strokeWidth's intent).
 * The presenter passes zoom = 1 because its parent Group already bakes
 * the fit scale into the transform.
 */

import { Circle, Group, Line, Rect } from "react-konva";
import type { LineMarkerKind, LineRouting, LineShape } from "../../types";
import {
  EPS,
  autoSmoothTangents,
  computeElbowPath,
  resolveArcPoints,
  resolveCurveAnchors,
} from "../../lib/lineRouting";

export interface EndpointTangent {
  x: number;
  y: number;
  /** Outward tangent angle in radians. */
  angle: number;
}

/** Per-endpoint position + outward tangent for a LineShape. See file
 *  header for the routing-specific derivations. The optional
 *  `routingOverride` lets `Canvas.tsx` force "straight" while a line is
 *  being drawn — the primary path render does the same override so the
 *  marker tangent stays in sync with the rendered path. */
export function lineEndpointTangents(
  shape: LineShape,
  routingOverride?: LineRouting,
): {
  start: EndpointTangent;
  end: EndpointTangent;
} {
  const pts = shape.points;
  const n = pts.length;
  if (n < 4) {
    const p = { x: pts[0] ?? 0, y: pts[1] ?? 0 };
    return {
      start: { ...p, angle: 0 },
      end: { ...p, angle: 0 },
    };
  }
  const sx = pts[0];
  const sy = pts[1];
  const ex = pts[n - 2];
  const ey = pts[n - 1];
  const routing = routingOverride ?? shape.routing ?? "straight";

  // ── curved ──
  if (routing === "curved") {
    const anchors = autoSmoothTangents(resolveCurveAnchors(shape));
    if (anchors.length >= 2) {
      const a0 = anchors[0];
      const aN = anchors[anchors.length - 1];
      const oh = a0.outHandle ?? { dx: 0, dy: 0 };
      const ih = aN.inHandle ?? { dx: 0, dy: 0 };
      const ohDeg = Math.abs(oh.dx) < EPS && Math.abs(oh.dy) < EPS;
      const ihDeg = Math.abs(ih.dx) < EPS && Math.abs(ih.dy) < EPS;
      const startAngle = ohDeg
        ? Math.atan2(a0.y - aN.y, a0.x - aN.x)
        : Math.atan2(-oh.dy, -oh.dx);
      const endAngle = ihDeg
        ? Math.atan2(aN.y - a0.y, aN.x - a0.x)
        : Math.atan2(-ih.dy, -ih.dx);
      return {
        start: { x: a0.x, y: a0.y, angle: startAngle },
        end: { x: aN.x, y: aN.y, angle: endAngle },
      };
    }
  }

  // ── arc ──
  if (routing === "arc") {
    const { s, m, e } = resolveArcPoints(pts);
    // Circumcenter — same determinant formula as `computeArcPath`. Collinear
    // triples have |D| ≈ 0 and fall through to the straight branch.
    const D =
      2 *
      (s.x * (m.y - e.y) + m.x * (e.y - s.y) + e.x * (s.y - m.y));
    if (Math.abs(D) >= EPS) {
      const sSq = s.x * s.x + s.y * s.y;
      const mSq = m.x * m.x + m.y * m.y;
      const eSq = e.x * e.x + e.y * e.y;
      const cx =
        (sSq * (m.y - e.y) + mSq * (e.y - s.y) + eSq * (s.y - m.y)) / D;
      const cy =
        (sSq * (e.x - m.x) + mSq * (s.x - e.x) + eSq * (m.x - s.x)) / D;

      // Start endpoint — tangent perpendicular to (s − center). Pick the
      // sign that points "into the arc" (positive dot with m − s), then
      // negate for the outward direction.
      const rsx = s.x - cx;
      const rsy = s.y - cy;
      let tsx = -rsy;
      let tsy = rsx;
      if (tsx * (m.x - s.x) + tsy * (m.y - s.y) < 0) {
        tsx = -tsx;
        tsy = -tsy;
      }
      const startAngle = Math.atan2(-tsy, -tsx);

      // End endpoint — "into the arc from e" means positive dot with
      // (m − e). The outward direction is the opposite.
      const rex = e.x - cx;
      const rey = e.y - cy;
      let tex = -rey;
      let tey = rex;
      if (tex * (m.x - e.x) + tey * (m.y - e.y) < 0) {
        tex = -tex;
        tey = -tey;
      }
      const endAngle = Math.atan2(-tey, -tex);

      return {
        start: { x: s.x, y: s.y, angle: startAngle },
        end: { x: e.x, y: e.y, angle: endAngle },
      };
    }
  }

  // ── elbow ──
  if (routing === "elbow") {
    const poly =
      n >= 6 ? pts : computeElbowPath(pts, shape.elbowOrientation ?? "HV");
    const m = poly.length;
    if (m >= 4) {
      // Start: walk forward past any zero-length prefix until we find a
      // distinct neighbour. Outward direction = from that neighbour
      // toward the first point.
      let sx1 = poly[0];
      let sy1 = poly[1];
      let startAngle = Math.atan2(sy1 - poly[3], sx1 - poly[2]);
      for (let i = 2; i + 1 < m; i += 2) {
        if (
          Math.abs(poly[i] - sx1) > EPS ||
          Math.abs(poly[i + 1] - sy1) > EPS
        ) {
          startAngle = Math.atan2(sy1 - poly[i + 1], sx1 - poly[i]);
          break;
        }
      }
      // End: same trick from the other side.
      const exP = poly[m - 2];
      const eyP = poly[m - 1];
      let endAngle = Math.atan2(eyP - poly[m - 3], exP - poly[m - 4]);
      for (let i = m - 4; i >= 0; i -= 2) {
        if (
          Math.abs(poly[i] - exP) > EPS ||
          Math.abs(poly[i + 1] - eyP) > EPS
        ) {
          endAngle = Math.atan2(eyP - poly[i + 1], exP - poly[i]);
          break;
        }
      }
      return {
        start: { x: sx1, y: sy1, angle: startAngle },
        end: { x: exP, y: eyP, angle: endAngle },
      };
    }
  }

  // ── straight (default / arc-degenerate fallback) ──
  return {
    start: { x: sx, y: sy, angle: Math.atan2(sy - ey, sx - ex) },
    end: { x: ex, y: ey, angle: Math.atan2(ey - sy, ex - sx) },
  };
}

interface MarkerNodeProps {
  kind: LineMarkerKind;
  x: number;
  y: number;
  /** Outward tangent in radians. */
  angle: number;
  /** Render-space stroke width (already zoom-corrected). Used to size
   *  the glyph proportional to the line. */
  renderStrokeWidth: number;
  stroke: string;
  opacity: number;
}

/** One marker glyph, anchored with its *back edge* at (x, y), body
 *  extending in the +x direction of its local frame, then rotated by
 *  `angle` (rad). The whole glyph sits beyond the stored endpoint so
 *  the line terminates *into* the marker (lollipop-style) rather than
 *  being overlapped by it. `renderStrokeWidth` is already in render
 *  units so the glyph sizes agree with the rendered stroke width on
 *  screen. */
function MarkerNode({
  kind,
  x,
  y,
  angle,
  renderStrokeWidth,
  stroke,
  opacity,
}: MarkerNodeProps) {
  if (kind === "none") return null;
  // Floor at 0.5 so a hairline stroke still produces a visible glyph.
  const w = Math.max(0.5, renderStrokeWidth);
  // Glyph proportions — float minimums keep thin lines readable.
  const L = Math.max(8, w * 4);
  const W = Math.max(6, w * 3);
  const lineW = Math.max(1, w);
  const rotationDeg = (angle * 180) / Math.PI;

  let glyph: React.ReactNode = null;
  switch (kind) {
    case "roundedEdge":
      // Not a glyph — this marker is a property of the line's own
      // stroke (lineCap="round"). The caller (Canvas.tsx /
      // PresenterShape.tsx) reads `shape.startMarker` /
      // `shape.endMarker` to switch its `lineCap` between "butt" and
      // "round"; nothing gets drawn here.
      return null;
    case "standardArrow":
      // Open chevron whose tip sits AT the endpoint (x=0) and whose
      // tail points back into the line (x=-L). Unlike circles /
      // squares / diamonds, arrows are a classical "within the line"
      // terminator: the tip marks the stroke's end rather than sitting
      // past it. `closed={false}` leaves the back of the V open so the
      // underlying line visually flows into the chevron.
      glyph = (
        <Line
          points={[-L, -W / 2, 0, 0, -L, W / 2]}
          stroke={stroke}
          strokeWidth={lineW}
          lineCap="round"
          lineJoin="round"
          closed={false}
          listening={false}
        />
      );
      break;
    case "solidArrow":
      // Filled triangle — same vertices as the open chevron, closed.
      // Tip at (0, 0); tail at x=-L. The fill covers the stroke
      // segment that overlaps the tail region.
      glyph = (
        <Line
          points={[-L, -W / 2, 0, 0, -L, W / 2]}
          fill={stroke}
          stroke={stroke}
          strokeWidth={lineW}
          lineJoin="round"
          closed
          listening={false}
        />
      );
      break;
    case "openCircle":
      // Circles / squares / diamonds / arrows all sit *past* the line
      // endpoint (leftmost / back edge at the endpoint, body
      // extending outward) — matching ER-diagram / flowchart
      // conventions where the line terminates INTO its end-cap.
      glyph = (
        <Circle
          x={L / 2}
          y={0}
          radius={L / 2}
          stroke={stroke}
          strokeWidth={lineW}
          listening={false}
        />
      );
      break;
    case "solidCircle":
      glyph = (
        <Circle
          x={L / 2}
          y={0}
          radius={L / 2}
          fill={stroke}
          listening={false}
        />
      );
      break;
    case "openSquare":
      glyph = (
        <Rect
          x={0}
          y={-W / 2}
          width={L}
          height={W}
          stroke={stroke}
          strokeWidth={lineW}
          listening={false}
        />
      );
      break;
    case "solidSquare":
      glyph = (
        <Rect
          x={0}
          y={-W / 2}
          width={L}
          height={W}
          fill={stroke}
          listening={false}
        />
      );
      break;
    case "openDiamond":
      // Kite: left tip at the endpoint, top, right tip past the
      // endpoint, bottom.
      glyph = (
        <Line
          points={[0, 0, L / 2, -W / 2, L, 0, L / 2, W / 2]}
          stroke={stroke}
          strokeWidth={lineW}
          lineJoin="round"
          closed
          listening={false}
        />
      );
      break;
    case "solidDiamond":
      glyph = (
        <Line
          points={[0, 0, L / 2, -W / 2, L, 0, L / 2, W / 2]}
          fill={stroke}
          stroke={stroke}
          strokeWidth={lineW}
          lineJoin="round"
          closed
          listening={false}
        />
      );
      break;
    case "flatBar":
      // Perpendicular cap, drawn AT the endpoint itself — a "past the
      // endpoint" tick would float, disconnected from the line. The
      // glyph's local +y axis becomes the screen perpendicular-to-line
      // axis after rotation.
      glyph = (
        <Line
          points={[0, -W / 2, 0, W / 2]}
          stroke={stroke}
          strokeWidth={Math.max(1.5, lineW * 1.3)}
          lineCap="round"
          listening={false}
        />
      );
      break;
  }

  return (
    <Group
      x={x}
      y={y}
      rotation={rotationDeg}
      opacity={opacity}
      listening={false}
    >
      {glyph}
    </Group>
  );
}

interface LineMarkerEndsProps {
  shape: LineShape;
  /** Current zoom. Pass 1 from the presenter (fit-scale is baked into
   *  its parent Group). */
  zoom: number;
  /** When the caller's primary path render is forcing a different
   *  routing (e.g. Canvas.tsx forces "straight" during the draw
   *  gesture), pass it here so the marker tangent stays in sync. */
  routingOverride?: LineRouting;
}

/** Renders both start + end markers for a LineShape, or null when both
 *  are `"none"`. Use inside the LineShape render branch in
 *  `Canvas.tsx` / `PresenterShape.tsx`. */
export function LineMarkerEnds({
  shape,
  zoom,
  routingOverride,
}: LineMarkerEndsProps) {
  const startKind = shape.startMarker ?? "none";
  const endKind = shape.endMarker ?? "none";
  if (startKind === "none" && endKind === "none") return null;

  const stroke = shape.stroke ?? "#2c2a27";
  const opacity = shape.opacity ?? 1;
  const stored = shape.strokeWidth ?? 1;
  // Match Canvas's `renderStrokeWidth` rule so marker sizes agree with
  // the rendered stroke width at any zoom.
  const renderStrokeWidth =
    shape.strokeWidthUnit === "world" ? stored : stored / (zoom || 1);

  const { start, end } = lineEndpointTangents(shape, routingOverride);
  return (
    <>
      {startKind !== "none" && (
        <MarkerNode
          kind={startKind}
          x={start.x}
          y={start.y}
          angle={start.angle}
          renderStrokeWidth={renderStrokeWidth}
          stroke={stroke}
          opacity={opacity}
        />
      )}
      {endKind !== "none" && (
        <MarkerNode
          kind={endKind}
          x={end.x}
          y={end.y}
          angle={end.angle}
          renderStrokeWidth={renderStrokeWidth}
          stroke={stroke}
          opacity={opacity}
        />
      )}
    </>
  );
}
