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
 * popover. The popover hosts the full `ColorPickerPanel` (live mode, so
 * every swatch / slider / channel edit commits immediately) plus the
 * opacity slider moved in from the old inline layout.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Palette } from "lucide-react";
import { ColorPickerPanel } from "../ColorPickerPanel";

interface Props {
  color: string;
  opacity: number;
  onColorChange: (hex: string) => void;
  onOpacityChange: (opacity: number) => void;
}

export function ColorDropdown({
  color,
  opacity,
  onColorChange,
  onOpacityChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  const opacityPct = Math.round(opacity * 100);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Line color — ${color.toUpperCase()} at ${opacityPct}% opacity`}
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
          <ColorPickerPanel value={color} onChange={onColorChange} mode="live" />

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
                onOpacityChange(parseInt(e.target.value, 10) / 100)
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
        </div>
      )}
    </div>
  );
}
