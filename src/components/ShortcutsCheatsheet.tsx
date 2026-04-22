import { useEffect } from "react";
import { X } from "lucide-react";
import { useStore } from "../store";
import { SHORTCUTS } from "../hooks/useShortcuts";

/**
 * Modal cheatsheet listing every registered keyboard shortcut, grouped by
 * category. Gated on store flag `showShortcuts` (toggled with "?"). Close on
 * backdrop click, Escape, or the × button.
 */
export function ShortcutsCheatsheet() {
  const setShowShortcuts = useStore((s) => s.setShowShortcuts);

  // Local Escape handler so the modal closes even if the global useShortcuts
  // hook's Escape branch were ever bypassed.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowShortcuts(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setShowShortcuts]);

  // Group rows by category, preserving insertion order.
  const groups: Record<string, typeof SHORTCUTS> = {};
  for (const s of SHORTCUTS) {
    (groups[s.group] ||= []).push(s);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setShowShortcuts(false)}
    >
      <div
        className="w-[min(720px,92vw)] max-h-[85vh] overflow-auto rounded-xl border bg-[var(--panel-bg)] text-[var(--text-primary)] shadow-2xl"
        style={{ borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <div className="text-lg font-semibold">Keyboard shortcuts</div>
            <div className="text-xs opacity-70">
              Press <kbd className="px-1.5 py-0.5 rounded border border-current/40">?</kbd> any
              time to open this list.
            </div>
          </div>
          <button
            className="p-1.5 rounded hover:bg-white/10"
            onClick={() => setShowShortcuts(false)}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          {Object.entries(groups).map(([group, rows]) => (
            <section key={group}>
              <h3 className="text-xs uppercase tracking-wider opacity-70 mb-2">
                {group}
              </h3>
              <ul className="space-y-1.5">
                {rows.map((r) => (
                  <li
                    key={`${group}-${r.keys}-${r.label}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="opacity-90">{r.label}</span>
                    <kbd
                      className="text-xs font-mono px-2 py-0.5 rounded border"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--panel-muted, rgba(255,255,255,0.05))",
                      }}
                    >
                      {r.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
