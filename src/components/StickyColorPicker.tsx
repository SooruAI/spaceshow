import { useEffect, useRef, useState } from "react";
import { STICKY_COLOR_SWATCHES } from "../lib/sticky";

// ─────────────────────────────────────────────────────────────────────────────
// StickyColorPicker — popover colour picker for sticky background colours.
//
// Modelled on the pen-tool's `PenColorPopover` (SheetToolbar.tsx) so the
// visual + interaction language is consistent: preset swatch row at top,
// then SV (saturation/value) 2D box, then a hue slider, then an alpha
// slider, then HEX + RGB numeric inputs, then Cancel/Apply.
//
// What's intentionally different from the pen popover:
//   • No "Restore" button — stickies don't have a per-shape factory default
//     to restore to. Cancel + Apply only.
//   • Preset palette is the LIGHT-row sticky swatches. Saturated colours
//     are still reachable via the hue slider / hex / RGB inputs.
//
// Commit semantics: Apply is the ONLY path that writes back to the parent.
// Picking a swatch, dragging the SV/hue/alpha controls, typing in HEX or
// RGB — all of these mutate a LOCAL draft. The sticky on canvas does not
// change until Apply is clicked. Cancel discards the draft and closes.
// Both buttons stay disabled until the draft differs from `value`/`opacity`.
//
// Positioning: absolute `top-full mt-2 left-0` — drop inside a
// `position: relative` parent (StickyFormatBar's Color button wrapper).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** Currently committed background colour (hex, e.g. "#fef3c7"). Used as
   *  the dirty-check baseline AND as the picker's initial draft. */
  value: string;
  /** Currently committed alpha 0..1. Defaults to 1 if the parent doesn't
   *  pass one (legacy stickies). */
  opacity?: number;
  /** Fired ONLY on Apply. Receives the draft hex + alpha so the parent can
   *  patch both fields in a single store write. */
  onApply: (next: { color: string; opacity: number }) => void;
  /** Optional close hook. Called after BOTH Apply and Cancel. */
  onClose?: () => void;
}

export function StickyColorPicker({ value, opacity = 1, onApply, onClose }: Props) {
  // Local drafts — the source of truth while the popover is open.
  const [draftColor, setDraftColor] = useState<string>(normaliseHex(value));
  const [draftOpacity, setDraftOpacity] = useState<number>(clamp01(opacity));

  // Re-sync when the parent's committed value changes (e.g. user clicks a
  // different sticky while the popover is open).
  useEffect(() => setDraftColor(normaliseHex(value)), [value]);
  useEffect(() => setDraftOpacity(clamp01(opacity)), [opacity]);

  const dirty =
    draftColor.toUpperCase() !== normaliseHex(value).toUpperCase() ||
    draftOpacity !== clamp01(opacity);

  function handleApply() {
    if (!dirty) return;
    onApply({ color: draftColor, opacity: draftOpacity });
    onClose?.();
  }
  function handleCancel() {
    setDraftColor(normaliseHex(value));
    setDraftOpacity(clamp01(opacity));
    onClose?.();
  }

  // Decompose draft for the SV / hue / alpha widgets.
  const [r, g, b] = hexToRgbTuple(draftColor);
  const currentHsv = rgbToHsv(r, g, b);

  // Hue is held independently — at pure greys HSV.h collapses to 0 which
  // would visually snap the slider. Keep the last non-grey hue (same trick
  // the pen popover uses).
  const [hue, setHue] = useState<number>(currentHsv.h);
  useEffect(() => {
    if (currentHsv.s > 0.001) setHue(currentHsv.h);
  }, [currentHsv.h, currentHsv.s]);

  function applyHsv(h: number, s: number, v: number) {
    const { r: r2, g: g2, b: b2 } = hsvToRgb(h, s, v);
    setDraftColor(rgbTupleToHex(r2, g2, b2));
  }
  function applyHex(raw: string) {
    const v = raw.trim();
    const normalised = v.startsWith("#") ? v : `#${v}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(normalised)) return;
    setDraftColor(normalised.toUpperCase());
  }
  function applyRgb(ch: "r" | "g" | "b", value: number) {
    if (!Number.isFinite(value)) return;
    const next: [number, number, number] =
      ch === "r" ? [value, g, b] : ch === "g" ? [r, value, b] : [r, g, value];
    setDraftColor(rgbTupleToHex(next[0], next[1], next[2]));
  }

  // ── Pointer-drag plumbing for SV / hue / alpha ────────────────────────
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<HTMLDivElement>(null);

  function pctFromX(ref: React.RefObject<HTMLElement | null>, clientX: number) {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }
  function updateFromSv(cx: number, cy: number) {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (cy - rect.top) / rect.height));
    applyHsv(hue, s, v);
  }
  function updateFromHue(cx: number) {
    const pct = pctFromX(hueRef, cx);
    const nextHue = pct * 360;
    setHue(nextHue);
    applyHsv(nextHue, currentHsv.s, currentHsv.v);
  }
  function updateFromAlpha(cx: number) {
    setDraftOpacity(clamp01(pctFromX(alphaRef, cx)));
  }
  function dragBind(update: (x: number, y: number) => void) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if ((e.buttons & 1) !== 1) return;
        update(e.clientX, e.clientY);
      },
      onPointerUp: (e: React.PointerEvent) => {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* pointer already released */
        }
      },
    };
  }

  // HEX text-input has its own draft — typing partial hex shouldn't write
  // mid-keystroke. Commit on blur/Enter. Reset whenever `draftColor` shifts
  // from outside (e.g. SV drag).
  const [hexDraft, setHexDraft] = useState<string>(draftColor);
  useEffect(() => setHexDraft(draftColor), [draftColor]);

  const selectedSwatch = STICKY_COLOR_SWATCHES.find(
    (p) => p.value.toUpperCase() === draftColor.toUpperCase(),
  );
  const displayName = selectedSwatch ? selectedSwatch.label : "Custom";
  const alphaPct = Math.round(draftOpacity * 100);

  return (
    <div
      data-sticky-color-picker
      className="absolute top-full mt-2 left-0 z-40 w-[260px] rounded-md shadow-2xl ring-1 ring-black/40 p-3"
      style={{ background: "var(--bg-secondary)" }}
      // Stop mousedown from bubbling to the format bar's outside-click
      // listener (which would close the popover before the click registers).
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between shrink-0 mb-2">
        <div className="text-xs font-medium text-ink-200">Sticky colour</div>
      </div>

      {/* Preset swatch row — single row of light pastels. Clicking a tile
          stamps both the colour AND resets opacity to 100% (matches what a
          user expects when they pick "Yellow" — they want the canonical
          opaque yellow, not yellow at whatever alpha they were tweaking). */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STICKY_COLOR_SWATCHES.map((s) => {
          const active = draftColor.toUpperCase() === s.value.toUpperCase();
          return (
            <button
              key={s.value}
              type="button"
              title={s.label}
              aria-label={s.label}
              aria-pressed={active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setDraftColor(s.value.toUpperCase());
                setDraftOpacity(1);
              }}
              className={`w-6 h-6 rounded-md ring-1 transition-transform hover:scale-110 ${
                active ? "ring-2 ring-brand-500" : "ring-ink-700"
              }`}
              style={{ background: s.value }}
            />
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] min-h-[14px]">
        <span className="truncate text-ink-200">{displayName}</span>
        <span className="text-ink-500 font-mono tabular-nums">
          {draftColor.toUpperCase()}
        </span>
      </div>

      <div className="border-t border-ink-700 my-2" />

      {/* SV (saturation / value) 2D picker */}
      <div
        ref={svRef}
        role="slider"
        aria-label="Saturation and brightness"
        className="relative w-full h-[88px] rounded-md overflow-hidden cursor-crosshair select-none touch-none"
        style={{
          backgroundColor: `hsl(${hue}, 100%, 50%)`,
          backgroundImage:
            "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
        }}
        {...dragBind(updateFromSv)}
      >
        <div
          className="absolute w-3 h-3 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${currentHsv.s * 100}%`,
            top: `${(1 - currentHsv.v) * 100}%`,
            background: draftColor,
          }}
        />
      </div>

      {/* Hue slider */}
      <div className="mt-2 flex items-center gap-1.5">
        <div
          ref={hueRef}
          role="slider"
          aria-label="Hue"
          aria-valuenow={Math.round(hue)}
          aria-valuemin={0}
          aria-valuemax={360}
          className="relative flex-1 h-2.5 rounded-full cursor-pointer select-none touch-none"
          style={{
            background:
              "linear-gradient(to right, #ff0000 0%, #ffff00 16.66%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.66%, #ff00ff 83.33%, #ff0000 100%)",
          }}
          {...dragBind((x) => updateFromHue(x))}
        >
          <div
            className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none"
            style={{
              left: `${(hue / 360) * 100}%`,
              background: `hsl(${hue}, 100%, 50%)`,
            }}
          />
        </div>
        <span className="text-[10px] text-ink-400 tabular-nums min-w-[28px] text-right">
          {Math.round(hue)}°
        </span>
      </div>

      {/* Alpha (opacity) slider */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <div
          ref={alphaRef}
          role="slider"
          aria-label="Opacity"
          aria-valuenow={alphaPct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="relative flex-1 h-2.5 rounded-full cursor-pointer select-none touch-none"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(${r},${g},${b},0), rgba(${r},${g},${b},1)), ${CHECKER_BG_URL}`,
            backgroundSize: "100% 100%, 10px 10px",
          }}
          {...dragBind((x) => updateFromAlpha(x))}
        >
          <div
            className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none"
            style={{
              left: `${draftOpacity * 100}%`,
              background: draftColor,
            }}
          />
        </div>
        <span className="text-[10px] text-ink-400 tabular-nums min-w-[28px] text-right">
          {alphaPct}%
        </span>
      </div>

      {/* Preview swatch + HEX input */}
      <div className="mt-2 flex items-center gap-1.5">
        <div
          className="w-7 h-7 rounded border border-ink-700 shrink-0"
          style={{ background: draftColor, opacity: draftOpacity }}
          aria-label="Preview swatch"
        />
        <div className="flex-1 flex items-center gap-1">
          <span className="text-[10px] text-ink-500 shrink-0">HEX</span>
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={(e) => applyHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="flex-1 min-w-0 h-7 px-1.5 text-[11px] rounded bg-ink-900 border border-ink-700 outline-none focus:border-brand-600 text-ink-100 font-mono"
            spellCheck={false}
          />
        </div>
      </div>

      {/* RGB triplet — three numeric inputs, 0..255 each. */}
      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {(["r", "g", "b"] as const).map((ch, idx) => {
          const v = [r, g, b][idx];
          return (
            <div key={ch} className="flex items-center gap-1">
              <span className="text-[10px] text-ink-500 uppercase shrink-0">
                {ch}
              </span>
              <input
                type="number"
                min={0}
                max={255}
                value={v}
                onChange={(e) => applyRgb(ch, Number(e.target.value))}
                className="w-full min-w-0 h-6 px-1 text-[11px] rounded bg-ink-900 border border-ink-700 outline-none focus:border-brand-600 text-ink-100 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                aria-label={`${ch.toUpperCase()} channel`}
              />
            </div>
          );
        })}
      </div>

      {/* Cancel / Apply — both gated on `dirty` so they only light up when
          the user has actually changed something. Same disabled pattern as
          the pen popover. */}
      <div className="mt-3 pt-2 border-t border-ink-700 flex items-center gap-1">
        <button
          type="button"
          onClick={handleCancel}
          disabled={!dirty}
          className="flex-1 h-7 rounded text-[11px] font-medium bg-ink-800 text-ink-200 hover:bg-ink-700 disabled:bg-ink-900 disabled:text-ink-600 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!dirty}
          className="flex-1 h-7 rounded text-[11px] font-medium bg-brand-500 text-white hover:bg-brand-400 disabled:bg-ink-800 disabled:text-ink-600 disabled:cursor-not-allowed transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── colour-math helpers ─────────────────────────────
// Duplicated from SheetToolbar.tsx (PenColorPopover). Small enough that
// inlining beats a shared module for now; extract to `lib/color.ts` if a
// third caller shows up.

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normaliseHex(input: string | undefined | null): string {
  if (!input) return "#FFFFFF";
  const v = input.trim();
  const withHash = v.startsWith("#") ? v : `#${v}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return "#FFFFFF";
  return withHash.toUpperCase();
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const h = normaliseHex(hex).replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbTupleToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, "0").toUpperCase())
      .join("")
  );
}

function rgbToHsv(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; v: number } {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hsvToRgb(
  h: number,
  s: number,
  v: number,
): { r: number; g: number; b: number } {
  const c = v * s;
  const hh = (h % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let rp = 0,
    gp = 0,
    bp = 0;
  if (hh >= 0 && hh < 1) {
    rp = c;
    gp = x;
    bp = 0;
  } else if (hh < 2) {
    rp = x;
    gp = c;
    bp = 0;
  } else if (hh < 3) {
    rp = 0;
    gp = c;
    bp = x;
  } else if (hh < 4) {
    rp = 0;
    gp = x;
    bp = c;
  } else if (hh < 5) {
    rp = x;
    gp = 0;
    bp = c;
  } else {
    rp = c;
    gp = 0;
    bp = x;
  }
  const m = v - c;
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}

/** SVG-encoded checker pattern for the alpha slider backdrop. Mirrors the
 *  one in SheetToolbar so the visual language is identical. */
const CHECKER_BG_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><rect width='5' height='5' fill='%23cbd5e1'/><rect x='5' y='5' width='5' height='5' fill='%23cbd5e1'/><rect x='5' width='5' height='5' fill='%23f8fafc'/><rect y='5' width='5' height='5' fill='%23f8fafc'/></svg>\")";
