import type { Sheet, Thread } from "../types";

/**
 * Camera state needed for world↔screen conversion. Matches the shape used
 * by `useStore` (`zoom: number`, `pan: { x, y }`) so callers can pass the
 * subscription result through without massaging it.
 */
export interface Camera {
  zoom: number;
  pan: { x: number; y: number };
}

export interface ScreenAnchor {
  /** World coordinates of the pin (after sheet rotation, if any). */
  wx: number;
  wy: number;
  /** Screen-space coordinates of the pin. */
  sx: number;
  sy: number;
}

/**
 * Compute the world + screen coordinates of a thread pin. Mirrors the math
 * inside `CommentPinLayer`'s nested rotation Group so a DOM popover can be
 * anchored exactly on top of the pin even when the pin's parent sheet is
 * rotated.
 *
 *   - **Board pins** use `thread.coordinates` directly as world coords.
 *   - **Sheet pins** are stored sheet-local. World position is the sheet
 *     center plus the rotated offset of the local coordinate from the
 *     sheet's center: `(p_local − sheet.center)` rotated by
 *     `sheet.rotation`, then added back to `sheet.center`.
 *
 * Used by `ThreadPopover` (every render, to keep the popover glued to the
 * pin under pan/zoom) and by `focusThread` (on list-row click, to compute
 * the pan target that puts the pin at viewport center). Keeping the math
 * here ensures both surfaces agree byte-for-byte on where the pin lives.
 */
export function screenAnchorForThread(
  thread: Thread,
  sheets: Sheet[],
  camera: Camera
): ScreenAnchor {
  const sheet =
    thread.canvasId === "board"
      ? null
      : sheets.find((s) => s.id === thread.canvasId) ?? null;

  let wx: number;
  let wy: number;
  if (!sheet) {
    wx = thread.coordinates.x;
    wy = thread.coordinates.y;
  } else {
    const cx = sheet.x + sheet.width / 2;
    const cy = sheet.y + sheet.height / 2;
    const lx = thread.coordinates.x - sheet.width / 2;
    const ly = thread.coordinates.y - sheet.height / 2;
    const rotDeg = sheet.rotation ?? 0;
    if (rotDeg === 0) {
      // Hot path — sheets are unrotated 99% of the time, skip trig.
      wx = cx + lx;
      wy = cy + ly;
    } else {
      const r = (rotDeg * Math.PI) / 180;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      wx = cx + cos * lx - sin * ly;
      wy = cy + sin * lx + cos * ly;
    }
  }

  const sx = wx * camera.zoom + camera.pan.x;
  const sy = wy * camera.zoom + camera.pan.y;
  return { wx, wy, sx, sy };
}
