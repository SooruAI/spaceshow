// ─────────────────────────────────────────────────────────────────────────────
// PenColors.tsx — curated palette for the **Pen** variant of the Pen tool.
//
// Source of truth for:
//   • The default Pen colour applied to brand-new pen strokes (Blue).
//   • The 8-swatch quick row rendered at the top of the Pen colour popover
//     in `PenToolMenu` (via `ColorDropdown.presets`). The full colour
//     picker remains available below for custom hexes, but most users will
//     pick from this row.
//
// Sibling files: `MarkerColors.tsx`, `HighlighterColors.tsx`. Each variant
// owns its own palette so the suggested colours read as ink, marker pigment,
// and highlighter dye respectively — they never share swatches by accident.
// ─────────────────────────────────────────────────────────────────────────────

export interface PenColor {
  /** Display name used as the swatch's `aria-label` and tooltip. */
  name: string;
  /** Hex string written into the shape / store (`#RRGGBB`). */
  hex: string;
}

/** Ordered Pen palette. The first entry is the default — keep Blue at index 0
 *  unless the product brief changes. The store's `penVariants.pen.color`
 *  default in `src/store.ts` mirrors this value verbatim. */
export const PEN_COLORS: ReadonlyArray<PenColor> = [
  { name: "Blue (Default)", hex: "#1A73E8" },
  { name: "Black (Charcoal)", hex: "#202124" },
  { name: "Red", hex: "#D32F2F" },
  { name: "Green", hex: "#0F9D58" },
  { name: "Purple", hex: "#8E24AA" },
  { name: "Orange", hex: "#F29900" },
  { name: "Grey (Pencil)", hex: "#5F6368" },
  { name: "Magenta", hex: "#E91E63" },
];

/** Default Pen colour. Kept as a named export so callers don't need to know
 *  the array layout. */
export const PEN_DEFAULT_COLOR = PEN_COLORS[0].hex;

interface PenColorSwatchesProps {
  /** Currently selected hex (case-insensitive comparison). */
  value: string;
  /** Called with the picked hex. */
  onChange: (hex: string) => void;
}

/** Compact preset row for the Pen colour popover — visual sibling of
 *  `lineTool/ColorSwatches.tsx`. Renders 8 circular swatches; the one whose
 *  hex matches `value` is ringed in the brand accent. */
export function PenColorSwatches({ value, onChange }: PenColorSwatchesProps) {
  const normalized = value.toLowerCase();
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PEN_COLORS.map((c) => {
        const selected = c.hex.toLowerCase() === normalized;
        return (
          <button
            key={c.hex}
            type="button"
            aria-label={c.name}
            aria-pressed={selected}
            title={c.name}
            onClick={() => onChange(c.hex)}
            className={`w-5 h-5 rounded-full transition-transform ${
              selected
                ? "ring-2 ring-brand-500 ring-offset-1 ring-offset-ink-800 scale-110"
                : "ring-1 ring-ink-700 hover:scale-110"
            }`}
            style={{ background: c.hex }}
          />
        );
      })}
    </div>
  );
}
