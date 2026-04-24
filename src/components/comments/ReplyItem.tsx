import { CommentCard } from "./CommentCard";
import type { Comment } from "../../types";

/**
 * Chronological reply inside a thread. Flat (no nesting) in v1 — the
 * plan notes that deep threads don't fit the review/feedback loop.
 */
export function ReplyItem({ comment }: { comment: Comment }) {
  return <CommentCard comment={comment} compact />;
}
