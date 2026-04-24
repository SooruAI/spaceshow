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

  const pct = Math.round(zoom * 100);

  return (
    <div className="h-9 bg-ink-900 border-t border-ink-700 flex items-center px-3 gap-3">
      {/* Left cluster: Profile avatar + Settings cog. Moved here from the
          LeftSidebar footer so global utility actions live alongside the
          other app-wide controls (zoom, fit). */}
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
