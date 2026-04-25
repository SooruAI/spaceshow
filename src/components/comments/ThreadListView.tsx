import { CheckCircle2, MessageSquare, Paperclip } from "lucide-react";
import { useStore } from "../../store";
import { AvatarStack } from "./AvatarStack";
import { docToText } from "./tiptapText";

/**
 * Scrollable list of all threads in the project. Tapping a row focuses
 * that thread in the sidebar. Hover sync: hovering a row highlights the
 * matching pin on the canvas via `hoverThreadId`.
 */
export function ThreadListView() {
  const threads = useStore((s) => s.threads);
  const comments = useStore((s) => s.comments);
  const attachments = useStore((s) => s.attachments);
  const focusThread = useStore((s) => s.focusThread);
  const setHoverThreadId = useStore((s) => s.setHoverThreadId);
  const hoverThreadId = useStore((s) => s.hoverThreadId);

  const ordered = [...threads].sort((a, b) => b.createdAt - a.createdAt);

  if (ordered.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto scroll-thin p-4 text-center text-xs text-ink-400">
        Press{" "}
        <kbd className="px-1 py-0.5 rounded bg-ink-800 text-ink-200 text-[10px]">
          C
        </kbd>{" "}
        and click the canvas to drop a pin.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scroll-thin">
      {ordered.map((t) => {
        const threadComments = comments.filter((c) => c.threadId === t.id);
        const root = threadComments.find((c) => c.parentId === null);
        const replies = threadComments.filter((c) => c.parentId !== null);
        const participants: string[] = [];
        for (const c of threadComments) {
          if (!participants.includes(c.authorId)) participants.push(c.authorId);
        }
        const commentIds = new Set(threadComments.map((c) => c.id));
        const threadAttachments = attachments.filter((a) =>
          commentIds.has(a.commentId)
        );
        const preview = truncate(docToText(root?.content), 90);
        const isHover = hoverThreadId === t.id;

        return (
          <button
            key={t.id}
            type="button"
            // `focusThread` switches sheet (if needed), pans/zooms the
            // canvas to bring the pin into view, and sets the active
            // thread so the ThreadPopover mounts at the (now visible)
            // pin. If the pin's already comfortably onscreen the camera
            // doesn't move — see store.ts.
            onClick={() => focusThread(t.id)}
            onMouseEnter={() => setHoverThreadId(t.id)}
            onMouseLeave={() => setHoverThreadId(null)}
            className={`w-full text-left px-3 py-2.5 border-b border-ink-800 transition-colors ${
              isHover ? "bg-ink-800/80" : "hover:bg-ink-800/60"
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <AvatarStack userIds={participants} />
              <div className="flex items-center gap-2 text-[10px] text-ink-400">
                {threadAttachments.length > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5"
                    title={`${threadAttachments.length} attachment${
                      threadAttachments.length === 1 ? "" : "s"
                    }`}
                  >
                    <Paperclip size={11} />
                    {threadAttachments.length}
                  </span>
                )}
                {replies.length > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5"
                    title={`${replies.length} repl${
                      replies.length === 1 ? "y" : "ies"
                    }`}
                  >
                    <MessageSquare size={11} />
                    {replies.length}
                  </span>
                )}
                {t.status === "resolved" && (
                  <span className="inline-flex items-center gap-0.5 text-emerald-400">
                    <CheckCircle2 size={11} />
                  </span>
                )}
              </div>
            </div>
            <div
              className={`text-xs leading-snug line-clamp-2 ${
                t.status === "resolved"
                  ? "text-ink-500 line-through"
                  : "text-ink-200"
              }`}
            >
              {preview || (
                <span className="text-ink-500 italic">(empty thread)</span>
              )}
            </div>
            <div className="mt-1 text-[10px] text-ink-500">
              {formatRelative(root?.createdAt ?? t.createdAt)} ·{" "}
              {labelFor(t.canvasId)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "\u2026";
}

function labelFor(canvasId: string): string {
  if (canvasId === "board") return "Board";
  const sheet = useStore.getState().sheets.find((s) => s.id === canvasId);
  return sheet?.name ?? "Sheet";
}

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  const m = Math.floor(delta / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
