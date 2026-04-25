import type { User } from "../../types";

export type Role = "Owner" | "Collaborator" | "Viewer";
export const ROLES: Role[] = ["Owner", "Collaborator", "Viewer"];

export type Collaborator = User & { role: Role; email: string };

export type ExportMode = "board" | "slides";
export type ExportFormat = "PNG" | "JPEG" | "SVG" | "PDF" | "PPTX";
export type ShareView = "access" | "download";
export type SlideFilter = "unhidden" | "all" | "hidden";

export const FORMATS_BY_MODE: Record<ExportMode, ExportFormat[]> = {
  board: ["PNG", "JPEG", "SVG", "PDF"],
  slides: ["PPTX", "PDF", "PNG", "JPEG", "SVG"],
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ExportContext {
  showToast: (message: string, level?: "info" | "error") => void;
}

export function handleExport(
  mode: ExportMode,
  format: ExportFormat,
  sheetIds: string[],
  ctx: ExportContext,
): void {
  // TODO(export): wire real implementations here.
  //   - PNG/JPEG: konva Stage.toDataURL({ mimeType, pixelRatio: 2 }) on the
  //     Stage exposed by Canvas.tsx (lift via ref or expose through the store).
  //   - SVG:   Stage.toSVG() shim, or render-tree -> SVG.
  //   - PDF:   jspdf addImage(stage.toDataURL(), ...). Iterate sheetIds in slide mode.
  //   - PPTX:  pptxgenjs - one slide per sheetId, each with addImage from per-sheet toDataURL.
  console.log("[share] export stub", { mode, format, sheetIds });
  const msg = sheetIds.length
    ? `Exporting ${sheetIds.length} slide${sheetIds.length === 1 ? "" : "s"} as ${format} (stub)`
    : `Exporting board as ${format} (stub)`;
  ctx.showToast(msg, "info");
}
