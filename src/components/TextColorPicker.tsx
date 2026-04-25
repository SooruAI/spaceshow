import { ColorPickerPanel } from "./ColorPickerPanel";

/**
 * Default preset swatches surfaced in the Text Colour popover. Eight
 * high-contrast hues covering the common cases (body copy, callouts,
 * links, alerts, surface text on dark/light) without overwhelming the
 * picker. The full-spectrum `ColorPickerPanel` below the row remains
 * available for any custom colour the user actually needs.
 *
 * Hex values are uppercase to match the canonical form emitted by
 * `ColorPickerPanel.normalize`, so an active-state comparison after a
 * round-trip through the custom picker hits the same swatch.
 */
export const TEXT_COLOR_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Black",  value: "#000000" },
  { label: "Red",    value: "#EF4444" },
  { label: "Blue",   value: "#3B82F6" },
  { label: "Green",  value: "#22C55E" },
  { label: "Orange", value: "#F97316" },
  { label: "Purple", value: "#A855F7" },
  { label: "Gray",   value: "#6B7280" },
  { label: "White",  value: "#FFFFFF" },
];

interface Props {
  /** Current text colour as a hex string. */
  value: string;
  /** Fires for both preset clicks and custom-picker apply. */
  onChange: (next: string) => void;
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
 * Popover for picking text colour. Drop-in for a `relative` trigger
 * wrapper — the parent owns positioning anchor + outside-click dismissal.
 * Renders the eight default presets, then the full-spectrum
 * `ColorPickerPanel` for arbitrary hex/RGB/HSL values.
 *
 * Lives in its own file (rather than inline in `TextFormatBar`) so the
 * preset list is co-located with the picker UI and easy to find / tweak
 * without touching the surrounding format bar.
 */
export function TextColorPicker({ value, onChange, onClose }: Props) {
  const normalized = value.toLowerCase();
  return (
    <div
      className="absolute top-full mt-2 left-0 z-40 panel rounded-md shadow-2xl p-3 w-64"
      style={{ background: "var(--bg-secondary)" }}
      role="dialog"
      aria-label="Text colour"
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
        Text colour
      </div>
      {/* Single row, no wrap. Swatches are sized so all eight fit comfortably
          inside the 256px popover with a 4px gap (8×18 + 7×4 = 172px content,
          leaving generous left/right breathing room). Decreasing past 18px
          starts hurting click-target size. */}
      <div className="flex items-center gap-1 mb-3">
        {TEXT_COLOR_PRESETS.map((s) => {
          const active = normalized === s.value.toLowerCase();
          return (
            <button
              key={s.value}
              type="button"
              title={s.label}
              aria-label={s.label}
              aria-pressed={active}
              // Don't steal focus from the textarea behind the popover —
              // the user's caret + selection have to survive a colour
              // change. Same trick used by every other button in the bar.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s.value);
                onClose?.();
              }}
              className={`w-[18px] h-[18px] rounded ring-1 transition-transform hover:scale-110 shrink-0 ${
                active ? "ring-2 ring-brand-500" : "ring-ink-700"
              }`}
              style={{ background: s.value }}
            />
          );
        })}
      </div>
      {/* `hideBands` strips the two LIGHT/DARK preset rows from
          ColorPickerPanel — our eight curated swatches above are the only
          presets this picker should expose, and the panel's generic bands
          would compete with them visually. */}
      <ColorPickerPanel value={value} onChange={onChange} hideBands />
    </div>
  );
}
