import { PanelRightClose, X } from "lucide-react";
import { useStore } from "../../store";
import { ThreadListView } from "./ThreadListView";

/**
 * Docked right-rail comments panel. Mutex with RightSidebar (Views) via
 * `openRightPanel`. The sidebar is purely a list now — clicking a row
 * (or a pin on the canvas) opens a `<ThreadPopover />` anchored to the
 * pin's screen position, which hosts the focused thread + composer.
 *
 * Pin visibility is gated on this rail being open: when the rail closes,
 * `Canvas.tsx` unmounts the pin layer so the canvas returns to a clean
 * working surface. Re-opening the rail restores the pins.
 *
 * Header buttons:
 *   - left : collapse the whole right rail (PanelRightClose).
 *   - right: swap to Views (single atomic action via openRightPanel;
 *            replaces the floating Show-views affordance, which overlapped
 *            the header and was a no-op while comments was open).
 */
export function CommentsSidebar() {
  const openRightPanel = useStore((s) => s.openRightPanel);

  return (
    <div className="w-72 bg-ink-900 border-l border-ink-700 flex flex-col">
      <div className="relative px-2 h-9 flex items-center justify-center border-b border-ink-800 text-xs text-ink-300 uppercase tracking-wider">
        <button
          type="button"
          onClick={() => openRightPanel(null)}
          title="Collapse right panel"
          aria-label="Collapse right panel"
          className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-400 hover:text-ink-100 hover:bg-ink-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <PanelRightClose size={14} />
        </button>
        <span>Comments</span>
        <button
          type="button"
          onClick={() => openRightPanel("views")}
          title="Close comments and show views"
          aria-label="Close comments and show views"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-400 hover:text-ink-100 hover:bg-ink-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <X size={14} />
        </button>
      </div>
      <ThreadListView />
    </div>
  );
}
