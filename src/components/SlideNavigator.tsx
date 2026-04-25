import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useStore } from "../store";

/**
 * Floating slide navigator for slide-mode editing. Mounts in App.tsx in place
 * of <FloatingAddSheet /> when viewMode === "slide". Walks slides in the
 * sheets[] array order — the same order the LeftSidebar Sheets tab shows
 * (and the user reorders via drag there). Hidden sheets are skipped from
 * navigation (the sidebar still shows them).
 *
 * Layout matches FloatingAddSheet's pill style + position so toggling between
 * slide and board modes doesn't shift other UI.
 */
export function SlideNavigator() {
  const sheets = useStore((s) => s.sheets);
  const activeSheetId = useStore((s) => s.activeSheetId);
  const gotoSlideByOffset = useStore((s) => s.gotoSlideByOffset);
  const addSheet = useStore((s) => s.addSheet);

  const visible = sheets.filter((s) => !s.hidden);
  const total = visible.length;
  const idx = visible.findIndex((s) => s.id === activeSheetId);
  const atStart = idx <= 0;
  const atEnd = idx < 0 || idx >= total - 1;
  // Display "0 / 0" when there are no visible slides; otherwise show the
  // 1-based current index. If the active sheet is hidden (idx < 0) but
  // visible sheets exist, fall back to showing "– / total".
  const display = total === 0 ? "0 / 0" : idx < 0 ? `– / ${total}` : `${idx + 1} / ${total}`;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 panel rounded-full shadow-lg px-1 py-1">
      <button
        type="button"
        onClick={() => gotoSlideByOffset(-1)}
        disabled={atStart}
        title="Previous slide"
        aria-label="Previous slide"
        className="w-8 h-8 inline-flex items-center justify-center rounded-full text-ink-100 hover:bg-ink-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="text-xs tabular-nums text-ink-100 px-2 select-none min-w-[3.5rem] text-center">
        {display}
      </div>
      <button
        type="button"
        onClick={() => gotoSlideByOffset(1)}
        disabled={atEnd}
        title="Next slide"
        aria-label="Next slide"
        className="w-8 h-8 inline-flex items-center justify-center rounded-full text-ink-100 hover:bg-ink-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        <ChevronRight size={16} />
      </button>
      <div className="w-px h-5 bg-ink-700 mx-1" />
      <button
        type="button"
        onClick={addSheet}
        title="Add a new slide"
        aria-label="Add a new slide"
        className="w-8 h-8 inline-flex items-center justify-center rounded-full text-ink-100 hover:bg-ink-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
