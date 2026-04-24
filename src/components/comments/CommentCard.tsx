import { EditorContent, useEditor } from "@tiptap/react";
import type { Content } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Mention from "@tiptap/extension-mention";
import { useEffect, useMemo } from "react";
import { useStore } from "../../store";
import { AttachmentChip } from "./AttachmentChip";
import type { Comment } from "../../types";

interface Props {
  comment: Comment;
  showAuthor?: boolean;
  compact?: boolean;
}

/**
 * Read-only render of a stored comment using the same TipTap extensions
 * as the composer so formatting (bold/italic/lists/mentions) round-trips
 * without HTML conversion. Attachments are listed below the body.
 */
export function CommentCard({ comment, showAuthor = true, compact = false }: Props) {
  // Select raw slices and derive locally so each selector returns a stable
  // reference — filtering inside the selector produces a fresh array every
  // render which trips useSyncExternalStore's cached-snapshot check.
  const users = useStore((s) => s.users);
  const allAttachments = useStore((s) => s.attachments);
  const attachments = useMemo(
    () => allAttachments.filter((a) => a.commentId === comment.id),
    [allAttachments, comment.id]
  );
  const author = users.find((u) => u.id === comment.authorId);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Mention.configure({
        HTMLAttributes: { class: "mention-chip" },
      }),
    ],
    content: comment.content as unknown as Content,
    editable: false,
    editorProps: {
      attributes: {
        class: "tiptap-render focus:outline-none",
      },
    },
  });

  // Sync content whenever the *comment id* changes (e.g. pager navigates to a
  // new thread). Per-id, content is immutable in v1 — no need to watch it.
  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(comment.content as unknown as Content, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment.id, editor]);

  return (
    <div className={`px-3 ${compact ? "py-2" : "py-3"} border-b border-ink-800`}>
      {showAuthor && (
        <div className="flex items-center gap-2 mb-1">
          <span
            className="w-5 h-5 rounded-full text-[9px] font-semibold text-white inline-flex items-center justify-center"
            style={{ background: author?.color ?? "#475569" }}
          >
            {initials(author?.name)}
          </span>
          <span className="text-[12px] font-semibold text-ink-100">
            {author?.name ?? "Unknown"}
          </span>
          <span className="text-[10px] text-ink-500 ml-auto">
            {formatRelative(comment.createdAt)}
          </span>
        </div>
      )}
      <EditorContent editor={editor} />
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <AttachmentChip key={a.id} attachment={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
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
