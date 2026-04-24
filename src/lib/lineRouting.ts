/**
 * lineRouting — pure geometry for the three LineShape routings.
 *
 * - "straight" — a direct segment between the first and last pivot.
 * - "elbow"    — 90°-only path; between each consecutive pivot pair
 *                we insert one axis-aligned corner. Orientation is
 *                fixed per-line ("HV" or "VH") so the shape doesn't
 *                flip when a waypoint crosses the 45° diagonal.
 * - "curved"   — symmetric cubic Bézier S-curve between endpoints,
 *                parameterised by a signed scalar `k` (curvature).
 *
 * No React/Konva imports — this file is import-safe for tests and
 * any future server-side export pipeline.
 */

export const EPS = 1e-6;

export interface Vec2 {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const sub = (a: Vec2, b: Vec2): Vec2 => v(a.x - b.x, a.y - b.y);
export const add = (a: Vec2, b: Vec2): Vec2 => v(a.x + b.x, a.y + b.y);
export const scale = (a: Vec2, k: number): Vec2 => v(a.x * k, a.y * k);
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
// 90° CCW perpendicular.
export const perp = (a: Vec2): Vec2 => v(-a.y, a.x);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

/** Read pivots out of a flat [x1,y1,x2,y2,...] array. */
export function pivots(points: number[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    out.push(v(points[i], points[i + 1]));
  }
  return out;
}

export type ElbowOrientation = "HV" | "VH";

/**
 * Insert one axis-aligned corner between each consecutive pivot pair.
 * Collinear pairs (dx≈0 or dy≈0) emit a straight segment with no corner.
 * Coincident points are deduplicated so dashes render correctly.
 */
export function computeElbowPath(
  points: number[],
  orientation: ElbowOrientation,
): number[] {
  if (points.length < 4) return points.slice();
  const pv = pivots(points);
  const out: number[] = [];
  const pushPt = (p: Vec2) => {
    const n = out.length;
    if (n >= 2 && Math.abs(out[n - 2] - p.x) < EPS && Math.abs(out[n - 1] - p.y) < EPS) {
      return;
    }
    out.push(p.x, p.y);
  };
  for (let i = 0; i + 1 < pv.length; i++) {
    const a = pv[i];
    const b = pv[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    pushPt(a);
    if (Math.abs(dx) < EPS || Math.abs(dy) < EPS) {
      // Axis-aligned or zero-length — straight segment, no corner.
    } else if (orientation === "HV") {
      pushPt(v(b.x, a.y));
    } else {
      pushPt(v(a.x, b.y));
    }
    pushPt(b);
  }
  return out;
}

/** Midpoint of each rendered segment of the elbow path, for the
 *  insert-a-waypoint affordance. Returns one Vec2 per segment. */
export function elbowSegmentMidpoints(
  points: number[],
  orientation: ElbowOrientation,
): Vec2[] {
  const poly = computeElbowPath(points, orientation);
  const mids: Vec2[] = [];
  for (let i = 0; i + 3 < poly.length; i += 2) {
    mids.push(v((poly[i] + poly[i + 2]) / 2, (poly[i + 1] + poly[i + 3]) / 2));
  }
  return mids;
}

export interface CurvedPath {
  /** First cubic control point. */
  p1: Vec2;
  /** Second cubic control point. */
  p2: Vec2;
  /** SVG path data ready for Konva `<Path data={d}>`. */
  d: string;
}

/**
 * Cubic Bézier S-curve.
 *
 *   P1 = S + (E − S)·⅓ + N · k · L
 *   P2 = S + (E − S)·⅔ − N · k · L
 *
 * where N = 90°CCW(E − S)/L. Opposite-signed perpendicular offsets at
 * the 1/3 and 2/3 parameters produce a symmetric S-shape that collapses
 * to a straight cubic at k = 0.
 */
export function computeCurvedPath(s: Vec2, e: Vec2, k: number): CurvedPath {
  const chord = sub(e, s);
  const L = len(chord);
  if (L < EPS) {
    // Degenerate — render as a zero-length segment; callers should
    // guard against rendering at all when L is this small.
    return {
      p1: v(s.x, s.y),
      p2: v(e.x, e.y),
      d: `M ${s.x} ${s.y} L ${e.x} ${e.y}`,
    };
  }
  const N = v(-chord.y / L, chord.x / L);
  const offset = k * L;
  const p1 = add(add(s, scale(chord, 1 / 3)), scale(N, offset));
  const p2 = sub(add(s, scale(chord, 2 / 3)), scale(N, offset));
  const d = `M ${s.x} ${s.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${e.x} ${e.y}`;
  return { p1, p2, d };
}

/** Where the curvature-affordance handle sits in world coords.
 *  Note: this is an affordance, not a point on the curve — but the
 *  drag response is linear so the direction and magnitude feel right. */
export function curvatureHandlePos(s: Vec2, e: Vec2, k: number): Vec2 {
  const chord = sub(e, s);
  const L = len(chord);
  const mid = v((s.x + e.x) / 2, (s.y + e.y) / 2);
  if (L < EPS) return mid;
  const N = v(-chord.y / L, chord.x / L);
  return add(mid, scale(N, k * L));
}

/** Invert a curvature handle drag back to a scalar k.
 *  Clamped to ±2 so the UI can't push control points arbitrarily far. */
export function curvatureFromHandle(s: Vec2, e: Vec2, handle: Vec2): number {
  const chord = sub(e, s);
  const L = len(chord);
  if (L < EPS) return 0;
  const N = v(-chord.y / L, chord.x / L);
  const mid = v((s.x + e.x) / 2, (s.y + e.y) / 2);
  const offset = sub(handle, mid);
  return clamp(dot(offset, N) / L, -2, 2);
}

// ─── Explicit orthogonal-polyline helpers ──────────────────────────────
//
// These operate on the NEW elbow representation where `LineShape.points`
// stores the full rendered polyline (every axis-aligned vertex is
// explicit), and the invariant is that each consecutive pair shares x or
// shares y. The canonical Z-shape elbow has 3 vertices (length-6 points).

/** Classify a segment as horizontal ("h", shares y), vertical ("v",
 *  shares x), or "degenerate" (endpoints coincide). For legacy-but-
 *  not-axis-aligned inputs, returns the dominant axis — callers that
 *  need strict classification should guard with a tolerance. */
export function segmentAxis(a: Vec2, b: Vec2): "h" | "v" | "degenerate" {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx < EPS && dy < EPS) return "degenerate";
  if (dy < EPS) return "h";
  if (dx < EPS) return "v";
  return dx > dy ? "h" : "v";
}

/** Break a flat points array into segment pairs — one [a, b] per rendered
 *  segment. A length-6 polyline yields 2 segments. */
export function segmentsFromPolyline(points: number[]): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  for (let i = 0; i + 3 < points.length; i += 2) {
    out.push([
      v(points[i], points[i + 1]),
      v(points[i + 2], points[i + 3]),
    ]);
  }
  return out;
}

/** Translate the middle segment at index `segIdx` perpendicular to its
 *  axis by `delta`. Horizontal segment → delta in y; vertical segment →
 *  delta in x. Neighbour segments stay axis-aligned because the
 *  invariant guarantees they share the *other* axis with the dragged
 *  segment's endpoints, which we don't touch. Returns a new points
 *  array (same length). Callers must detect first/last-segment drags
 *  separately — for those, use `insertSegmentAtEndpoint`. */
export function translateSegmentPerpendicular(
  points: number[],
  segIdx: number,
  delta: number,
): number[] {
  const i = 2 * segIdx;
  if (i + 3 >= points.length) return points.slice();
  const A = v(points[i], points[i + 1]);
  const B = v(points[i + 2], points[i + 3]);
  const axis = segmentAxis(A, B);
  const out = points.slice();
  if (axis === "h") {
    out[i + 1] = A.y + delta;
    out[i + 3] = B.y + delta;
  } else if (axis === "v") {
    out[i] = A.x + delta;
    out[i + 2] = B.x + delta;
  }
  return out;
}

/** First/last segment drag: insert a new orthogonal stub at the anchored
 *  endpoint so the endpoint stays put while the segment body slides by
 *  `delta`. Net: +1 vertex (+2 numbers). */
export function insertSegmentAtEndpoint(
  points: number[],
  end: "start" | "end",
  delta: number,
): number[] {
  if (points.length < 4) return points.slice();
  const n = points.length;
  if (end === "start") {
    const A = v(points[0], points[1]);
    const B = v(points[2], points[3]);
    const axis = segmentAxis(A, B);
    if (axis === "degenerate") return points.slice();
    let Ap: Vec2, Bp: Vec2;
    if (axis === "h") {
      Ap = v(A.x, A.y + delta);
      Bp = v(B.x, A.y + delta);
    } else {
      Ap = v(A.x + delta, A.y);
      Bp = v(A.x + delta, B.y);
    }
    const out = points.slice();
    // Replace B (indices 2..3) with [A', B'] — 4 numbers. A stays, net +2.
    out.splice(2, 2, Ap.x, Ap.y, Bp.x, Bp.y);
    return out;
  } else {
    const P = v(points[n - 4], points[n - 3]);
    const E = v(points[n - 2], points[n - 1]);
    const axis = segmentAxis(P, E);
    if (axis === "degenerate") return points.slice();
    let Pp: Vec2, Ep: Vec2;
    if (axis === "h") {
      Pp = v(P.x, P.y + delta);
      Ep = v(E.x, P.y + delta);
    } else {
      Pp = v(P.x + delta, P.y);
      Ep = v(P.x + delta, E.y);
    }
    const out = points.slice();
    // Replace P (indices n-4..n-3) with [P', E'] — 4 numbers. E stays, net +2.
    out.splice(n - 4, 2, Pp.x, Pp.y, Ep.x, Ep.y);
    return out;
  }
}

/** Build the canonical 3-vertex orthogonal polyline between start `s`
 *  and end `e`. HV places the corner at (e.x, s.y) — horizontal leg
 *  first. VH at (s.x, e.y). The corner may coincide with an endpoint
 *  when s/e are collinear on x or y; this is fine visually and
 *  preserves the invariant trivially. */
export function canonicalizeOrthogonalPolyline(
  s: Vec2,
  e: Vec2,
  orientation: ElbowOrientation,
): number[] {
  const corner = orientation === "HV" ? v(e.x, s.y) : v(s.x, e.y);
  return [s.x, s.y, corner.x, corner.y, e.x, e.y];
}

/** Migrate a legacy length-4 elbow points array (2 pivots, corner
 *  derived at render time by `computeElbowPath`) to the new explicit
 *  length-6 polyline form. Identity-returns if already ≥ 6. Visually
 *  unchanged — the expanded polyline renders the same Z-shape that
 *  `computeElbowPath` used to produce. */
export function expandLegacyElbowToPolyline(
  points: number[],
  orientation: ElbowOrientation,
): number[] {
  if (points.length >= 6) return points.slice();
  if (points.length < 4) return points.slice();
  const s = v(points[0], points[1]);
  const e = v(points[2], points[3]);
  return canonicalizeOrthogonalPolyline(s, e, orientation);
}

/**
 * For each segment of a rounded-elbow polyline, return the endpoints of
 * its *visible straight portion* — i.e. the segment clipped by the arc
 * zones at each interior corner. The first and last segments have their
 * endpoint side unclipped (endpoints are never rounded). Non-endpoint
 * sides are pulled in by `rEff` along the segment direction, where
 * `rEff = min(radius, halfIncomingLen, halfOutgoingLen)` — identical to
 * the clamp used by `buildRoundedElbowPath`.
 *
 * Callers use these endpoints to place segment-midpoint handles on the
 * straight part of a segment (avoiding the arc zones) and to decide
 * whether a segment is long enough to show a handle at all.
 */
export function roundedElbowVisibleSegments(
  points: number[],
  radius: number,
): [Vec2, Vec2][] {
  const pv = pivots(points);
  const out: [Vec2, Vec2][] = [];
  if (pv.length < 2) return out;
  // Pre-compute rEff at each interior vertex.
  const rEff: number[] = new Array(pv.length).fill(0);
  for (let i = 1; i < pv.length - 1; i++) {
    const inLen = len(sub(pv[i], pv[i - 1]));
    const outLen = len(sub(pv[i + 1], pv[i]));
    if (inLen < EPS || outLen < EPS) {
      rEff[i] = 0;
      continue;
    }
    rEff[i] = Math.max(0, Math.min(radius, inLen / 2, outLen / 2));
  }
  for (let i = 0; i + 1 < pv.length; i++) {
    const a = pv[i];
    const b = pv[i + 1];
    const segLen = len(sub(b, a));
    if (segLen < EPS) {
      out.push([a, b]);
      continue;
    }
    // Unit vector a→b.
    const ux = (b.x - a.x) / segLen;
    const uy = (b.y - a.y) / segLen;
    // Clip on the `a` side only when `a` is an interior corner (not the
    // first endpoint). Same for `b`.
    const clipA = i === 0 ? 0 : rEff[i];
    const clipB = i === pv.length - 2 ? 0 : rEff[i + 1];
    out.push([
      v(a.x + ux * clipA, a.y + uy * clipA),
      v(b.x - ux * clipB, b.y - uy * clipB),
    ]);
  }
  return out;
}

/**
 * Build an SVG path for an orthogonal polyline with rounded corners.
 *
 * Each internal vertex (every vertex except the two endpoints) becomes a
 * quadratic-Bézier arc of effective radius
 *   rEff = min(radius, halfIncomingSegLen, halfOutgoingSegLen).
 *
 * The arc replaces the vertex with a short straight "entry" segment, a
 * curve whose control point IS the vertex itself, and a short straight
 * "exit" segment. Clamping rEff to half-adjacent-lengths means short
 * segments degrade gracefully — the arc shrinks instead of overshooting
 * into the next vertex.
 *
 * Returns an SVG path data string suitable for Konva's `<Path data={d}>`.
 * Length-4 inputs (no internal vertices) produce a simple `M…L…` line.
 */
export function buildRoundedElbowPath(
  points: number[],
  radius: number,
): string {
  if (points.length < 4) return "";
  const pv = pivots(points);
  if (pv.length < 2) return "";
  // No internal vertices — just a straight line.
  if (pv.length === 2) {
    return `M ${pv[0].x} ${pv[0].y} L ${pv[1].x} ${pv[1].y}`;
  }
  let d = `M ${pv[0].x} ${pv[0].y}`;
  for (let i = 1; i < pv.length - 1; i++) {
    const prev = pv[i - 1];
    const cur = pv[i];
    const next = pv[i + 1];
    const inVec = sub(cur, prev);
    const outVec = sub(next, cur);
    const inLen = len(inVec);
    const outLen = len(outVec);
    if (inLen < EPS || outLen < EPS) {
      // Degenerate neighbour — skip rounding, fall back to a straight
      // line to the vertex.
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    const rEff = Math.max(0, Math.min(radius, inLen / 2, outLen / 2));
    const entry = sub(cur, scale(inVec, rEff / inLen));
    const exit = add(cur, scale(outVec, rEff / outLen));
    d += ` L ${entry.x} ${entry.y} Q ${cur.x} ${cur.y} ${exit.x} ${exit.y}`;
  }
  const last = pv[pv.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}
