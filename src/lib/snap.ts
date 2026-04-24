// ─────────────────────────────────────────────────────────────────────────────
// snap.ts — shared snap utilities used by ruler-drag guide creation AND guide
// repositioning. The callers pass an axis ("h" = horizontal guide, value is
// world Y; "v" = vertical guide, value is world X), the current sheets and
// guides, and a threshold in world units. We return a (possibly) snapped
// value plus the source kind for visual feedback.
// ─────────────────────────────────────────────────────────────────────────────

import type { Sheet, Guide } from "../types";

export type SnapKind = "sheet-edge" | "sheet-center" | "guide" | "grid";

export interface SnapCandidate {
  value: number;
  kind: SnapKind;
}

/**
 * Collect every snap candidate on the given axis from the current sheets and
 * guides. `excludeGuideId` skips one guide (used during reposition so a guide
 * doesn't snap to its own pre-move value).
 *
 * For axis="h" returns world-Y values (the axis an H-guide moves along).
 * For axis="v" returns world-X values.
 *
 * Sheet rotation is intentionally ignored: sheets are axis-aligned at the
 * data layer (see `Sheet.x/y/width/height` in types.ts; `rotation` is render-
 * only). Snapping to an unrotated bbox matches what the rulers measure too.
 */
export function collectSnapPoints(
  axis: "h" | "v",
  sheets: Sheet[],
  guides: Guide[],
  excludeGuideId?: string
): SnapCandidate[] {
  const out: SnapCandidate[] = [];
  for (const s of sheets) {
    if (axis === "h") {
      out.push({ value: s.y, kind: "sheet-edge" });
      out.push({ value: s.y + s.height, kind: "sheet-edge" });
      out.push({ value: s.y + s.height / 2, kind: "sheet-center" });
    } else {
      out.push({ value: s.x, kind: "sheet-edge" });
      out.push({ value: s.x + s.width, kind: "sheet-edge" });
      out.push({ value: s.x + s.width / 2, kind: "sheet-center" });
    }
  }
  for (const g of guides) {
    if (g.id === excludeGuideId) continue;
    if (g.axis === axis) out.push({ value: g.value, kind: "guide" });
  }
  return out;
}

/**
 * Snap a raw world value to the nearest candidate within `thresholdWorld`
 * (world units). Falls back to grid alignment — nearest multiple of
 * `gridGap` — if no explicit candidate is close and `gridGap > 0`. When
 * nothing is within threshold, returns the raw value with source=null.
 *
 * Explicit candidates win ties with grid: a sheet edge 1px from the cursor
 * beats a grid line also 1px away.
 */
export function snapValue(
  raw: number,
  candidates: SnapCandidate[],
  thresholdWorld: number,
  gridGap: number | null
): { value: number; source: SnapKind | null } {
  let bestDist = thresholdWorld;
  let bestVal = raw;
  let bestKind: SnapKind | null = null;
  for (const c of candidates) {
    const d = Math.abs(c.value - raw);
    if (d < bestDist) {
      bestDist = d;
      bestVal = c.value;
      bestKind = c.kind;
    }
  }
  if (bestKind === null && gridGap && gridGap > 0) {
    const snapped = Math.round(raw / gridGap) * gridGap;
    if (Math.abs(snapped - raw) < thresholdWorld) {
      return { value: snapped, source: "grid" };
    }
  }
  return { value: bestVal, source: bestKind };
}
