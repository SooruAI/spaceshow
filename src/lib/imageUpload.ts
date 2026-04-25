import { useStore, uid } from "../store";
import { validateImageFile } from "./imageValidate";
import type { ImageShape } from "../types";

/** Read a File as a data URL. Rejects on abort/error so callers can surface
 *  a decode failure toast without conflating it with validation errors. */
function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.onabort = () => reject(new Error("read aborted"));
    r.readAsDataURL(file);
  });
}

/** Decode a data URL into an HTMLImageElement so we can measure natural size
 *  before creating the shape. Rejects if the browser can't decode it. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = src;
  });
}

interface UploadOptions {
  /** Sheet the new image should live on. */
  sheetId: string;
  /** Sheet-local position. By default this is the new image's top-left corner;
   *  with `center: true` it's treated as the desired CENTER instead. */
  x: number;
  /** Sheet-local position. By default this is the new image's top-left corner;
   *  with `center: true` it's treated as the desired CENTER instead. */
  y: number;
  /** Optional display name; falls back to the file name. */
  name?: string;
  /** When true, place the image so its center sits at (x, y). Used by the
   *  toolbar/keyboard upload paths so the image lands in the viewport
   *  regardless of natural size. Drag-drop keeps the default (top-left). */
  center?: boolean;
}

/** Single source of truth for creating an ImageShape from a File.
 *  Runs: validation → read → decode → size clamp → store dispatch.
 *  On failure, surfaces a toast and resolves to null so callers don't crash.
 *  On success, returns the new shape id. */
export async function uploadImageFile(
  file: File,
  opts: UploadOptions
): Promise<string | null> {
  const st = useStore.getState();

  const result = await validateImageFile(file);
  if (!result.ok) {
    st.showToast(result.reason, "error");
    return null;
  }

  let src: string;
  try {
    src = await readAsDataURL(file);
  } catch {
    st.showToast("Couldn't read this image.", "error");
    return null;
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(src);
  } catch {
    st.showToast("Couldn't read this image.", "error");
    return null;
  }

  const naturalWidth = img.naturalWidth || img.width || 1;
  const naturalHeight = img.naturalHeight || img.height || 1;

  // Clamp against the sheet's dimensions so oversize photos stay grabbable.
  // Records the true natural dimensions on the shape so "Reset to natural
  // size" in the toolbar can restore 1:1 later.
  const sheet = st.sheets.find((s) => s.id === opts.sheetId);
  const sheetMax = sheet
    ? Math.max(sheet.width, sheet.height) * 1.5
    : 2400;
  const longest = Math.max(naturalWidth, naturalHeight);
  const scale = longest > sheetMax ? sheetMax / longest : 1;
  const width = Math.round(naturalWidth * scale);
  const height = Math.round(naturalHeight * scale);

  // Treat the input as top-left unless `center` is set, then clamp the
  // resulting rect into [0, sheet.w] × [0, sheet.h] so a drop outside the
  // sheet (or a viewport-center upload that lands off-page) still pulls
  // the image fully inside. When the image is larger than the sheet on
  // an axis, center it on that axis (symmetric overflow) — the alternative
  // of pinning to (0, 0) would hide the right/bottom portion off-sheet.
  const desiredX = opts.center ? opts.x - width / 2 : opts.x;
  const desiredY = opts.center ? opts.y - height / 2 : opts.y;
  const x = sheet
    ? sheet.width >= width
      ? Math.max(0, Math.min(sheet.width - width, desiredX))
      : (sheet.width - width) / 2
    : desiredX;
  const y = sheet
    ? sheet.height >= height
      ? Math.max(0, Math.min(sheet.height - height, desiredY))
      : (sheet.height - height) / 2
    : desiredY;
  const shape: ImageShape = {
    id: uid("shape"),
    type: "image",
    sheetId: opts.sheetId,
    name: opts.name ?? file.name ?? "Image",
    visible: true,
    locked: false,
    x,
    y,
    width,
    height,
    src,
    naturalWidth,
    naturalHeight,
  };
  st.addShape(shape);
  // Auto-select the new image so the ImageOptionsBar appears immediately.
  // Switch to the select tool first — other tools hide the options bar.
  // Activate the target sheet too so its layers group expands in the
  // left sidebar (see `setActiveSheet` in the store) — the new entry is
  // visible in the layers tab without an extra click.
  const latest = useStore.getState();
  latest.setActiveSheet(opts.sheetId);
  latest.setTool("select");
  latest.setSelectedShapeIds([]);
  latest.selectShape(shape.id);

  if (scale < 1) {
    latest.showToast(
      "Scaled to fit. Use Reset to natural size to restore.",
      "info"
    );
  }

  return shape.id;
}

/** Replace the `src` of an existing ImageShape — runs the same validation
 *  and decoding path so GIFs/videos can't sneak in via Replace. Clears any
 *  crop because the natural dimensions change. */
export async function replaceImageSrc(id: string, file: File): Promise<void> {
  const st = useStore.getState();
  const existing = st.shapes.find((s) => s.id === id);
  if (!existing || existing.type !== "image") return;

  const result = await validateImageFile(file);
  if (!result.ok) {
    st.showToast(result.reason, "error");
    return;
  }

  let src: string;
  try {
    src = await readAsDataURL(file);
  } catch {
    st.showToast("Couldn't read this image.", "error");
    return;
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(src);
  } catch {
    st.showToast("Couldn't read this image.", "error");
    return;
  }

  const naturalWidth = img.naturalWidth || img.width || 1;
  const naturalHeight = img.naturalHeight || img.height || 1;

  const nextStyle = existing.style
    ? { ...existing.style, crop: undefined }
    : undefined;

  st.updateShape(id, {
    src,
    naturalWidth,
    naturalHeight,
    ...(nextStyle ? { style: nextStyle } : {}),
  } as Partial<ImageShape>);
}
