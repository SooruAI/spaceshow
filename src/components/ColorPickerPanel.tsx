import { useEffect, useRef, useState } from "react";
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

interface Props {
  value: string;
  onChange: (hex: string) => void;
  /**
   * "apply" (default): shows Cancel/Apply buttons; `onChange` only fires when
   * Apply is clicked.
   * "live": every swatch click, slider drag, or channel edit calls `onChange`
   * immediately. Apply/Cancel buttons are hidden. Use when this picker is
   * embedded inside another panel that owns its own commit flow.
   */
  mode?: "apply" | "live";
}

// ── Color helpers ───────────────────────────────────────────────────────────
// Accept any CSS hex (3/6/8). Anything unknown falls back to opaque white so
// the picker never gets into an unrecoverable state.
function parseHex(hex: string): { r: number; g: number; b: number; a: number } {
  const h = (hex || "").trim().replace("#", "");
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
      a: 1,
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  if (h.length === 8) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: parseInt(h.slice(6, 8), 16) / 255,
    };
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

function toHex(r: number, g: number, b: number, a: number): string {
  const h = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  const base = `#${h(r)}${h(g)}${h(b)}`;
  return a >= 1 ? base : base + h(a * 255);
}

function normalize(hex: string): string {
  const { r, g, b, a } = parseHex(hex);
  return toHex(r, g, b, a);
}

function rgbToHsv(
  r: number,
  g: number,
  b: number
): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, v };
}

function hsvToRgb(
  h: number,
  s: number,
  v: number
): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rp = 0,
    gp = 0,
    bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(
  h: number,
  s: number,
  l: number
): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const ll = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let rp = 0,
    gp = 0,
    bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function ColorPickerPanel({ value, onChange, mode = "apply" }: Props) {
  const committed = normalize(value || "#FFFFFF");

  // `draft` is the live preview. In "apply" mode, `onChange` only fires from
  // the Apply button. In "live" mode, every draft change is also propagated
  // out via the effect below, so the consumer owns its own commit flow.
  const [draft, setDraft] = useState(committed);
  const [hexInput, setHexInput] = useState(committed);
  // Hue is kept as separate state so that dragging toward grey/black (s=0 or
  // v=0) doesn't lose the user's selected hue on the hue slider.
  const [hue, setHue] = useState(() => {
    const p = parseHex(committed);
    return rgbToHsv(p.r, p.g, p.b).h;
  });

  // Re-sync when the parent's committed value changes from outside (undo,
  // swatch click elsewhere, preset application, etc.). The draft/hex/hue
  // values are local UI mirrors of the committed colour — when committed
  // changes from outside, we reset them in lockstep. Deriving them via
  // useMemo would prevent the user from editing the draft locally.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(committed);
    setHexInput(committed);
    const p = parseHex(committed);
    const { h, s } = rgbToHsv(p.r, p.g, p.b);
    if (s > 0) setHue(h);
  }, [committed]);

  // In live mode, propagate every draft change out immediately. Guarded by the
  // equality check so the initial render (and re-syncs from `committed`) do
  // not re-emit the same value.
  useEffect(() => {
    if (mode === "live" && draft.toUpperCase() !== committed.toUpperCase()) {
      onChange(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, mode]);

  const rgb = parseHex(draft);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  // For near-grey pixels hsv.h is meaningless — prefer the stored hue so the
  // spectrum background of the SV picker matches the slider position.
  const displayHue = hsv.s < 0.001 ? hue : hsv.h;
  const hasChange = draft.toUpperCase() !== committed.toUpperCase();

  function setDraftVal(next: string) {
    const n = normalize(next);
    setDraft(n);
    setHexInput(n);
  }

  function pickSwatch(c: string) {
    const n = normalize(c);
    setDraft(n);
    setHexInput(n);
    const p = parseHex(n);
    const { h, s } = rgbToHsv(p.r, p.g, p.b);
    if (s > 0) setHue(h);
  }

  function onHexChange(v: string) {
    setHexInput(v);
    const s = v.trim();
    const m = s.replace(/^#/, "");
    if (/^([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(m)) {
      const next = normalize("#" + m);
      setDraft(next);
      const p = parseHex(next);
      const hv = rgbToHsv(p.r, p.g, p.b);
      if (hv.s > 0) setHue(hv.h);
    }
  }

  function setSV(sat: number, val: number) {
    const { r, g, b } = hsvToRgb(displayHue, sat, val);
    setDraftVal(toHex(r, g, b, rgb.a));
  }

  function setHueVal(h: number) {
    setHue(h);
    const { r, g, b } = hsvToRgb(h, hsv.s, hsv.v);
    setDraftVal(toHex(r, g, b, rgb.a));
  }

  function setAlpha(a: number) {
    setDraftVal(toHex(rgb.r, rgb.g, rgb.b, a));
  }

  function setRgbChannel(ch: "r" | "g" | "b", v: number) {
    if (!Number.isFinite(v)) return;
    const cl = Math.max(0, Math.min(255, v));
    const next = { r: rgb.r, g: rgb.g, b: rgb.b, [ch]: cl };
    setDraftVal(toHex(next.r, next.g, next.b, rgb.a));
    const hv = rgbToHsv(next.r, next.g, next.b);
    if (hv.s > 0) setHue(hv.h);
  }

  function setHslChannel(ch: "h" | "s" | "l", v: number) {
    if (!Number.isFinite(v)) return;
    const clamped =
      ch === "h" ? ((v % 360) + 360) % 360 : Math.max(0, Math.min(100, v));
    const next = { h: hsl.h, s: hsl.s, l: hsl.l, [ch]: clamped };
    const { r, g, b } = hslToRgb(next.h, next.s, next.l);
    setDraftVal(toHex(r, g, b, rgb.a));
    if (ch === "h" || next.s > 0) setHue(next.h);
  }

  function onCancel() {
    setDraft(committed);
    setHexInput(committed);
  }
  function onApply() {
    if (hasChange) onChange(draft);
  }

  return (
    <div className="space-y-2.5">
      <Band swatches={LIGHT_BAND} value={draft} onPick={pickSwatch} />
      <Band swatches={DARK_BAND} value={draft} onPick={pickSwatch} />

      {/* Full-spectrum "infinity colours" picker */}
      <div className="border-t border-ink-700 pt-2.5 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-ink-400">
          Custom
        </div>

        <SVPicker hue={displayHue} s={hsv.s} v={hsv.v} onChange={setSV} />

        <div className="flex items-center gap-2">
          <HueSlider hue={displayHue} onChange={setHueVal} />
          <span className="text-[10px] text-ink-300 font-mono tabular-nums w-10 text-right">
            {Math.round(displayHue)}°
          </span>
        </div>

        <div className="flex items-center gap-2">
          <AlphaSlider
            r={rgb.r}
            g={rgb.g}
            b={rgb.b}
            a={rgb.a}
            onChange={setAlpha}
          />
          <span className="text-[10px] text-ink-300 font-mono tabular-nums w-10 text-right">
            {Math.round(rgb.a * 100)}%
          </span>
        </div>

        {/* HEX + preview */}
        <div className="flex items-center gap-1.5">
          <div
            className="w-7 h-7 rounded ring-1 ring-ink-700 shrink-0"
            style={{
              backgroundImage:
                `linear-gradient(${draft}, ${draft}), ` +
                `conic-gradient(#888 25%, #ccc 0 50%, #888 0 75%, #ccc 0)`,
              backgroundSize: "100% 100%, 8px 8px",
            }}
            title="Preview"
          />
          <div className="flex-1 flex items-center">
            <span className="text-[10px] text-ink-400 pr-1.5">HEX</span>
            <input
              value={hexInput}
              onChange={(e) => onHexChange(e.target.value)}
              spellCheck={false}
              className="flex-1 h-7 px-2 text-xs rounded bg-ink-700 border border-ink-700 outline-none focus:border-brand-600 text-ink-100 font-mono"
              placeholder="#FFFFFF"
            />
          </div>
        </div>

        {/* Editable RGB / HSL rows — every field syncs with HEX via the draft */}
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="text-ink-400 w-8 shrink-0 font-mono">RGB</span>
            <ChannelInput
              value={Math.round(rgb.r)}
              min={0}
              max={255}
              onChange={(v) => setRgbChannel("r", v)}
            />
            <ChannelInput
              value={Math.round(rgb.g)}
              min={0}
              max={255}
              onChange={(v) => setRgbChannel("g", v)}
            />
            <ChannelInput
              value={Math.round(rgb.b)}
              min={0}
              max={255}
              onChange={(v) => setRgbChannel("b", v)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-ink-400 w-8 shrink-0 font-mono">HSL</span>
            <ChannelInput
              value={hsl.h}
              min={0}
              max={360}
              suffix="°"
              onChange={(v) => setHslChannel("h", v)}
            />
            <ChannelInput
              value={hsl.s}
              min={0}
              max={100}
              suffix="%"
              onChange={(v) => setHslChannel("s", v)}
            />
            <ChannelInput
              value={hsl.l}
              min={0}
              max={100}
              suffix="%"
              onChange={(v) => setHslChannel("l", v)}
            />
          </div>
        </div>
      </div>

      {/* Cancel / Apply — only in "apply" mode. In "live" mode, the parent
          panel owns the commit flow so these would be redundant. */}
      {mode === "apply" && (
        <div className="flex items-center justify-end gap-1.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={!hasChange}
            className="h-7 px-3 text-xs rounded-md bg-ink-700 hover:bg-ink-600 text-ink-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!hasChange}
            className="h-7 px-3 text-xs rounded-md bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand-600 transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

// ── SV (saturation × value) picker ──────────────────────────────────────────

function SVPicker({
  hue,
  s,
  v,
  onChange,
}: {
  hue: number;
  s: number;
  v: number;
  onChange: (s: number, v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);

  function updateFrom(clientX: number, clientY: number) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sat = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const val = 1 - Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    onChange(sat, val);
  }

  useEffect(() => {
    function onUp() {
      dragRef.current = false;
    }
    function onMove(e: MouseEvent) {
      if (dragRef.current) updateFrom(e.clientX, e.clientY);
    }
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div
      ref={ref}
      onMouseDown={(e) => {
        dragRef.current = true;
        updateFrom(e.clientX, e.clientY);
      }}
      className="relative w-full h-32 rounded-md cursor-crosshair select-none overflow-hidden ring-1 ring-ink-700"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))`,
      }}
    >
      <div
        className="absolute w-3 h-3 rounded-full border-2 border-white pointer-events-none"
        style={{
          left: `calc(${s * 100}% - 6px)`,
          top: `calc(${(1 - v) * 100}% - 6px)`,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.6)",
        }}
      />
    </div>
  );
}

// ── Hue slider ──────────────────────────────────────────────────────────────

function HueSlider({
  hue,
  onChange,
}: {
  hue: number;
  onChange: (h: number) => void;
}) {
  return (
    <div className="relative flex-1 h-4">
      <div
        className="absolute inset-0 rounded-full ring-1 ring-ink-700"
        style={{
          background:
            "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
        }}
      />
      <input
        type="range"
        min={0}
        max={360}
        step={1}
        value={Math.round(hue)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border border-ink-900 pointer-events-none"
        style={{
          left: `calc(${(hue / 360) * 100}% - 8px)`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(0,0,0,0.15)",
        }}
      />
    </div>
  );
}

// ── Alpha slider (transparency) ─────────────────────────────────────────────

function AlphaSlider({
  r,
  g,
  b,
  a,
  onChange,
}: {
  r: number;
  g: number;
  b: number;
  a: number;
  onChange: (a: number) => void;
}) {
  const rr = Math.round(r);
  const gg = Math.round(g);
  const bb = Math.round(b);
  return (
    <div className="relative flex-1 h-4">
      <div
        className="absolute inset-0 rounded-full ring-1 ring-ink-700"
        style={{
          backgroundImage:
            `linear-gradient(to right, rgba(${rr},${gg},${bb},0), rgba(${rr},${gg},${bb},1)), ` +
            `conic-gradient(#888 25%, #ccc 0 50%, #888 0 75%, #ccc 0)`,
          backgroundSize: "100% 100%, 8px 8px",
          backgroundRepeat: "no-repeat, repeat",
        }}
      />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(a * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border border-ink-900 pointer-events-none"
        style={{
          left: `calc(${a * 100}% - 8px)`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(0,0,0,0.15)",
        }}
      />
    </div>
  );
}

// ── Swatch bands ────────────────────────────────────────────────────────────

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
          active={normalize(c) === value}
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
  const { r, g, b } = parseHex(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 160;
}

// ── Editable channel input ──────────────────────────────────────────────────
// Uses a local draft string so the user can transiently clear/retype without
// the displayed value snapping back to the clamped current value mid-edit.

function ChannelInput({
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(Math.round(value)));

  // Keep the draft synced with the outside value when the user isn't typing.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focused) setDraft(String(Math.round(value)));
  }, [value, focused]);

  function commit(v: string) {
    const n = Number(v);
    if (!Number.isFinite(n)) {
      setDraft(String(Math.round(value)));
      return;
    }
    const clamped = Math.max(min, Math.min(max, Math.round(n)));
    onChange(clamped);
    setDraft(String(clamped));
  }

  return (
    <div className="relative flex-1 min-w-0">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) {
            const clamped = Math.max(min, Math.min(max, Math.round(n)));
            onChange(clamped);
          }
        }}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={`w-full h-7 pl-1.5 ${
          suffix ? "pr-4" : "pr-1.5"
        } text-[11px] rounded bg-ink-800 border border-ink-700 outline-none focus:border-brand-600 text-ink-100 font-mono tabular-nums text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-400 font-mono">
          {suffix}
        </span>
      )}
    </div>
  );
}
