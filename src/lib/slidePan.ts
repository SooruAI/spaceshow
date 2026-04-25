import type { Sheet } from "../types";

/**
 * Slide-mode pan behavior. Slide mode is a pure navigation overlay — only
 * the active slide is rendered, and pan is locked to that slide's bbox so
 * the user can never reach another slide by panning. Switching slides
 * happens via the SlideNavigator buttons, keyboard arrows, or clicks in
 * the LeftSidebar Sheets tab. All spatial layout decisions live in board
 * mode; slide mode does not know about other sheets' positions.
 *
 * Coord space: pan is screen-px offset of the world-Group. A world-point
 * `w` projects to screen `w * zoom + pan`. The viewport is the canvas
 * wrapper rect, sized at `viewportW × viewportH` screen-px.
 */

/** Max screen-px of empty workspace allowed past the slide's edge. Small
 *  enough that the user can never escape the slide into "infinite board"
 *  territory; non-zero so the slide doesn't snap-cling to the viewport
 *  edges and feel cramped. */
const SLIDE_PAN_GUTTER_PX = 80;

interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Axis-aligned bounding box of a sheet, accounting for rotation. Sheets
 * rotate around their CENTER (Konva center-origin transform — see
 * Canvas.tsx where offsetX/Y is set to width/2, height/2). For rotation
 * θ the rotated AABB has half-extents
 *   halfW = |cos θ|·w/2 + |sin θ|·h/2
 *   halfH = |sin θ|·w/2 + |cos θ|·h/2
 * which collapses to the unrotated case at θ = 0.
 */
export function rotatedAabb(sheet: Sheet): AABB {
  const rot = sheet.rotation ?? 0;
  const cx = sheet.x + sheet.width / 2;
  const cy = sheet.y + sheet.height / 2;
  if (rot === 0) {
    return {
      minX: sheet.x,
      maxX: sheet.x + sheet.width,
      minY: sheet.y,
      maxY: sheet.y + sheet.height,
    };
  }
  const rad = (rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const halfW = c * (sheet.width / 2) + s * (sheet.height / 2);
  const halfH = s * (sheet.width / 2) + c * (sheet.height / 2);
  return {
    minX: cx - halfW,
    maxX: cx + halfW,
    minY: cy - halfH,
    maxY: cy + halfH,
  };
}

/**
 * Clamp a proposed pan so the active slide's rotated bbox stays at least
 * `SLIDE_PAN_GUTTER_PX` in view in every direction. With pan locked to the
 * active slide alone, the user can pan within the slide for detail editing
 * (especially at high zoom) but cannot reach any other slide by panning —
 * navigation between slides goes through Prev/Next, keyboard, or the
 * LeftSidebar Sheets tab.
 *
 * Returns the proposed pan unchanged when there's no active sheet or the
 * viewport hasn't been measured yet, to avoid locking the canvas into an
 * invalid state during initial mount.
 */
export function clampSlidePan(
  p: { x: number; y: number },
  sheets: Sheet[],
  activeSheetId: string | null,
  zoom: number,
  viewportW: number,
  viewportH: number,
): { x: number; y: number } {
  if (viewportW <= 0 || viewportH <= 0) return p;
  const active = sheets.find((s) => s.id === activeSheetId);
  if (!active) return p;
  const bb = rotatedAabb(active);
  // The slide's screen-space extent is (bb.* * zoom + p.*). To keep the
  // viewport INSIDE the slide (allowing at most `gutter` px of empty space
  // past the slide edge), constrain:
  //   slide_left  ≤ gutter            → p.x ≤ gutter - bb.minX*zoom
  //   slide_right ≥ viewportW - gutter → p.x ≥ viewportW - gutter - bb.maxX*z
  // When the slide is smaller than viewport - 2*gutter (e.g. at fit zoom),
  // min > max — center the slide instead of clamping to a nonsense range.
  const minPanX = viewportW - SLIDE_PAN_GUTTER_PX - bb.maxX * zoom;
  const maxPanX = SLIDE_PAN_GUTTER_PX - bb.minX * zoom;
  const minPanY = viewportH - SLIDE_PAN_GUTTER_PX - bb.maxY * zoom;
  const maxPanY = SLIDE_PAN_GUTTER_PX - bb.minY * zoom;
  const cx = (minPanX + maxPanX) / 2;
  const cy = (minPanY + maxPanY) / 2;
  return {
    x: minPanX > maxPanX ? cx : Math.max(minPanX, Math.min(maxPanX, p.x)),
    y: minPanY > maxPanY ? cy : Math.max(minPanY, Math.min(maxPanY, p.y)),
  };
}
