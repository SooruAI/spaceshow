// ─────────────────────────────────────────────────────────────────────────────
// MarkerColors.tsx — curated palette for the **Marker** variant of the Pen
// tool. Marker strokes are thicker and read as opaque pigment, so the
// palette skews toward saturated, high-contrast ink colours rather than
// the slightly softer Pen palette.
//
// Source of truth for:
//   • The default Marker colour applied to brand-new marker strokes (Red).
//   • The 8-swatch quick row rendered in the Marker colour popover.
//
// Mirrors the structure of `PenColors.tsx` and `HighlighterColors.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

export interface MarkerColor {
  name: string;
  hex: string;
}

/** Ordered Marker palette. First entry is the default — keep Red at index 0
 *  unless the brief changes; the store's `penVariants.marker.color` default
 *  mirrors it. */
export const MARKER_COLORS: ReadonlyArray<MarkerColor> = [
  { name: "Red (Default)", hex: "#D32F2F" },
  { name: "Strong Blue", hex: "#1976D2" },
  { name: "Bold Green", hex: "#388E3C" },
  { name: "Safety Orange", hex: "#F57C00" },
  { name: "Solid Black", hex: "#212121" },
  { name: "Pure White", hex: "#FFFFFF" },
  { name: "Deep Purple", hex: "#7B1FA2" },
  { name: "Cyan / Teal", hex: "#0097A7" },
];

export const MARKER_DEFAULT_COLOR = MARKER_COLORS[0].hex;

interface MarkerColorSwatchesProps {
  value: string;
  onChange: (hex: string) => void;
}

/** Compact preset row for the Marker colour popover. White gets a slightly
 *  darker ring even when unselected so it stays visible against the popover
 *  background. */
export function MarkerColorSwatches({
  value,
  onChange,
}: MarkerColorSwatchesProps) {
  const normalized = value.toLowerCase();
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {MARKER_COLORS.map((c) => {
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
