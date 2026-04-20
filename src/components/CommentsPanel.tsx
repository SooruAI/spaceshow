import { useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { useStore } from "../store";

export function CommentsPanel() {
  const comments = useStore((s) => s.comments);
  const addComment = useStore((s) => s.addComment);
  const setShowComments = useStore((s) => s.setShowComments);
  const [text, setText] = useState("");

  return (
    <div className="absolute right-3 top-24 z-30 w-72 panel rounded-xl shadow-2xl flex flex-col max-h-[70vh]">
      <div className="px-3 h-9 flex items-center justify-between border-b border-ink-700">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <MessageSquare size={14} /> Comments
        </div>
        <button
          className="icon-btn"
          onClick={() => setShowComments(false)}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin p-3 space-y-2">
        {comments.map((c) => (
          <div key={c.id} className="surface-2 p-2 rounded text-xs">
            <div className="text-ink-200">{c.text}</div>
            <div className="text-[10px] text-ink-400 mt-1">
              {new Date(c.ts).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-ink-700 flex gap-1">
        <input
          className="flex-1 h-8 px-2 rounded bg-ink-800 border border-ink-700 text-sm text-white outline-none focus:border-brand-500"
          placeholder="Write a comment…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              addComment(text.trim());
              setText("");
            }
          }}
        />
        <button
          className="icon-btn bg-brand-600 hover:bg-brand-500 text-white"
          onClick={() => {
            if (text.trim()) {
              addComment(text.trim());
              setText("");
            }
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
