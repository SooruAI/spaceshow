import { Maximize2, Minus, Plus } from "lucide-react";
import { useStore } from "../store";

interface Props {
  viewportW: number;
  viewportH: number;
}

export function BottomBar({ viewportW, viewportH }: Props) {
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const fitAll = useStore((s) => s.fitAllSheets);
  const addSheet = useStore((s) => s.addSheet);
  const sheetsCount = useStore((s) => s.sheets.length);

  const pct = Math.round(zoom * 100);

  return (
    <div className="h-9 bg-ink-900 border-t border-ink-700 flex items-center px-3 gap-3">
      <button
        className="pill-btn"
        onClick={addSheet}
        title="Add a new sheet"
      >
        <Plus size={14} className="mr-1" /> Add sheet
      </button>
      <div className="text-xs text-ink-400">{sheetsCount} sheets</div>

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
