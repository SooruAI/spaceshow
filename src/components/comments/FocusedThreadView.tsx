import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useStore } from "../../store";
import { CommentCard } from "./CommentCard";
import { ReplyItem } from "./ReplyItem";
import { RichTextInput } from "./RichTextInput";

/**
 * Detail view for the focused thread. Layout:
 *   - PagerBar      (Back ← | "n of m" | Next →)
 *   - Thread header (canvas location + resolve/delete actions)
 *   - Root CommentCard
 *   - Replies (chronological)
 *   - RichTextInput (composer)
 *
 * `n / m` is derived from the thread list sorted by createdAt desc. Prev
 * and Next clamp at the ends. The composer submits a reply against the
 * currently-active thread; the first reply (no existing root) is stored
 * with `parentId: null` per the store's contract.
 */
export function FocusedThreadView() {
  const threads = useStore((s) => s.threads);
  const comments = useStore((s) => s.comments);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const setActiveThread = useStore((s) => s.setActiveThread);
  const resolveThread = useStore((s) => s.resolveThread);
  const deleteThread = useStore((s) => s.deleteThread);
  const sheets = useStore((s) => s.sheets);

  const ordered = [...threads].sort((a, b) => b.createdAt - a.createdAt);
  const index = ordered.findIndex((t) => t.id === activeThreadId);
  const thread = index >= 0 ? ordered[index] : null;

  if (!thread) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="h-9 border-b border-ink-800 px-2 flex items-center gap-2 text-xs text-ink-300">
          <button
            type="button"
            onClick={() => setActiveThread(null)}
            className="icon-btn"
            aria-label="Back to list"
          >
            <ChevronLeft size={14} />
          </button>
          <span>Thread not found</span>
        </div>
        <div className="flex-1 p-4 text-center text-xs text-ink-400">
          This thread may have been deleted.
        </div>
      </div>
    );
  }

  const threadComments = comments
    .filter((c) => c.threadId === thread.id)
    .sort((a, b) => a.createdAt - b.createdAt);
  const root = threadComments.find((c) => c.parentId === null);
  const replies = threadComments.filter((c) => c.parentId !== null);
  const resolved = thread.status === "resolved";

  const prev = index > 0 ? ordered[index - 1] : null;
  const next = index < ordered.length - 1 ? ordered[index + 1] : null;

  const location =
    thread.canvasId === "board"
      ? "Board"
      : sheets.find((s) => s.id === thread.canvasId)?.name ?? "Sheet";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Pager */}
      <div className="h-9 border-b border-ink-800 px-2 flex items-center gap-1 text-xs text-ink-300">
        <button
          type="button"
          onClick={() => setActiveThread(null)}
          className="icon-btn"
          title="Back to list"
          aria-label="Back to list"
        >
          <ChevronLeft size={14} />
        </button>
        <div className="flex-1 flex items-center justify-center gap-1">
          <button
            type="button"
            disabled={!prev}
            onClick={() => prev && setActiveThread(prev.id)}
            className="icon-btn disabled:opacity-40 disabled:cursor-not-allowed"
            title="Previous thread"
            aria-label="Previous thread"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="tabular-nums text-ink-200">
            {index + 1} of {ordered.length}
          </span>
          <button
            type="button"
            disabled={!next}
            onClick={() => next && setActiveThread(next.id)}
            className="icon-btn disabled:opacity-40 disabled:cursor-not-allowed"
            title="Next thread"
            aria-label="Next thread"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="w-7" />
      </div>

      {/* Location + resolve/delete */}
      <div className="px-3 py-2 border-b border-ink-800 flex items-center gap-2 text-[11px]">
        <span className="text-ink-400">On</span>
        <span className="text-ink-200 font-medium">{location}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => resolveThread(thread.id, !resolved)}
            className={`icon-btn ${resolved ? "text-emerald-400" : ""}`}
            title={resolved ? "Reopen thread" : "Mark resolved"}
            aria-label={resolved ? "Reopen thread" : "Mark resolved"}
          >
            {resolved ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete this thread and all replies?")) {
                deleteThread(thread.id);
              }
            }}
            className="icon-btn hover:text-red-400"
            title="Delete thread"
            aria-label="Delete thread"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Body — root + replies */}
      <div className="flex-1 overflow-y-auto scroll-thin">
        {root ? (
          <CommentCard comment={root} />
        ) : (
          <div className="px-3 py-4 text-[11px] text-ink-500 italic border-b border-ink-800">
            Empty thread — add the first comment below.
          </div>
        )}
        {replies.map((r) => (
          <ReplyItem key={r.id} comment={r} />
        ))}
      </div>

      {/* Composer — key on threadId remounts cleanly on thread switch so
          the editor/staged-attachment state resets for free (no effect). */}
      <RichTextInput key={thread.id} threadId={thread.id} hasRoot={!!root} />
    </div>
  );
}
