import { useRef } from "react";
import { Droplet, Eraser, Minus, MousePointerSquareDashed, Pipette } from "lucide-react";
import { useStore } from "../store";

/**
 * Floating "tool settings" popover that sits directly above the
 * PresenterControls bar whenever the active tool is `pen` or `eraser`.
 * Always mounted-on-demand so the fade-in animation replays on every tool
 * activation; unmount is instant (tool swap is already a visual transition
 * on the control bar so no further fade-out is needed).
 *
 * Layout mirrors the pill vocabulary of the control bar: rounded-2xl,
 * backdrop blur, same border + shadow language.
 */
export function PresenterToolSettings() {
  const tool = useStore((s) => s.presentationTool);

  if (tool !== "pen" && tool !== "eraser") return null;

  return (
    <div
      role="toolbar"
      aria-label="Tool settings"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed bottom-[80px] left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-ink-900/85 backdrop-blur-md border border-ink-700 shadow-[0_12px_40px_rgba(0,0,0,0.5)] z-[21] text-ink-100 animate-fade-in"
      style={{ cursor: "auto" }}
    >
      {tool === "pen" ? <PenSettings /> : <EraserSettings />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pen
// ─────────────────────────────────────────────────────────────────────────────

const PRESETS: { hex: string; name: string }[] = [
  { hex: "#000000", name: "Black" },
  { hex: "#3b82f6", name: "Blue" },
  { hex: "#ef4444", name: "Red" },
  { hex: "#0d9488", name: "Green" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#a855f7", name: "Purple" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#ffffff", name: "White" },
];

function PenSettings() {
  const color = useStore((s) => s.presentationPenColor);
  const setColor = useStore((s) => s.setPresentationPenColor);
  const weight = useStore((s) => s.presentationPenWeight);
  const setWeight = useStore((s) => s.setPresentationPenWeight);
  const opacity = useStore((s) => s.presentationPenOpacity);
  const setOpacity = useStore((s) => s.setPresentationPenOpacity);

  const pickerRef = useRef<HTMLInputElement>(null);
  const isCustom = !PRESETS.some((p) => p.hex.toLowerCase() === color.toLowerCase());

  // Keep the preview dot at a comfortable size even when the slider is near
  // the minimum (a 1px dot is hard to read).
  const previewDotSize = Math.max(6, Math.min(26, weight));

  return (
    <>
      <div
        role="radiogroup"
        aria-label="Pen color"
        className="flex items-center gap-1.5"
        onKeyDown={(e) => handleSwatchArrows(e, setColor)}
      >
        {PRESETS.map((p) => (
          <Swatch
            key={p.hex}
            color={p.hex}
            selected={color.toLowerCase() === p.hex.toLowerCase()}
            name={p.name}
            onSelect={() => setColor(p.hex)}
          />
        ))}
        {/* Custom — conic-gradient swirl; opens the native color picker. */}
        <button
          type="button"
          onClick={() => pickerRef.current?.click()}
          aria-label="Custom color"
          title="Custom color"
          role="radio"
          aria-checked={isCustom}
          className={
            "relative w-[22px] h-[22px] rounded-full transition-transform duration-120 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 " +
            (isCustom
              ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-ink-900"
              : "")
          }
          style={{
            background:
              "conic-gradient(from 0deg, #ef4444, #f97316, #facc15, #22c55e, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
          }}
        >
          {/* Dot in the center showing the currently-picked custom color. */}
          {isCustom && (
            <span
              aria-hidden
              className="absolute inset-0 m-auto w-[10px] h-[10px] rounded-full border border-white/60"
              style={{ background: color }}
            />
          )}
          {!isCustom && <Pipette size={10} className="text-white drop-shadow mx-auto" />}
          <input
            ref={pickerRef}
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
        </button>
      </div>

      <Divider />

      {/* Width slider */}
      <div className="flex items-center gap-2">
        <Minus size={14} className="text-ink-400 shrink-0" aria-hidden />
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
          className="line-tool-range w-[110px]"
          aria-label="Stroke width"
        />
        <div
          className="shrink-0 grid place-items-center w-7 h-7"
          aria-hidden
        >
          <span
            className="rounded-full"
            style={{
              width: previewDotSize,
              height: previewDotSize,
              background: color,
              opacity,
              boxShadow:
                color.toLowerCase() === "#ffffff"
                  ? "inset 0 0 0 1px rgba(0,0,0,0.15)"
                  : undefined,
            }}
          />
        </div>
        <span className="text-xs text-ink-400 tabular-nums w-7 text-right">
          {weight}
        </span>
      </div>

      <Divider />

      {/* Opacity slider */}
      <div className="flex items-center gap-2">
        <Droplet size={14} className="text-ink-400 shrink-0" aria-hidden />
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={Math.round(opacity * 100)}
          onChange={(e) => setOpacity(Number(e.target.value) / 100)}
          className="line-tool-range w-[110px]"
          aria-label="Stroke opacity"
        />
        <span className="text-xs text-ink-400 tabular-nums w-9 text-right">
          {Math.round(opacity * 100)}%
        </span>
      </div>
    </>
  );
}

function Swatch({
  color,
  selected,
  name,
  onSelect,
}: {
  color: string;
  selected: boolean;
  name: string;
  onSelect: () => void;
}) {
  const isWhite = color.toLowerCase() === "#ffffff";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${name} pen`}
      title={name}
      onClick={onSelect}
      data-swatch-color={color}
      className={
        "w-[22px] h-[22px] rounded-full transition-transform duration-120 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 " +
        (selected
          ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-ink-900"
          : "")
      }
      style={{
        background: color,
        border: isWhite
          ? "1.5px solid rgba(0,0,0,0.2)"
          : "1.5px solid rgba(255,255,255,0.08)",
      }}
    />
  );
}

/** Arrow keys cycle through swatches inside the radiogroup. */
function handleSwatchArrows(
  e: React.KeyboardEvent<HTMLDivElement>,
  setColor: (c: string) => void,
) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const current = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(
    "[aria-checked='true']",
  );
  if (!current) return;
  const buttons = Array.from(
    (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[role='radio']"),
  );
  const idx = buttons.indexOf(current);
  if (idx < 0) return;
  const nextIdx =
    e.key === "ArrowRight"
      ? (idx + 1) % buttons.length
      : (idx - 1 + buttons.length) % buttons.length;
  const nextBtn = buttons[nextIdx];
  const nextColor = nextBtn.getAttribute("data-swatch-color");
  if (nextColor) {
    setColor(nextColor);
    nextBtn.focus();
    e.preventDefault();
    e.stopPropagation();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Eraser
// ─────────────────────────────────────────────────────────────────────────────

function EraserSettings() {
  const mode = useStore((s) => s.presentationEraserMode);
  const setMode = useStore((s) => s.setPresentationEraserMode);
  const width = useStore((s) => s.presentationEraserWidth);
  const setWidth = useStore((s) => s.setPresentationEraserWidth);

  const previewSize = Math.min(28, Math.max(12, width));

  return (
    <>
      {/* Mode toggle — segmented, mirroring SheetSelectionModal filter tabs. */}
      <div
        role="tablist"
        aria-label="Eraser mode"
        className="inline-flex items-center gap-0.5 bg-ink-900 rounded-full p-0.5"
      >
        <ModePill
          active={mode === "pixel"}
          onClick={() => setMode("pixel")}
          label="Pixel"
          Icon={Eraser}
          titleKey="Shift+E"
        />
        <ModePill
          active={mode === "object"}
          onClick={() => setMode("object")}
          label="Object"
          Icon={MousePointerSquareDashed}
          titleKey="Shift+E"
        />
      </div>

      <Divider />

      {/* Width slider — only meaningful in pixel mode. In object mode it's
          disabled (pick-radius is fixed) with a small hint. */}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={6}
          max={48}
          step={1}
          value={width}
          disabled={mode === "object"}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="line-tool-range w-[110px] disabled:opacity-40"
          aria-label="Eraser width"
        />
        <div
          className="shrink-0 grid place-items-center w-8 h-8"
          aria-hidden
        >
          <span
            className="rounded-full"
            style={{
              width: previewSize,
              height: previewSize,
              border:
                mode === "object"
                  ? "1.5px dashed rgba(239,68,68,0.8)"
                  : "1.5px solid rgba(255,255,255,0.6)",
              background:
                mode === "object"
                  ? "rgba(239,68,68,0.08)"
                  : "rgba(255,255,255,0.08)",
              opacity: mode === "object" ? 0.85 : 1,
            }}
          />
        </div>
        <span className="text-xs text-ink-400 tabular-nums w-9 text-right">
          {mode === "object" ? "auto" : `${width}px`}
        </span>
      </div>
    </>
  );
}

function ModePill({
  active,
  onClick,
  label,
  Icon,
  titleKey,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  titleKey: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-pressed={active}
      aria-selected={active}
      title={`${label} eraser — ${titleKey}`}
      onClick={onClick}
      className={
        "h-7 px-3 text-xs font-medium rounded-full transition-colors inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 " +
        (active
          ? "bg-brand-600 text-white shadow-sm"
          : "text-ink-300 hover:text-ink-100")
      }
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Divider() {
  return <div className="w-px h-6 bg-ink-700 mx-1" aria-hidden />;
}
