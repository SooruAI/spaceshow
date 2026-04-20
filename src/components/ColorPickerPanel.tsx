import { useState } from "react";
import { Check } from "lucide-react";

const LIGHT_BAND = [
  "#FFFFFF",
  "#FFF7C2",
  "#FFD9E5",
  "#CDE7FF",
  "#FFD7B5",
  "#D6F2D2",
  "#E8DFFF",
];

const DARK_BAND = [
  "#000000",
  "#0B1F3A",
  "#0F766E",
  "#7A1F1F",
  "#3D2C1A",
  "#1F3D2C",
  "#3D1F3A",
];

// 8 hues × 4 tones (light → deepest)
const PALETTE_GRID = [
  // reds
  "#FECACA", "#F87171", "#DC2626", "#7F1D1D",
  // oranges
  "#FED7AA", "#FB923C", "#EA580C", "#7C2D12",
  // yellows
  "#FEF08A", "#FACC15", "#CA8A04", "#713F12",
  // greens
  "#BBF7D0", "#4ADE80", "#16A34A", "#14532D",
  // teals
  "#99F6E4", "#2DD4BF", "#0D9488", "#134E4A",
  // blues
  "#BFDBFE", "#60A5FA", "#2563EB", "#1E3A8A",
  // purples
  "#DDD6FE", "#A78BFA", "#7C3AED", "#4C1D95",
  // pinks
  "#FBCFE8", "#F472B6", "#DB2777", "#831843",
];

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

export function ColorPickerPanel({ value, onChange }: Props) {
  const [hex, setHex] = useState(value || "#FFFFFF");

  function applyHex() {
    const v = hex.trim();
    if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(v)) onChange(v.toUpperCase());
  }

  return (
    <div className="space-y-2.5">
      <Band swatches={LIGHT_BAND} value={value} onPick={onChange} />
      <Band swatches={DARK_BAND} value={value} onPick={onChange} />
      <div className="grid grid-cols-8 gap-1">
        {PALETTE_GRID.map((c) => (
          <Swatch key={c} color={c} active={c.toUpperCase() === (value || "").toUpperCase()} onClick={() => onChange(c)} />
        ))}
      </div>
      <div className="flex items-center gap-1.5 pt-1">
        <span className="text-[11px] text-ink-300">Hex</span>
        <input
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onBlur={applyHex}
          onKeyDown={(e) => e.key === "Enter" && applyHex()}
          spellCheck={false}
          className="flex-1 h-7 px-2 text-xs rounded bg-ink-700 border border-ink-700 outline-none focus:border-brand-600 text-ink-100"
          placeholder="#FFFFFF"
        />
        <button className="pill-btn h-7 px-2.5 text-xs" onClick={applyHex}>
          Apply
        </button>
      </div>
    </div>
  );
}

function Band({
  swatches,
  value,
  onPick,
}: {
  swatches: string[];
  value: string;
  onPick: (c: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {swatches.map((c) => (
        <Swatch
          key={c}
          color={c}
          active={c.toUpperCase() === (value || "").toUpperCase()}
          onClick={() => onPick(c)}
          larger
        />
      ))}
    </div>
  );
}

function Swatch({
  color,
  active,
  onClick,
  larger,
}: {
  color: string;
  active: boolean;
  onClick: () => void;
  larger?: boolean;
}) {
  const dim = larger ? 22 : 18;
  return (
    <button
      type="button"
      onClick={onClick}
      title={color}
      className={`relative rounded grid place-items-center transition-transform hover:scale-110 ${
        active ? "ring-2 ring-brand-500" : "ring-1 ring-ink-700"
      }`}
      style={{ width: dim, height: dim, background: color }}
    >
      {active && (
        <Check
          size={11}
          className="drop-shadow"
          color={isLight(color) ? "#111" : "#fff"}
        />
      )}
    </button>
  );
}

function isLight(hex: string): boolean {
  const m = hex.replace("#", "");
  if (m.length !== 6) return true;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // simple luminance
  return r * 0.299 + g * 0.587 + b * 0.114 > 160;
}
