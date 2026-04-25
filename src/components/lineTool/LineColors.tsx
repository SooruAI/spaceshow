// ─────────────────────────────────────────────────────────────────────────────
// LineColors.tsx — curated palette for the Line tool's colour popover.
//
// Source of truth for:
//   • The 9-swatch quick row rendered at the top of the line colour popover
//     (via `ColorDropdown.presets` from `LineToolMenu`). The full
//     `ColorPickerPanel` (Custom HSV + sliders + RGB/HSL + HEX) remains
//     available below the row for any colour outside the curated set.
//   • A single `LineColorSwatches` component that renders the row with
//     active-state ring + accessible labels.
//
// Sibling files: `pen/PenColors.tsx`, `pen/MarkerColors.tsx`,
// `pen/HighlighterColors.tsx`. Each tool variant owns its own palette so
// the suggested colours are tuned to that tool's intended use.
// ─────────────────────────────────────────────────────────────────────────────

export interface LineColor {
  /** Display name used as the swatch's `aria-label` and tooltip. */
  name: string;
  /** Hex string written into the shape / store (`#RRGGBB`). */
  hex: string;
}

/** Ordered Line palette. */
export const LINE_COLORS: ReadonlyArray<LineColor> = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Gray", hex: "#64748B" },
  { name: "Blue", hex: "#2563EB" },
  { name: "Red", hex: "#EF4444" },
  { name: "Green", hex: "#10B981" },
  { name: "Orange", hex: "#F97316" },
  { name: "Purple", hex: "#8B5CF6" },
  { name: "Pink", hex: "#EC4899" },
];

interface LineColorSwatchesProps {
  /** Currently selected hex (case-insensitive comparison). */
  value: string;
  /** Called with the picked hex. */
  onChange: (hex: string) => void;
}

/** Compact preset row for the Line colour popover — visual sibling of
 *  `pen/PenColors.tsx`'s `PenColorSwatches`. Renders 9 circular swatches;
 *  the one whose hex matches `value` is ringed in the brand accent.
 *
 *  White swatch gets an extra ring-1 inside so it remains visible against
 *  the dark popover surface (otherwise it'd blend with the panel hover
 *  state). Other swatches don't need this since they have non-white fills. */
export function LineColorSwatches({ value, onChange }: LineColorSwatchesProps) {
  const normalized = value.toLowerCase();
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {LINE_COLORS.map((c) => {
        const selected = c.hex.toLowerCase() === normalized;
        const isWhite = c.hex.toLowerCase() === "#ffffff";
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
                : isWhite
                  ? "ring-1 ring-ink-500 hover:scale-110"
                  : "ring-1 ring-ink-700 hover:scale-110"
            }`}
            style={{ background: c.hex }}
          />
        );
      })}
    </div>
  );
}
