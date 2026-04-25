import { History, PanelRightClose, X } from "lucide-react";
import { useStore } from "../../store";

/**
 * Docked right-rail Versions panel. Mutex with RightSidebar (Views) and
 * CommentsSidebar via openRightPanel. Surfaces the existing undo/redo
 * `past` snapshot stack as a reviewable / restorable timeline.
 *
 * Header buttons mirror CommentsSidebar:
 *   - left : collapse the right rail entirely (PanelRightClose).
 *   - right: swap back to Views (X).
 */
export function VersionsSidebar() {
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const users = useStore((s) => s.users);
  const openRightPanel = useStore((s) => s.openRightPanel);
  const restoreVersion = useStore((s) => s.restoreVersion);

  // Newest snapshot in `past` is at the end. Reverse so the timeline reads
  // top-down: most recent edit first. The "Now" row above represents the
  // live document state that isn't itself in `past`.
  const rows = [...past].reverse();
  const hasFuture = future.length > 0;
  const userById = new Map(users.map((u) => [u.id, u]));

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
        <span>Versions</span>
        <button
          type="button"
          onClick={() => openRightPanel("views")}
          title="Close versions and show views"
          aria-label="Close versions and show views"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-400 hover:text-ink-100 hover:bg-ink-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin">
        <div
          className={`px-3 py-2 border-b border-ink-800 ${
            hasFuture ? "" : "bg-ink-800/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                hasFuture ? "bg-ink-600" : "bg-brand-500"
              }`}
              aria-hidden
            />
            <span className="text-sm text-ink-100">Now</span>
          </div>
          <div className="text-xs text-ink-400 mt-0.5 ml-4">
            {hasFuture ? "Restored from history" : "Current edit"}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center px-4 py-10 text-ink-400">
            <History size={20} className="mb-2 opacity-60" />
            <div className="text-sm text-ink-300">No edits yet</div>
            <div className="text-xs mt-1 leading-snug">
              Make a change on the canvas — it'll show up here.
            </div>
          </div>
        ) : (
          rows.map((snap) => {
            const user = userById.get(snap.userId);
            return (
              <button
                key={snap.id}
                type="button"
                onClick={() => restoreVersion(snap.id)}
                className="w-full text-left px-3 py-2 border-b border-ink-800 hover:bg-ink-800 transition-colors focus:outline-none focus-visible:bg-ink-800"
                title="Restore this version"
              >
                <div className="flex gap-2">
                  {snap.thumbnail ? (
                    <img
                      src={snap.thumbnail}
                      alt=""
                      className="w-16 h-12 rounded border border-ink-700 object-cover bg-ink-800 flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-16 h-12 rounded border border-ink-700 bg-ink-800 flex-shrink-0"
                      aria-hidden
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full bg-ink-600"
                        aria-hidden
                      />
                      <span className="text-sm text-ink-100">
                        {snap.label ?? "Edit"}
                      </span>
                    </div>
                    <div className="text-xs text-ink-400 mt-0.5 ml-4 flex items-center gap-1.5 truncate">
                      <span className="text-ink-300 truncate">
                        {user?.name ?? "Unknown"}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="truncate">
                        {formatRelativeTime(snap.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
