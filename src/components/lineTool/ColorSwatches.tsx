/**
 * Preset color swatches + a custom picker. Mirrors the swatch pattern used
 * by ShapeInspector's color pickers, but kept self-contained so the line
 * tool doesn't depend on that component's internal layout.
 */

import { useRef } from "react";
import { Pipette } from "lucide-react";
import { LINE_COLOR_PRESETS } from "../../types";

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

export function ColorSwatches({ value, onChange }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const normalized = value.toLowerCase();
  const isPreset = LINE_COLOR_PRESETS.some(
    (p) => p.value.toLowerCase() === normalized,
  );

  return (
    <div className="flex items-center gap-1">
      {LINE_COLOR_PRESETS.map((preset) => {
        const selected = preset.value.toLowerCase() === normalized;
        return (
          <button
            key={preset.value}
            type="button"
            aria-label={preset.label}
            aria-pressed={selected}
            onClick={() => onChange(preset.value)}
            className={`w-4 h-4 rounded-full transition-transform ${
              selected
                ? "ring-2 ring-brand-500 ring-offset-1 ring-offset-ink-800 scale-110"
                : "ring-1 ring-ink-700 hover:scale-110"
            }`}
            style={{ background: preset.value }}
          />
        );
      })}

      <button
        type="button"
        aria-label="Custom color"
        aria-pressed={!isPreset}
        onClick={() => pickerRef.current?.click()}
        title="Custom color"
        className={`w-4 h-4 rounded-full grid place-items-center transition-colors ${
          !isPreset
            ? "ring-2 ring-brand-500 ring-offset-1 ring-offset-ink-800"
            : "ring-1 ring-ink-700 hover:ring-ink-600"
        }`}
        style={
          !isPreset
            ? { background: value }
            : {
                background:
                  "conic-gradient(from 0deg, #ef4444, #f97316, #facc15, #22c55e, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
              }
        }
      >
        {isPreset && <Pipette size={8} className="text-white drop-shadow" />}
      </button>

      <input
        ref={pickerRef}
        type="color"
        value={isPreset ? "#000000" : value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
