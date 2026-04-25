import { useStore, uid } from "../store";
import type { ImageShape, ViewItem } from "../types";

// Mapping of the Tailwind color names actually used in the views palette
// (see `palettes` in store.ts) to their hex values. Keep this list in sync
// with that array — only the names that appear there need to be mapped.
const TAILWIND_HEX: Record<string, string> = {
  "indigo-400": "#818cf8",
  "indigo-500": "#6366f1",
  "purple-500": "#a855f7",
  "violet-600": "#7c3aed",
  "emerald-400": "#34d399",
  "emerald-500": "#10b981",
  "teal-500": "#14b8a6",
  "rose-500": "#f43f5e",
  "orange-500": "#f97316",
  "sky-500": "#0ea5e9",
  "cyan-400": "#22d3ee",
  "amber-500": "#f59e0b",
  "yellow-300": "#fde047",
  "fuchsia-500": "#d946ef",
  "pink-500": "#ec4899",
  "lime-500": "#84cc16",
};

// Default size for an inserted view image. 4:3 mirrors the sidebar thumbnail
// aspect, large enough to read on a sheet but small enough to fit without
// triggering the natural-size clamp in the upload path.
const DEFAULT_W = 480;
const DEFAULT_H = 360;

/** Parse a Tailwind gradient class string of the form
 *  `"from-<color> to-<color>"` (optionally with `via-<color>`) into the
 *  two endpoint hex colors. Falls back to neutral grays if the class
 *  doesn't match the expected shape. */
function parseGradient(thumbnail: string): { from: string; to: string } {
  const fromMatch = thumbnail.match(/from-([a-z]+-\d+)/);
  const toMatch = thumbnail.match(/to-([a-z]+-\d+)/);
  const from =
    (fromMatch && TAILWIND_HEX[fromMatch[1]]) ?? "#475569";
  const to = (toMatch && TAILWIND_HEX[toMatch[1]]) ?? "#1e293b";
  return { from, to };
}

/** Rasterize a view's gradient thumbnail to a PNG data URL. The gradient
 *  runs top-left → bottom-right to match the `bg-gradient-to-br` direction
 *  used in the sidebar. */
export function viewThumbnailToDataUrl(
  thumbnail: string,
  w = DEFAULT_W,
  h = DEFAULT_H
): string {
  const { from, to } = parseGradient(thumbnail);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return canvas.toDataURL("image/png");
}

interface InsertOptions {
  sheetId: string;
  /** Sheet-local coordinate. Treated as top-left unless `center` is true. */
  x: number;
  /** Sheet-local coordinate. Treated as top-left unless `center` is true. */
  y: number;
  /** When true, place the image so its center sits at (x, y). */
  center?: boolean;
}

/** Insert a view as an ImageShape on the canvas. Rasterizes the gradient
 *  thumbnail to a data URL and dispatches `addShape`. The position is
 *  always clamped to fit inside the target sheet — drag-drop near the
 *  sheet edge or a viewport-center insert that lands outside the sheet
 *  will be pulled back so the entire image stays on the page. Also
 *  activates the target sheet so its layer group expands in the left
 *  sidebar, surfacing the new entry without an extra click. Returns
 *  the new shape id, or null when the sheet/view is missing. */
export function insertViewShape(
  view: ViewItem,
  opts: InsertOptions
): string | null {
  const src = viewThumbnailToDataUrl(view.thumbnail);
  if (!src) return null;

  const st = useStore.getState();
  const sheet = st.sheets.find((s) => s.id === opts.sheetId);
  if (!sheet) return null;

  const width = DEFAULT_W;
  const height = DEFAULT_H;
  // Treat the input as top-left unless `center` is set, then clamp the
  // resulting rect into [0, sheet.w] × [0, sheet.h]. When the image is
  // larger than the sheet on an axis, center it on that axis (yields
  // symmetric overflow) — the alternative of pinning to (0, 0) would
  // hide the right/bottom portion of the image off-sheet asymmetrically.
  const desiredX = opts.center ? opts.x - width / 2 : opts.x;
  const desiredY = opts.center ? opts.y - height / 2 : opts.y;
  const x =
    sheet.width >= width
      ? Math.max(0, Math.min(sheet.width - width, desiredX))
      : (sheet.width - width) / 2;
  const y =
    sheet.height >= height
      ? Math.max(0, Math.min(sheet.height - height, desiredY))
      : (sheet.height - height) / 2;

  const shape: ImageShape = {
    id: uid("shape"),
    type: "image",
    sheetId: opts.sheetId,
    name: view.name,
    visible: true,
    locked: false,
    x,
    y,
    width,
    height,
    src,
    naturalWidth: width,
    naturalHeight: height,
  };

  st.addShape(shape);
  // Match the upload path: switch to select tool and select the new image
  // so the user immediately sees the ImageOptionsBar for it. Activating
  // the target sheet also auto-expands its layers group (see
  // `setActiveSheet` in the store) so the new entry is visible right
  // away in the left sidebar's layers tab.
  const latest = useStore.getState();
  latest.setActiveSheet(opts.sheetId);
  latest.setTool("select");
  latest.setSelectedShapeIds([]);
  latest.selectShape(shape.id);
  return shape.id;
}

/** Pick the sheet currently most visible in the viewport. Returns the id
 *  of the sheet whose rect overlaps the visible canvas area by the largest
 *  pixel count. Falls back to `activeSheetId` (then the first sheet) when
 *  no sheet is on screen or the viewport hasn't been measured yet. Used by
 *  the toolbar/keyboard upload path so a new image lands on whatever the
 *  user is looking at, not on a stale active sheet that scrolled offscreen. */
export function pickViewportSheetId(): string | null {
  const st = useStore.getState();
  const { sheets, viewportSize, pan, zoom, activeSheetId } = st;
  const fallback = activeSheetId ?? sheets[0]?.id ?? null;
  if (viewportSize.w <= 0 || viewportSize.h <= 0 || zoom <= 0) return fallback;

  const left = -pan.x / zoom;
  const top = -pan.y / zoom;
  const right = (viewportSize.w - pan.x) / zoom;
  const bottom = (viewportSize.h - pan.y) / zoom;

  let bestId: string | null = null;
  let bestOverlap = 0;
  for (const s of sheets) {
    const ox = Math.max(0, Math.min(right, s.x + s.width) - Math.max(left, s.x));
    const oy = Math.max(0, Math.min(bottom, s.y + s.height) - Math.max(top, s.y));
    const overlap = ox * oy;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestId = s.id;
    }
  }
  return bestId ?? fallback;
}

/** Compute the viewport center in sheet-local coords for a given sheet,
 *  using the store's pan/zoom/viewportSize. Falls back to (80, 80) when
 *  the viewport hasn't been measured yet. Returns `{ x, y, center }` so
 *  callers can pass straight into `InsertOptions`. */
export function viewportCenterInSheet(sheetId: string): {
  x: number;
  y: number;
  center: boolean;
} {
  const st = useStore.getState();
  const sheet = st.sheets.find((s) => s.id === sheetId);
  const vw = st.viewportSize.w;
  const vh = st.viewportSize.h;
  if (!sheet || vw <= 0 || vh <= 0) {
    return { x: 80, y: 80, center: false };
  }
  const worldCx = (vw / 2 - st.pan.x) / st.zoom;
  const worldCy = (vh / 2 - st.pan.y) / st.zoom;
  return { x: worldCx - sheet.x, y: worldCy - sheet.y, center: true };
}

/** Custom MIME type used to tag in-app drags of a view from the right
 *  sidebar. The Canvas drop handler checks for this before falling back
 *  to the file-drop branch. */
export const VIEW_DRAG_MIME = "application/x-spaceshow-view";
