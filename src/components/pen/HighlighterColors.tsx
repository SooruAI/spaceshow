// ─────────────────────────────────────────────────────────────────────────────
// HighlighterColors.tsx — curated palette for the **Highlighter** variant of
// the Pen tool. Highlighter strokes render at reduced opacity (~0.6) so the
// palette favours neon / fluorescent colours that stay readable when laid
// over white or coloured backgrounds.
//
// Source of truth for:
//   • The default Highlighter colour applied to brand-new highlighter
//     strokes (Neon Yellow).
//   • The 8-swatch quick row rendered in the Highlighter colour popover.
//
// Mirrors the structure of `PenColors.tsx` and `MarkerColors.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

export interface HighlighterColor {
  name: string;
  hex: string;
}

/** Ordered Highlighter palette. First entry is the default — keep Neon
 *  Yellow at index 0 unless the brief changes; the store's
 *  `penVariants.highlighter.color` default mirrors it. */
export const HIGHLIGHTER_COLORS: ReadonlyArray<HighlighterColor> = [
  { name: "Neon Yellow (Default)", hex: "#FFEB3B" },
  { name: "Mint Green", hex: "#69F0AE" },
  { name: "Cyan / Aqua", hex: "#18FFFF" },
  { name: "Hot Pink", hex: "#FF4081" },
  { name: "Bright Orange", hex: "#FFAB40" },
  { name: "Lavender", hex: "#E040FB" },
  { name: "Coral Red", hex: "#FF5252" },
  { name: "Light Grey", hex: "#CFD8DC" },
];

export const HIGHLIGHTER_DEFAULT_COLOR = HIGHLIGHTER_COLORS[0].hex;

interface HighlighterColorSwatchesProps {
  value: string;
  onChange: (hex: string) => void;
}

/** Compact preset row for the Highlighter colour popover. */
export function HighlighterColorSwatches({
  value,
  onChange,
}: HighlighterColorSwatchesProps) {
  const normalized = value.toLowerCase();
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {HIGHLIGHTER_COLORS.map((c) => {
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
