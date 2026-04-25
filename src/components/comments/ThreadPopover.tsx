import {
  CheckCircle2,
  MapPin,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import { screenAnchorForThread } from "../../lib/comments";
import { CommentCard } from "./CommentCard";
import { ReplyItem } from "./ReplyItem";
import { RichTextInput } from "./RichTextInput";

interface Props {
  threadId: string;
}

const POPOVER_W = 320;
const POPOVER_BASE_MAX_H = 480;
const PIN_SCREEN_R = 11; // matches the pin's screen-px target in CommentPinLayer
const GAP = 12;

/**
 * Floating dialogue box anchored to a comment pin's on-screen position.
 * Replaces the v1 sidebar "focused thread" view — keeping the thread
 * spatially co-located with the pin it represents.
 *
 * Anchor math lives in `src/lib/comments.ts` so this popover and the
 * `focusThread` recenter action agree byte-for-byte on where the pin is.
 *
 * Layout: header (location + resolve + delete + close) / body (root
 * `CommentCard` + `ReplyItem`s, scrollable) / footer (`RichTextInput`).
 *
 * Dismiss paths:
 *   - Close button → `setActiveThread(null)`.
 *   - `Escape` (any descendant focus) → `setActiveThread(null)`.
 *   - Outside click on non-canvas DOM → `setActiveThread(null)`. Konva
 *     canvas clicks are deliberately exempt: the pin's own click handler
 *     runs after the mousedown and swaps `activeThreadId` to the clicked
 *     pin's id, so a single click on a different pin "moves" the
 *     popover. Empty-canvas clicks don't close (small limitation —
 *     close button + Esc remain the explicit dismiss paths there).
 *   - Closing the rail (`openRightPanel(null)`) clears `activeThreadId`,
 *     so the popover unmounts via its parent gate.
 */
export function ThreadPopover({ threadId }: Props) {
  const thread = useStore(
    (s) => s.threads.find((t) => t.id === threadId) ?? null
  );
  const sheets = useStore((s) => s.sheets);
  const pan = useStore((s) => s.pan);
  const zoom = useStore((s) => s.zoom);
  const comments = useStore((s) => s.comments);
  const setActiveThread = useStore((s) => s.setActiveThread);
  const resolveThread = useStore((s) => s.resolveThread);
  const deleteThread = useStore((s) => s.deleteThread);

  const popoverRef = useRef<HTMLDivElement>(null);

  // Re-render on viewport resize so the edge-flip + vertical clamp
  // recompute. Cheap to keep in component state since resize events fire
  // at most a few times per second.
  const [viewport, setViewport] = useState({
    w: typeof window === "undefined" ? 1024 : window.innerWidth,
    h: typeof window === "undefined" ? 768 : window.innerHeight,
  });
  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Esc closes — registered globally so the user doesn't need to focus
  // the popover first. The composer's TipTap editor doesn't intercept
  // Esc, so this fires even when the editor has focus.
  //
  // Defers to any higher modal that opted out of the popover's
  // dismiss machinery via `data-comment-popover-keep-open` (e.g.
  // `<LightboxModal />` for image previews). Without this guard, Esc
  // would close both the lightbox and the popover behind it in one
  // keystroke — listeners on window run in registration order during
  // the target phase regardless of capture/bubble, so the parent
  // popover's listener fires first.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (
        document.querySelector(
          '[data-comment-popover-keep-open][role="dialog"]'
        )
      ) {
        return;
      }
      e.preventDefault();
      setActiveThread(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setActiveThread]);

  // Outside-click dismissal. Bail when the click target is:
  //   - inside the popover itself (obvious — the user is interacting),
  //   - the Konva <canvas> (the pin's own click handler will swap
  //     targets to a different thread; closing here would race that),
  //   - inside any portal marked with `data-comment-popover-keep-open`
  //     (the mention dropdown — portaled to <body>, so it's outside the
  //     popover ref but logically belongs to the composer).
  //
  // Registered in CAPTURE phase. Critical: TipTap's mention command runs
  // synchronously inside React's onMouseDown handler and unmounts the
  // dropdown's React tree, which detaches the suggestion button from
  // the keep-open portal container. By the time a bubble-phase window
  // listener runs, `target.closest("[data-…]")` no longer finds the
  // attribute and we'd close the popover. Capture phase fires before
  // React's handlers, so the DOM is still intact when we test.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      if (popoverRef.current?.contains(target as Node)) return;
      if (target.tagName === "CANVAS") return;
      if (target.closest("[data-comment-popover-keep-open]")) return;
      setActiveThread(null);
    }
    window.addEventListener("mousedown", onMouseDown, true);
    return () =>
      window.removeEventListener("mousedown", onMouseDown, true);
  }, [setActiveThread]);

  if (!thread) return null;

  // Sort + partition the thread's comments. Cheap (single pass over a
  // small per-thread slice); no need to memoize.
  const threadComments = comments
    .filter((c) => c.threadId === thread.id)
    .sort((a, b) => a.createdAt - b.createdAt);
  const root = threadComments.find((c) => c.parentId === null) ?? null;
  const replies = threadComments.filter((c) => c.parentId !== null);

  const { sx, sy } = screenAnchorForThread(thread, sheets, { zoom, pan });

  const maxH = Math.min(POPOVER_BASE_MAX_H, viewport.h - 32);

  // Default: anchor to the pin's right side. Flip to the left if that
  // would overflow the viewport. If even the left flip overflows (very
  // narrow window), clamp to the left margin.
  let left = sx + PIN_SCREEN_R + GAP;
  let side: "right" | "left" = "right";
  if (left + POPOVER_W > viewport.w - 16) {
    left = sx - PIN_SCREEN_R - GAP - POPOVER_W;
    side = "left";
  }
  if (left < 16) left = 16;

  let top = sy - 24;
  if (top + maxH > viewport.h - 16) top = viewport.h - 16 - maxH;
  if (top < 16) top = 16;

  const sheet = sheets.find((s) => s.id === thread.canvasId);
  const location =
    thread.canvasId === "board" ? "Board" : sheet?.name ?? "Sheet";
  const resolved = thread.status === "resolved";

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`Comment thread on ${location}`}
      className="fixed z-30 w-[320px] flex flex-col rounded-xl bg-ink-900 border border-ink-700 shadow-[0_18px_60px_rgba(0,0,0,0.6)] overflow-hidden animate-fade-in"
      style={{ left, top, maxHeight: maxH }}
    >
      {/* Triangular tail pointing back at the pin. A 45°-rotated square
          half-tucked behind the popover's near edge — same trick as a
          dropdown arrow. Flipped sides have their inner borders hidden so
          only the two outer edges show, which read as a triangle. */}
      <span
        aria-hidden
        className="absolute top-4 w-2 h-2 bg-ink-900 border border-ink-700 rotate-45"
        style={
          side === "right"
            ? { left: -5, borderRight: "none", borderTop: "none" }
            : { right: -5, borderLeft: "none", borderBottom: "none" }
        }
      />

      {/* Header — location + resolve + delete + close. Resolve and delete
          handlers mirror the (now-removed) FocusedThreadView verbatim so
          existing keyboard/screen-reader behavior carries over. */}
      <div className="h-9 border-b border-ink-800 px-3 flex items-center gap-2 shrink-0">
        <MapPin size={12} className="text-ink-400 shrink-0" />
        <span className="text-[11px] text-ink-300 truncate">{location}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => resolveThread(thread.id, !resolved)}
            className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
              resolved ? "text-emerald-400" : "text-ink-300"
            }`}
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
            className="w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors text-ink-300 hover:text-red-400 hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            title="Delete thread"
            aria-label="Delete thread"
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => setActiveThread(null)}
            className="w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors text-ink-300 hover:text-ink-100 hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            title="Close"
            aria-label="Close thread"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Body — root + replies. min-h-0 is required so this flex-1 child
          can actually shrink inside the parent's max-height; without it
          the inner scroll never engages and the popover just grows. */}
      <div className="flex-1 overflow-y-auto scroll-thin min-h-0">
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

      {/* Composer — keyed on thread.id so the TipTap editor + staged
          attachments remount cleanly when the active thread changes.
          Drafts intentionally evaporate on swap (matches v1 behavior;
          persisted drafts are a clean follow-up). */}
      <RichTextInput
        key={thread.id}
        threadId={thread.id}
        hasRoot={!!root}
      />
    </div>
  );
}
