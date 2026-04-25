import { useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus, Settings } from "lucide-react";
import { useStore } from "../store";

interface Props {
  viewportW: number;
  viewportH: number;
}

export function BottomBar({ viewportW, viewportH }: Props) {
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const fitAll = useStore((s) => s.fitAllSheets);
  const showProfile = useStore((s) => s.showProfile);
  const showSettings = useStore((s) => s.showSettings);
  const setShowProfile = useStore((s) => s.setShowProfile);
  const setShowSettings = useStore((s) => s.setShowSettings);
  const polygonPrompt = useStore((s) => s.polygonSidesPrompt);
  const endPolygonPrompt = useStore((s) => s.endPolygonSidesPrompt);

  const pct = Math.round(zoom * 100);

  // When a polygon-sides prompt opens, we replace the bar's left cluster with
  // an inline number input. The local draft + error state lives here (not in
  // the store) since it's purely UI.
  const [draft, setDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Always seed the input with 5 (per UX spec) regardless of the caller's
  // `initial` — the field on the prompt is kept for future flexibility but
  // not consumed here. Auto-focus + select so the user can immediately
  // overtype with no extra clicks.
  useEffect(() => {
    if (polygonPrompt) {
      setDraft("5");
      setError(null);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [polygonPrompt]);

  function commit() {
    if (!polygonPrompt) return;
    const trimmed = draft.trim();
    const n = Number(trimmed);
    const valid =
      trimmed.length > 0 &&
      Number.isFinite(n) &&
      Number.isInteger(n) &&
      n >= 3 &&
      n <= 20;
    if (!valid) {
      setError("Enter a whole number between 3 and 20.");
      return;
    }
    polygonPrompt.onSubmit(n);
    endPolygonPrompt();
  }

  function cancel() {
    if (!polygonPrompt) return;
    polygonPrompt.onCancel?.();
    endPolygonPrompt();
  }

  return (
    <div className="h-9 bg-ink-900 border-t border-ink-700 flex items-center px-3 gap-3 relative">
      {/* Left cluster: Profile avatar + Settings cog. Always visible — the
          polygon-sides prompt now sits centered (absolute) so it doesn't
          displace these. */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setShowProfile(!showProfile)}
          title="Profile"
          aria-label="Profile"
          aria-pressed={showProfile}
          className={`h-7 px-1.5 inline-flex items-center gap-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
            showProfile
              ? "bg-ink-700 text-ink-100"
              : "text-ink-200 hover:bg-ink-800 hover:text-ink-100"
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 grid place-items-center text-[9px] font-bold text-white">
            B
          </span>
          <span className="text-xs font-medium">Profile</span>
        </button>
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
          aria-label="Settings"
          aria-pressed={showSettings}
          className={`w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
            showSettings
              ? "bg-ink-700 text-ink-100"
              : "text-ink-200 hover:bg-ink-800 hover:text-ink-100"
          }`}
        >
          <Settings size={14} />
        </button>
      </div>

      {/* Centered polygon-sides prompt. Absolute so it sits over the bar's
          midpoint regardless of the left/right cluster widths — matches the
          UX spec ("ask the question in the middle of the bottom toolbar").
          pointer-events-none on the wrapper so the empty space behind the
          prompt doesn't intercept clicks meant for nothing; the prompt's
          inner div re-enables pointer events for itself. */}
      {polygonPrompt && (
        <div className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto bg-ink-900 px-3 py-1 rounded-md">
            <span className="text-xs text-ink-200 font-medium">
              How many sides should the polygon have?
            </span>
            <input
              ref={inputRef}
              type="number"
              min={3}
              max={20}
              step={1}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancel();
                }
              }}
              className={`w-20 h-7 px-2 rounded text-xs bg-ink-800 border outline-none text-ink-100 ${
                error
                  ? "border-rose-500/70 focus:border-rose-500"
                  : "border-ink-700 focus:border-brand-500"
              }`}
              aria-invalid={!!error}
              aria-describedby={error ? "polygon-sides-error" : undefined}
            />
            <span className="text-[10px] text-ink-400">(3–20)</span>
            <button
              type="button"
              onClick={commit}
              className="h-7 px-3 rounded text-xs font-medium bg-brand-600 text-white hover:bg-brand-500"
            >
              OK
            </button>
            <button
              type="button"
              onClick={cancel}
              className="h-7 px-2 rounded text-xs text-ink-200 hover:bg-ink-700"
            >
              Cancel
            </button>
            {error && (
              <span
                id="polygon-sides-error"
                role="alert"
                className="text-[11px] text-rose-400"
              >
                {error}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          className="icon-btn"
          title="Fit all sheets"
          onClick={() => fitAll(viewportW, viewportH)}
        >
          <Maximize2 size={14} />
        </button>
        <button
          className="icon-btn"
          title="Zoom out"
          onClick={() => setZoom(Math.max(0.05, zoom - 0.1))}
        >
          <Minus size={14} />
        </button>
        <input
          type="range"
          min={0}
          max={400}
          value={pct}
          onChange={(e) => setZoom(Number(e.target.value) / 100)}
          className="w-44 accent-brand-500"
        />
        <button
          className="icon-btn"
          title="Zoom in"
          onClick={() => setZoom(Math.min(4, zoom + 0.1))}
        >
          <Plus size={14} />
        </button>
        <div className="w-12 text-right text-xs text-ink-200">{pct}%</div>
      </div>
    </div>
  );
}
