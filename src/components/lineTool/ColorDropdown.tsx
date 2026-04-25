/**
 * ColorDropdown — single-button picker that collapses the Color + Opacity
 * section of LineToolMenu into a dropdown.
 *
 * Why a dropdown (vs. inline swatches + a separate opacity slider): the
 * inline controls consumed ~200 px of horizontal real estate, which made
 * the toolbar wrap onto two rows as soon as the trailing Lock/Hide/More
 * group appeared. One icon button + popover keeps the whole strip on a
 * single line and mirrors the pattern already used by the Pen and Shape
 * tools in SheetToolbar.tsx.
 *
 * The trigger shows [Palette · tinted swatch · ChevronDown] — the swatch
 * honours `opacity` so you can see the current alpha without opening the
 * popover.
 *
 * Two modes:
 *   • Live (default — Line tool). Every swatch / slider / channel edit
 *     calls the parent's `onColorChange` / `onOpacityChange` immediately.
 *   • Buffered (auto-enabled when `presets` is supplied — Pen / Marker /
 *     Highlighter). All inner controls write into local draft state and
 *     the parent isn't notified until the user clicks Apply. Cancel
 *     discards the draft and closes the popover. Apply is disabled while
 *     the draft equals the committed value, so the user sees clearly when
 *     a change is pending vs. not. Closing via outside-click or Escape
 *     also discards (drafts are reset on the next open).
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Palette } from "lucide-react";
import { ColorPickerPanel } from "../ColorPickerPanel";

interface Props {
  color: string;
  opacity: number;
  onColorChange: (hex: string) => void;
  onOpacityChange: (opacity: number) => void;
  /** Optional palette row rendered at the top of the popover, above the
   *  full ColorPickerPanel. Used by the Pen tool to surface variant-
   *  specific curated colours (Pen / Marker / Highlighter palettes from
   *  `src/components/pen/*Colors.tsx`). When omitted the popover keeps
   *  its existing line-tool layout (live writes, no Cancel/Apply). */
  presets?: {
    label: string;
    render: (props: {
      value: string;
      onChange: (hex: string) => void;
    }) => React.ReactNode;
  };
}

export function ColorDropdown({
  color,
  opacity,
  onColorChange,
  onOpacityChange,
  presets,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Buffered (Cancel/Apply) mode is auto-enabled whenever the consumer
  // supplies a curated palette. Same trigger as `hideBands` so the two
  // pen-tool behaviours are coupled — easier to reason about.
  const buffered = !!presets;

  // Local draft state. In live mode these track props 1:1 (set in the
  // open-effect below) and are otherwise inert. In buffered mode they
  // capture pending edits until the user clicks Apply.
  const [draftColor, setDraftColor] = useState(color);
  const [draftOpacity, setDraftOpacity] = useState(opacity);

  // Reset draft whenever the popover transitions closed → open. Two
  // benefits: (a) cancelling via outside-click / Escape is implicitly
  // "discard" because the next open seeds fresh; (b) if a sibling control
  // changed `color` / `opacity` while the popover was closed, we pick up
  // those new committed values on reopen instead of stale drafts.
  useEffect(() => {
    if (open) {
      setDraftColor(color);
      setDraftOpacity(opacity);
    }
    // We deliberately depend on `open` only — re-seeding on every prop
    // tick would clobber an in-progress edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Effective values shown inside the popover. In live mode these are the
  // committed props; in buffered mode they are the drafts. The TRIGGER
  // (outside the popover) always shows the committed props so the user
  // sees the saved colour even while editing — standard buffered-apply UX.
  const effectiveColor = buffered ? draftColor : color;
  const effectiveOpacity = buffered ? draftOpacity : opacity;

  const handleColorChange = (hex: string) => {
    if (buffered) setDraftColor(hex);
    else onColorChange(hex);
  };
  const handleOpacityChange = (op: number) => {
    if (buffered) setDraftOpacity(op);
    else onOpacityChange(op);
  };

  // Did the draft diverge from the committed value? Drives Apply's
  // disabled state and the Cancel button's pointer-events. Hex comparison
  // is case-insensitive because some sources emit lowercase, others
  // uppercase.
  const colorChanged =
    draftColor.toLowerCase() !== color.toLowerCase();
  const opacityChanged = draftOpacity !== opacity;
  const hasChange = buffered && (colorChanged || opacityChanged);

  const apply = () => {
    if (!hasChange) return;
    if (colorChanged) onColorChange(draftColor);
    if (opacityChanged) onOpacityChange(draftOpacity);
    setOpen(false);
    triggerRef.current?.focus();
  };
  const cancel = () => {
    setDraftColor(color);
    setDraftOpacity(opacity);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const opacityPct = Math.round(effectiveOpacity * 100);
  // The trigger swatch tracks the COMMITTED color/opacity (props) so the
  // user can compare "what's saved" against the in-popover preview.
  const triggerOpacityPct = Math.round(opacity * 100);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Line color — ${color.toUpperCase()} at ${triggerOpacityPct}% opacity`}
        title="Color & opacity"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 h-7 pl-1.5 pr-1 rounded border border-edge bg-ink-800/60 hover:bg-ink-700 text-ink-200 transition-colors"
      >
        <Palette size={13} className="text-ink-300" />
        <span
          className="inline-block w-3.5 h-3.5 rounded ring-1 ring-ink-700"
          style={{ background: color, opacity }}
          aria-hidden="true"
        />
        <ChevronDown size={12} className="text-ink-300" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Color and opacity"
          className="absolute left-0 top-full mt-1 z-50 panel rounded-lg shadow-pop p-3 w-64"
          // Stop clicks inside the popover from closing it via the
          // outside-click listener above.
          onMouseDown={(e) => e.stopPropagation()}
        >
          {presets && (
            <div className="mb-3 pb-3 border-b border-ink-700 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-ink-400">
                {presets.label}
              </div>
              {presets.render({
                value: effectiveColor,
                onChange: handleColorChange,
              })}
            </div>
          )}
          <ColorPickerPanel
            value={effectiveColor}
            onChange={handleColorChange}
            mode="live"
            // When the consumer supplies its own curated palette (Pen /
            // Marker / Highlighter), suppress the generic LIGHT_BAND +
            // DARK_BAND rows so the variant's row is the only swatch grid.
            hideBands={!!presets}
          />

          <div className="mt-3 pt-3 border-t border-ink-700 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-ink-300 shrink-0">
              Opacity
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={opacityPct}
              onChange={(e) =>
                handleOpacityChange(parseInt(e.target.value, 10) / 100)
              }
              aria-label="Line opacity"
              aria-valuenow={opacityPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${opacityPct}%`}
              className="line-tool-range flex-1"
            />
            <span className="text-[11px] tabular-nums w-9 text-right text-ink-300">
              {opacityPct}%
            </span>
          </div>

          {/* Buffered mode: Cancel + Apply commit-bar. Both buttons are
              disabled until there's a pending change — matches the user's
              "these work only when a change is made" requirement and gives
              clear visual feedback that nothing will commit on a no-op
              click. Apply also short-circuits no-op cases (`!hasChange`
              early-return in `apply`) so the parent never receives a
              redundant onChange. */}
          {buffered && (
            <div className="mt-3 pt-3 border-t border-ink-700 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={!hasChange}
                aria-label="Cancel color changes"
                className="h-7 px-3 rounded text-[11px] font-medium bg-ink-800 border border-ink-700 text-ink-200 hover:bg-ink-700 hover:text-ink-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink-800 disabled:hover:text-ink-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!hasChange}
                aria-label="Apply color changes"
                className="h-7 px-3 rounded text-[11px] font-medium bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand-600 transition-colors"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
