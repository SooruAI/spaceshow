import type { Orientation, PaperSize } from "../types";

// ISO A series in millimetres (portrait: width x height)
export const PAPER_SIZES_MM: Record<Exclude<PaperSize, "custom">, { w: number; h: number }> = {
  A0: { w: 841, h: 1189 },
  A1: { w: 594, h: 841 },
  A2: { w: 420, h: 594 },
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
};

// 96 DPI / 25.4 mm per inch
export const PX_PER_MM = 96 / 25.4;

export function mmToPx(mm: number): number {
  return Math.round(mm * PX_PER_MM);
}

export function paperToPx(size: PaperSize, orientation: Orientation): { width: number; height: number } {
  if (size === "custom") return { width: 1280, height: 720 };
  const dim = PAPER_SIZES_MM[size];
  const wPx = mmToPx(dim.w);
  const hPx = mmToPx(dim.h);
  return orientation === "landscape"
    ? { width: hPx, height: wPx }
    : { width: wPx, height: hPx };
}

export const PAPER_SIZE_OPTIONS: Exclude<PaperSize, "custom">[] = [
  "A0",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
];
