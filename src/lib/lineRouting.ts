/**
 * lineRouting — pure geometry for the four LineShape routings.
 *
 * - "straight" — a direct segment between the first and last pivot.
 * - "elbow"    — 90°-only path; between each consecutive pivot pair
 *                we insert one axis-aligned corner. Orientation is
 *                fixed per-line ("HV" or "VH") so the shape doesn't
 *                flip when a waypoint crosses the 45° diagonal.
 * - "curved"   — a multi-bend cubic Bézier spline defined by
 *                `LineShape.curveAnchors`: an array of CurveAnchor
 *                entries where anchors[0] and anchors[N-1] are the
 *                endpoints and interior entries are user-added bends.
 *                Each anchor carries (optional) in/out tangent offsets;
 *                missing tangents are filled in at render time by
 *                `autoSmoothTangents`. Legacy lines that only have the
 *                scalar (`curvature`, `curvature2`) pair render through
 *                the same pipeline via `resolveCurveAnchors`, which
 *                derives a 2-anchor spline whose rendered curve is
 *                byte-identical to the old two-pill renderer
 *                (`computeCurvedPath2`).
 * - "arc"      — circular arc through three points (start, mid, end).
 *                Stored in `points` as length-4 (freshly drawn;
 *                `resolveArcPoints` derives a default mid) or length-6
 *                `[sx, sy, mx, my, ex, ey]` (after first handle edit).
 *                Collinear triples fall back to a straight segment.
 *                `computeArcPath` emits a single SVG A-command.
 *
 * No React/Konva imports — this file is import-safe for tests and
 * any future server-side export pipeline.
 */
import type { CurveAnchor } from "../types";


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

// ─── Two-pill curved-line helpers ─────────────────────────────────────
//
// The asymmetric cubic Bézier variant used when the user has two pill
// handles on a curved line. Each pill's perpendicular offset from the
// chord controls one of (k1, k2); the curve is therefore not forced to
// be point-symmetric about the chord midpoint. Legacy call sites keep
// using `computeCurvedPath(s, e, k)` which is exactly
// `computeCurvedPath2(s, e, k, -k)` — byte-identical output.

/** Asymmetric cubic Bézier.
 *
 *   cp1 = S + (E − S)·⅓ + N · k1 · L
 *   cp2 = S + (E − S)·⅔ + N · k2 · L
 *
 * where N = 90°CCW(E − S)/L. k2 = −k1 reproduces the symmetric S-curve
 * from `computeCurvedPath`. k2 = +k1 gives a single-bow C-arc. Any
 * other (k1, k2) pair gives an asymmetric curve. */
export function computeCurvedPath2(
  s: Vec2,
  e: Vec2,
  k1: number,
  k2: number,
): CurvedPath {
  const chord = sub(e, s);
  const L = len(chord);
  if (L < EPS) {
    return {
      p1: v(s.x, s.y),
      p2: v(e.x, e.y),
      d: `M ${s.x} ${s.y} L ${e.x} ${e.y}`,
    };
  }
  const N = v(-chord.y / L, chord.x / L);
  const p1 = add(add(s, scale(chord, 1 / 3)), scale(N, k1 * L));
  const p2 = add(add(s, scale(chord, 2 / 3)), scale(N, k2 * L));
  const d = `M ${s.x} ${s.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${e.x} ${e.y}`;
  return { p1, p2, d };
}

/** On-curve positions for the two pill handles on an asymmetric curve.
 *  Pill A sits at B(1/3) of the cubic, pill B at B(2/3). These points
 *  are exactly on the rendered curve — not affordances, not approximations.
 *
 *  Derivation (with chord-aligned axes so N = (0, 1) and L on the x-axis):
 *    B(1/3) = (L/3,  L·(4 k1 + 2 k2) / 9)
 *    B(2/3) = (2L/3, L·(2 k1 + 4 k2) / 9)
 */
export function pillPositions2(
  s: Vec2,
  e: Vec2,
  k1: number,
  k2: number,
): { pA: Vec2; pB: Vec2; dA: number; dB: number } {
  const chord = sub(e, s);
  const L = len(chord);
  if (L < EPS) return { pA: s, pB: e, dA: 0, dB: 0 };
  const N = v(-chord.y / L, chord.x / L);
  const dA = (4 * k1 + 2 * k2) / 9;
  const dB = (2 * k1 + 4 * k2) / 9;
  const pA = add(add(s, scale(chord, 1 / 3)), scale(N, dA * L));
  const pB = add(add(s, scale(chord, 2 / 3)), scale(N, dB * L));
  return { pA, pB, dA, dB };
}

/** Convert a dragged pointer (in world coords) to the new perpendicular
 *  offset of the dragged pill, measured as a fraction of chord length.
 *  `chordT` is 1/3 for pill A, 2/3 for pill B. */
export function pillOffsetFromPointer(
  s: Vec2,
  e: Vec2,
  chordT: number,
  pointer: Vec2,
): number {
  const chord = sub(e, s);
  const L = len(chord);
  if (L < EPS) return 0;
  const N = v(-chord.y / L, chord.x / L);
  const anchor = add(s, scale(chord, chordT));
  const off = sub(pointer, anchor);
  // Signed perpendicular distance as a fraction of L.
  return dot(off, N) / L;
}

/** Solve (k1, k2) so pill A sits at perpendicular offset `dA` (fraction
 *  of L) and pill B sits at offset `dB`. Both clamped to ±2.
 *
 *  Derivation from the linear system
 *    dA = (4 k1 + 2 k2) / 9
 *    dB = (2 k1 + 4 k2) / 9
 *  →  k1 = 3·dA − 1.5·dB
 *     k2 = 3·dB − 1.5·dA
 */
export function curvaturesFromPillOffsets(
  dA: number,
  dB: number,
): { k1: number; k2: number } {
  const k1 = clamp(3 * dA - 1.5 * dB, -2, 2);
  const k2 = clamp(3 * dB - 1.5 * dA, -2, 2);
  return { k1, k2 };
}

// ─── Multi-anchor curved-line helpers ─────────────────────────────────
//
// The Canva-style multi-bend curve. A non-empty `LineShape.curveAnchors`
// is the first-class shape of a curved line: anchors[0] / anchors[N-1]
// are the endpoints and interior entries are user-added bends. Between
// each consecutive pair (a, b) we emit one cubic segment with controls
// (a + a.outHandle) and (b + b.inHandle). Missing tangents are filled
// in by `autoSmoothTangents` using Catmull-Rom → Bézier conversion so
// the author only has to set handles when they want to freeze a tangent
// (Stage 2+).
//
// Legacy curves (no `curveAnchors`; only `curvature` / `curvature2`)
// render through the same pipeline via `resolveCurveAnchors`, which
// derives a 2-anchor spline whose path matches `computeCurvedPath2`
// byte-for-byte — no visible migration step when a legacy file loads.

/** Fill in any missing in/out tangent handles via Catmull-Rom style
 *  auto-smoothing. For each anchor `i` with both a previous and a next
 *  neighbour, the auto-tangent is `(P[i+1] − P[i−1]) / 6`; `outHandle`
 *  points forward and `inHandle` points backward with equal magnitude,
 *  giving C1 continuity at the joins. Endpoints fall back to the single
 *  available chord (length / 3) — the inHandle of the first anchor and
 *  the outHandle of the last anchor are never used by
 *  `computeMultiAnchorPath`, but are set anyway for Stage 2 tangent UI.
 *  Never mutates the input. */
export function autoSmoothTangents(anchors: CurveAnchor[]): CurveAnchor[] {
  const n = anchors.length;
  if (n === 0) return [];
  if (n === 1) return [{ ...anchors[0] }];
  return anchors.map((a, i) => {
    const prev = i > 0 ? anchors[i - 1] : undefined;
    const next = i < n - 1 ? anchors[i + 1] : undefined;
    let autoVec: Vec2;
    if (prev && next) {
      autoVec = v((next.x - prev.x) / 6, (next.y - prev.y) / 6);
    } else if (next) {
      autoVec = v((next.x - a.x) / 3, (next.y - a.y) / 3);
    } else if (prev) {
      autoVec = v((a.x - prev.x) / 3, (a.y - prev.y) / 3);
    } else {
      autoVec = v(0, 0);
    }
    return {
      ...a,
      inHandle: a.inHandle ?? { dx: -autoVec.x, dy: -autoVec.y },
      outHandle: a.outHandle ?? { dx: autoVec.x, dy: autoVec.y },
    };
  });
}

/** Emit the SVG path for a multi-anchor cubic Bézier spline. Callers
 *  should pass the output of `autoSmoothTangents` so every anchor has
 *  defined tangents; missing handles fall back to zero (which produces
 *  a straight segment on that span). */
export function computeMultiAnchorPath(anchors: CurveAnchor[]): string {
  const n = anchors.length;
  if (n < 2) return "";
  const a0 = anchors[0];
  let d = `M ${a0.x} ${a0.y}`;
  for (let i = 0; i < n - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const ah = a.outHandle ?? { dx: 0, dy: 0 };
    const bh = b.inHandle ?? { dx: 0, dy: 0 };
    const cp1x = a.x + ah.dx;
    const cp1y = a.y + ah.dy;
    const cp2x = b.x + bh.dx;
    const cp2y = b.y + bh.dy;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${b.x} ${b.y}`;
  }
  return d;
}

/** Evaluate one cubic Bézier segment at parameter `t`. */
function bezierAt(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  return v(
    u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
    u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
  );
}

/** Find the point on the multi-anchor spline closest to `pt`, returning
 *  the segment index, parameter `t` on that segment, the on-curve point
 *  itself, and the Euclidean distance.
 *
 *  Strategy: 32-sample coarse pass per segment picks the nearest
 *  sample, followed by a local 3-point refinement that halves the step
 *  size a few times. Well within click-affordance tolerance; a full
 *  Newton iteration is unnecessary here. */
export function projectPointToCurve(
  anchors: CurveAnchor[],
  pt: Vec2,
): { segmentIdx: number; t: number; point: Vec2; distance: number } {
  const n = anchors.length;
  if (n < 2) {
    return { segmentIdx: 0, t: 0, point: v(0, 0), distance: Infinity };
  }
  const SAMPLES = 32;
  let bestSeg = 0;
  let bestT = 0;
  let bestPoint: Vec2 = v(anchors[0].x, anchors[0].y);
  let bestDistSq = Infinity;
  for (let i = 0; i < n - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const p0 = v(a.x, a.y);
    const p1 = v(
      a.x + (a.outHandle?.dx ?? 0),
      a.y + (a.outHandle?.dy ?? 0),
    );
    const p2 = v(
      b.x + (b.inHandle?.dx ?? 0),
      b.y + (b.inHandle?.dy ?? 0),
    );
    const p3 = v(b.x, b.y);
    for (let j = 0; j <= SAMPLES; j++) {
      const t = j / SAMPLES;
      const q = bezierAt(p0, p1, p2, p3, t);
      const ddx = q.x - pt.x;
      const ddy = q.y - pt.y;
      const dSq = ddx * ddx + ddy * ddy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestSeg = i;
        bestT = t;
        bestPoint = q;
      }
    }
  }
  // Local refinement on the winning segment.
  const a = anchors[bestSeg];
  const b = anchors[bestSeg + 1];
  const p0 = v(a.x, a.y);
  const p1 = v(
    a.x + (a.outHandle?.dx ?? 0),
    a.y + (a.outHandle?.dy ?? 0),
  );
  const p2 = v(
    b.x + (b.inHandle?.dx ?? 0),
    b.y + (b.inHandle?.dy ?? 0),
  );
  const p3 = v(b.x, b.y);
  let t = bestT;
  let step = 1 / SAMPLES;
  for (let pass = 0; pass < 4; pass++) {
    step /= 2;
    const candidates = [
      Math.max(0, t - step),
      Math.min(1, t + step),
    ];
    let improved = false;
    for (const tc of candidates) {
      if (tc === t) continue;
      const q = bezierAt(p0, p1, p2, p3, tc);
      const ddx = q.x - pt.x;
      const ddy = q.y - pt.y;
      const dSq = ddx * ddx + ddy * ddy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        t = tc;
        bestPoint = q;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return {
    segmentIdx: bestSeg,
    t,
    point: bestPoint,
    distance: Math.sqrt(bestDistSq),
  };
}

/** De Casteljau split of the cubic segment between `a` and `b` at `t`.
 *  The resulting three-anchor chain (a' – newAnchor – b') traces exactly
 *  the same curve as the original two-anchor pair — so splitting and
 *  immediately re-rendering never changes what the user sees.
 *
 *  Outputs:
 *    newAnchor      — to be spliced into the anchor list at position
 *                     between `a` and `b`. mirrored: true by default.
 *    leftOutHandle  — replacement for `a.outHandle` (preserves the
 *                     shape of the left half).
 *    rightInHandle  — replacement for `b.inHandle` (preserves the shape
 *                     of the right half). */
export function splitBezierAtT(
  a: CurveAnchor,
  b: CurveAnchor,
  t: number,
): {
  newAnchor: CurveAnchor;
  leftOutHandle: { dx: number; dy: number };
  rightInHandle: { dx: number; dy: number };
} {
  const p0 = v(a.x, a.y);
  const p1 = v(
    a.x + (a.outHandle?.dx ?? 0),
    a.y + (a.outHandle?.dy ?? 0),
  );
  const p2 = v(
    b.x + (b.inHandle?.dx ?? 0),
    b.y + (b.inHandle?.dy ?? 0),
  );
  const p3 = v(b.x, b.y);
  const lerp = (p: Vec2, q: Vec2): Vec2 =>
    v(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t);
  const q0 = lerp(p0, p1);
  const q1 = lerp(p1, p2);
  const q2 = lerp(p2, p3);
  const r0 = lerp(q0, q1);
  const r1 = lerp(q1, q2);
  const splitPt = lerp(r0, r1);
  return {
    newAnchor: {
      x: splitPt.x,
      y: splitPt.y,
      inHandle: { dx: r0.x - splitPt.x, dy: r0.y - splitPt.y },
      outHandle: { dx: r1.x - splitPt.x, dy: r1.y - splitPt.y },
      mirrored: true,
    },
    leftOutHandle: { dx: q0.x - a.x, dy: q0.y - a.y },
    rightInHandle: { dx: q2.x - b.x, dy: q2.y - b.y },
  };
}

/** Render-time bridge between legacy (`curvature`, `curvature2`) scalars
 *  and the multi-anchor form. Returns `shape.curveAnchors` verbatim
 *  when defined; otherwise derives a three-anchor spline (start, B(0.5)
 *  midpoint, end) whose two cubic segments combine to trace exactly the
 *  same curve as `computeCurvedPath2(s, e, k1, k2)` — byte-identical
 *  rendering, but with an interior anchor exposed so the handle UI has
 *  something to grab on legacy files without a migration step. */
export function resolveCurveAnchors(shape: {
  curveAnchors?: CurveAnchor[];
  points: number[];
  curvature?: number;
  curvature2?: number;
}): CurveAnchor[] {
  if (shape.curveAnchors && shape.curveAnchors.length >= 2) {
    return shape.curveAnchors;
  }
  const n = shape.points.length;
  if (n < 4) return [];
  const s = v(shape.points[0], shape.points[1]);
  const e = v(shape.points[n - 2], shape.points[n - 1]);
  const k1 = shape.curvature ?? 0.3;
  const k2 = shape.curvature2 ?? -k1;
  const chord = sub(e, s);
  const L = len(chord);
  if (L < EPS) {
    return [{ x: s.x, y: s.y }, { x: e.x, y: e.y }];
  }
  const N = v(-chord.y / L, chord.x / L);
  // cp1 = s + chord/3 + N·k1·L ⇒ outHandle(start) = cp1 − s
  const outS = add(scale(chord, 1 / 3), scale(N, k1 * L));
  // cp2 = s + 2·chord/3 + N·k2·L ⇒ inHandle(end) = cp2 − e
  //                             = −chord/3 + N·k2·L
  const inE = add(scale(chord, -1 / 3), scale(N, k2 * L));
  const startAnchor: CurveAnchor = {
    x: s.x,
    y: s.y,
    outHandle: { dx: outS.x, dy: outS.y },
  };
  const endAnchor: CurveAnchor = {
    x: e.x,
    y: e.y,
    inHandle: { dx: inE.x, dy: inE.y },
  };
  // Split the legacy single-cubic at t = 0.5 via De Casteljau. The
  // resulting three-anchor chain renders the same curve — visually
  // indistinguishable — but gives the Handle UI a midpoint anchor to
  // drag without requiring the user to click-to-insert first.
  const split = splitBezierAtT(startAnchor, endAnchor, 0.5);
  return [
    { ...startAnchor, outHandle: split.leftOutHandle },
    split.newAnchor,
    { ...endAnchor, inHandle: split.rightInHandle },
  ];
}

/** Keep `LineShape.points` in sync with the first/last anchor positions.
 *  Called on every write that changes the endpoints so bbox, elbow
 *  migration, selection rect, and any other pivot reader keeps working
 *  without having to learn about `curveAnchors`. */
export function syncPointsFromAnchors(anchors: CurveAnchor[]): number[] {
  const n = anchors.length;
  if (n < 2) return [];
  const a = anchors[0];
  const z = anchors[n - 1];
  return [a.x, a.y, z.x, z.y];
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

// ─── Arc routing ────────────────────────────────────────────────────
// Three-point circular arc. See the file header for layout rules.

/**
 * Resolve a LineShape.points array into the three arc pivots.
 *
 * - length-≥6: returns (points[0..1], points[2..3], points[4..5])
 *   verbatim. Trailing entries are ignored — arc is defined by the
 *   first 3 pivots regardless of array length.
 * - length-4 (legacy / freshly drawn): derives `m` as the chord
 *   midpoint shifted perpendicular by `0.25 · chordLen`. Perpendicular
 *   direction is the chord rotated 90° CCW (via `perp`), so every
 *   newly-drawn arc bows consistently in the same direction.
 * - length-<4 (defensive): treats missing components as 0; if s == e
 *   the "arc" collapses to a point and `computeArcPath` will return
 *   a degenerate straight-line.
 */
export function resolveArcPoints(points: number[]): {
  s: Vec2;
  m: Vec2;
  e: Vec2;
} {
  if (points.length >= 6) {
    return {
      s: v(points[0], points[1]),
      m: v(points[2], points[3]),
      e: v(points[4], points[5]),
    };
  }
  const s = v(points[0] ?? 0, points[1] ?? 0);
  const e = v(points[2] ?? 0, points[3] ?? 0);
  const chord = sub(e, s);
  const chordLen = len(chord);
  if (chordLen < EPS) {
    // Zero-length chord → no meaningful arc direction. Return m = s
    // so the renderer treats it as degenerate.
    return { s, m: s, e };
  }
  const perpUnit = scale(perp(chord), 1 / chordLen);
  const midPt = scale(add(s, e), 0.5);
  const m = add(midPt, scale(perpUnit, chordLen * 0.25));
  return { s, m, e };
}

/**
 * Emit an SVG path for the unique circular arc passing through the
 * three resolved arc pivots.
 *
 * Returns `{ degenerate: true }` with a straight-line path when the
 * three points are collinear (or near-collinear within EPS). The
 * caller can render either the `d` string (always valid) or fall
 * back to a plain `<Line>`; we provide both for ergonomic handling.
 */
export function computeArcPath(points: number[]): {
  d: string;
  degenerate: boolean;
} {
  const { s, m, e } = resolveArcPoints(points);
  const sx = s.x, sy = s.y, mx = m.x, my = m.y, ex = e.x, ey = e.y;

  // Signed 2× area of triangle (s, m, e). Zero ⇒ collinear.
  const D = 2 * (sx * (my - ey) + mx * (ey - sy) + ex * (sy - my));
  if (Math.abs(D) < EPS) {
    return { d: `M ${sx} ${sy} L ${ex} ${ey}`, degenerate: true };
  }

  // Circumcenter via the standard determinant formula.
  const sSq = sx * sx + sy * sy;
  const mSq = mx * mx + my * my;
  const eSq = ex * ex + ey * ey;
  const ux =
    (sSq * (my - ey) + mSq * (ey - sy) + eSq * (sy - my)) / D;
  const uy =
    (sSq * (ex - mx) + mSq * (sx - ex) + eSq * (mx - sx)) / D;
  const center = v(ux, uy);
  const r = Math.hypot(sx - ux, sy - uy);

  // Sweep flag: which rotational direction the arc takes from s to e.
  // In SVG's y-down coordinate system, sweep-flag=1 means positive
  // dΘ (= visually CW on screen). For a given chord (s → e), the
  // center of the circumcircle sits on one side, and the minor arc
  // bulges to the OPPOSITE side. Unpacking SVG's flag algorithm
  // (F.6.5 in the spec) for `(largeArc=0, sweep=1)` with endpoints
  // (0,0)→(100,0): it picks center (50, +37.5) and traces the minor
  // arc through (50, −25) — i.e. sweep=1 produces an UPWARD bow.
  // So the mapping is inverted from the naïve reading: when the
  // cross product is negative (m below chord in y-down), we want the
  // arc to bow DOWNWARD, which is sweep-flag=0.
  const cross = (mx - sx) * (ey - sy) - (my - sy) * (ex - sx);
  const sweepFlag = cross < 0 ? 0 : 1;

  // Large-arc flag: is m on the minor arc (flag=0) or the major arc
  // (flag=1)? The minor arc's apex is on the OPPOSITE side of the
  // chord from the center, so:
  //   - m and center on SAME side of chord ⇒ m is on major arc ⇒ flag=1
  //   - m and center on OPPOSITE sides     ⇒ m is on minor arc ⇒ flag=0
  const n = perp(sub(e, s));
  const dotC = dot(sub(center, s), n);
  const dotM = dot(sub(m, s), n);
  const largeArcFlag = dotC * dotM > 0 ? 1 : 0;

  const d =
    `M ${sx} ${sy} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${ex} ${ey}`;
  return { d, degenerate: false };
}
