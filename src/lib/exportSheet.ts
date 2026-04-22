import type Konva from "konva";
import type { Sheet } from "../types";

export type ExportFormat = "png" | "jpeg" | "pdf" | "svg";

export function exportSheetAsImage(
  stage: Konva.Stage | null,
  sheet: Sheet,
  format: "png" | "jpeg",
  zoom: number,
  pan: { x: number; y: number }
): void {
  if (!stage) return;
  const mime = format === "png" ? "image/png" : "image/jpeg";
  // The stage is rendered with sheet at world (sheet.x,sheet.y) scaled by zoom and translated by pan.
  const url: string = stage.toDataURL({
    mimeType: mime,
    pixelRatio: Math.max(1, 2 / zoom),
    x: pan.x + sheet.x * zoom,
    y: pan.y + sheet.y * zoom,
    width: sheet.width * zoom,
    height: sheet.height * zoom,
  });
  download(url, `${safeName(sheet.name)}.${format}`);
}

export function exportSheetUnsupported(format: "pdf" | "svg"): string {
  return `${format.toUpperCase()} export is coming soon — needs a small extra dependency.`;
}

function safeName(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase() || "sheet";
}

function download(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
