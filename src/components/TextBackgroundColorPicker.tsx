import { ColorPickerPanel } from "./ColorPickerPanel";

/**
 * Default preset swatches surfaced in the Text Background Colour popover.
 * Soft, low-saturation tints chosen so foreground text stays legible at
 * normal weight — these are highlight / fill colours, not display
 * colours. The first entry is `null` (Transparent — the default), which
 * the consumer maps to "no background fill" (i.e. `bgColor === undefined`
 * in the stored TextContent). It renders as a 45° checkerboard so the
 * user can see at a glance that picking it removes the fill.
 *
 * Hex values are uppercase to match `ColorPickerPanel.normalize`'s
 * canonical form so the active-state comparison after a round-trip
 * through the custom picker hits the same swatch.
 */
export const TEXT_BG_COLOR_PRESETS: ReadonlyArray<{
  label: string;
  value: string | null;
}> = [
  { label: "Transparent", value: null },          // default — no fill
  { label: "White",       value: "#FFFFFF" },
  { label: "Light Gray",  value: "#F3F4F6" },
  { label: "Pale Yellow", value: "#FEF08A" },
  { label: "Light Blue",  value: "#BFDBFE" },
  { label: "Mint Green",  value: "#BBF7D0" },
  { label: "Soft Red",    value: "#FECACA" },
  { label: "Dark Gray",   value: "#374151" },
];

interface Props {
  /** Current background colour, or `null` for transparent. */
  value: string | null;
  /**
   * Fires for both preset clicks and custom-picker apply. `null` means
   * "no background fill" — the parent typically translates this to
   * `bgColor: undefined` on the underlying TextContent.
   */
  onChange: (next: string | null) => void;
  /**
   * Optional close callback. Fires after a preset swatch is chosen.
   * Custom-picker changes intentionally do NOT trigger close — the user
   * is mid-fine-tune on sliders and dismissing the popover under their
   * cursor would feel wrong. The parent is also expected to dismiss on
   * outside-click via its own listener.
   */
  onClose?: () => void;
}

/**
 * Popover for picking text background colour. Mirrors the structure of
 * `TextColorPicker` but with a transparent-default palette and an extra
 * affordance: the first preset is "Transparent", rendered as a 45°
 * checkerboard so the user can see at a glance that picking it removes
 * the fill.
 *
 * The custom `ColorPickerPanel` below the row never returns null, so
 * once the user touches it they can only land on a concrete colour.
 * To go back to transparent they have to click the first swatch — which
 * is exactly the affordance you want.
 */
export function TextBackgroundColorPicker({ value, onChange, onClose }: Props) {
  const normalized = value?.toLowerCase() ?? null;
  return (
    <div
      className="absolute top-full mt-2 left-0 z-40 panel rounded-md shadow-2xl p-3 w-64"
      style={{ background: "var(--bg-secondary)" }}
      role="dialog"
      aria-label="Text background colour"
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
        Text background
      </div>
      {/* Single row, no wrap — see the same comment in TextColorPicker.
          Eight swatches at 18px + 4px gap = 172px, well inside the 256px
          popover. */}
      <div className="flex items-center gap-1 mb-3">
        {TEXT_BG_COLOR_PRESETS.map((s) => {
          const isTransparent = s.value === null;
          const active = isTransparent
            ? normalized === null
            : normalized === s.value!.toLowerCase();
          return (
            <button
              key={s.label}
              type="button"
              title={s.label}
              aria-label={s.label}
              aria-pressed={active}
              // Same focus-preservation trick as the rest of the bar —
              // a fill change must not steal the textarea's caret.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s.value);
                onClose?.();
              }}
              className={`w-[18px] h-[18px] rounded ring-1 transition-transform hover:scale-110 relative overflow-hidden shrink-0 ${
                active ? "ring-2 ring-brand-500" : "ring-ink-700"
              }`}
              style={
                isTransparent
                  ? {
                      // Standard 45° checkerboard pattern — same one used
                      // for the bar's bg-colour trigger swatch when no
                      // colour is set. Visual consistency means the user
                      // sees the same "no fill" idiom in both places.
                      // Tile size scaled down with the swatch (6px / 3px
                      // offset) so the pattern still reads as a check at
                      // 18px instead of looking like two stripes.
                      backgroundImage:
                        "linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%), linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%)",
                      backgroundSize: "6px 6px",
                      backgroundPosition: "0 0, 3px 3px",
                    }
                  : { background: s.value as string }
              }
            />
          );
        })}
      </div>
      {/* `hideBands` — see TextColorPicker. */}
      <ColorPickerPanel
        value={value ?? "#FFFFFF"}
        onChange={(c) => onChange(c)}
        hideBands
      />
    </div>
  );
}
