import type { Sheet } from "../types";

/** One-line human-readable size label for a sheet.
 *  - Custom paper sizes render as raw `W×H` (rounded to int px).
 *  - Named paper sizes render as `PaperSize · Orientation` (e.g. `A4 · Landscape`).
 *
 *  Used in the Sheets tab, the SpacePresent selection modal, and the
 *  presenter control bar so the size is labeled consistently everywhere.
 */
export function formatSheetSize(sheet: Sheet): string {
  if (sheet.paperSize === "custom") {
    return `${Math.round(sheet.width)}×${Math.round(sheet.height)}`;
  }
  const orient =
    sheet.orientation === "portrait" ? "Portrait" : "Landscape";
  return `${sheet.paperSize} · ${orient}`;
}
