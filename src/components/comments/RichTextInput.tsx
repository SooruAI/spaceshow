import {
  EditorContent,
  ReactRenderer,
  useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor } from "@tiptap/react";
import {
  AtSign,
  Bold,
  Italic,
  List,
  ListOrdered,
  Paperclip,
  Quote,
  Send,
  Smile,
  Strikethrough,
  Underline as UnderlineIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import type { Attachment, TipTapDoc, User } from "../../types";
import { EmojiPicker } from "./EmojiPicker";
import {
  MentionDropdown,
  type MentionDropdownHandle,
} from "./MentionDropdown";
import { AttachmentChip } from "./AttachmentChip";

const MAX_BYTES = 2 * 1024 * 1024;

type StagedAttachment = Pick<Attachment, "fileUrl" | "fileType" | "fileName">;

interface Props {
  threadId: string;
  hasRoot: boolean;
}

/**
 * Rich-text composer. Emits a new Comment via `addReply` — the store treats
 * `parentId: null` as the root. Format bar, mention suggestion, emoji
 * picker, and staged attachments all feed into the same editor state.
 * Staged attachments are promoted to real store attachments only on
 * submit, so unsent files don't bloat the document history.
 */
export function RichTextInput({ threadId, hasRoot }: Props) {
  const addReply = useStore((s) => s.addReply);
  const addAttachment = useStore((s) => s.addAttachment);
  const users = useStore((s) => s.users);
  const pendingFocusThreadId = useStore((s) => s.pendingFocusThreadId);
  const clearPendingFocus = useStore((s) => s.clearPendingFocus);

  const fileRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<StagedAttachment[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);

  const usersRef = useRef(users);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({
        placeholder: hasRoot ? "Reply\u2026" : "Add a comment\u2026",
      }),
      Mention.configure({
        HTMLAttributes: { class: "mention-chip" },
        // The closure is invoked only when the user types `@`, never during
        // render, so reading `usersRef.current` here is safe — the lint rule
        // is conservative about refs crossing function boundaries.
        // eslint-disable-next-line react-hooks/refs
        suggestion: buildMentionSuggestion(() => usersRef.current),
      }),
    ],
    editorProps: {
      attributes: { class: "tiptap-compose focus:outline-none" },
    },
  });

  // Toolbar state: subscribe to editor events imperatively and only update
  // state when a field actually changed. Using useEditorState here loops in
  // v3 because the object selector returns a fresh reference each call,
  // which fails useSyncExternalStore's cached-snapshot check.
  const [marks, setMarks] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    bulletList: false,
    orderedList: false,
    blockquote: false,
    empty: true,
  });
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const next = {
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        underline: editor.isActive("underline"),
        strike: editor.isActive("strike"),
        bulletList: editor.isActive("bulletList"),
        orderedList: editor.isActive("orderedList"),
        blockquote: editor.isActive("blockquote"),
        empty: editor.isEmpty,
      };
      setMarks((prev) => {
        for (const k of Object.keys(next) as (keyof typeof next)[]) {
          if (prev[k] !== next[k]) return next;
        }
        return prev;
      });
    };
    update();
    editor.on("transaction", update);
    editor.on("selectionUpdate", update);
    return () => {
      editor.off("transaction", update);
      editor.off("selectionUpdate", update);
    };
  }, [editor]);

  // Auto-focus when the user just dropped a pin.
  useEffect(() => {
    if (!editor) return;
    if (pendingFocusThreadId !== threadId) return;
    editor.commands.focus("end");
    clearPendingFocus();
  }, [pendingFocusThreadId, threadId, editor, clearPendingFocus]);

  function onSubmit() {
    if (!editor) return;
    const empty = editor.isEmpty;
    if (empty && staged.length === 0) return;

    const doc = editor.getJSON() as TipTapDoc;
    const commentId = addReply({
      threadId,
      parentId: hasRoot ? threadId : null,
      content: doc,
    });
    for (const a of staged) {
      addAttachment({ commentId, ...a });
    }
    editor.commands.clearContent();
    setStaged([]);
  }

  function onFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        alert(`${file.name} is larger than 2MB. Trim it and try again.`);
        continue;
      }
      const kind: Attachment["fileType"] = file.type.startsWith("image/")
        ? "image"
        : "pdf";
      const reader = new FileReader();
      reader.onload = () => {
        const fileUrl = reader.result as string;
        setStaged((prev) => [
          ...prev,
          { fileUrl, fileType: kind, fileName: file.name },
        ]);
      };
      reader.readAsDataURL(file);
    }
  }

  return (
    <div className="border-t border-ink-800 p-2 flex flex-col gap-1.5 relative">
      {/* Format toolbar */}
      <div className="flex items-center gap-0.5 text-ink-300">
        <FmtBtn
          active={marks.bold}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold size={13} />
        </FmtBtn>
        <FmtBtn
          active={marks.italic}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic size={13} />
        </FmtBtn>
        <FmtBtn
          active={marks.underline}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <UnderlineIcon size={13} />
        </FmtBtn>
        <FmtBtn
          active={marks.strike}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough size={13} />
        </FmtBtn>
        <span className="w-px h-4 bg-ink-700 mx-0.5" aria-hidden />
        <FmtBtn
          active={marks.bulletList}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          title="Bulleted list"
        >
          <List size={13} />
        </FmtBtn>
        <FmtBtn
          active={marks.orderedList}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          <ListOrdered size={13} />
        </FmtBtn>
        <FmtBtn
          active={marks.blockquote}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
        >
          <Quote size={13} />
        </FmtBtn>
        <span className="w-px h-4 bg-ink-700 mx-0.5" aria-hidden />
        <FmtBtn
          onClick={() =>
            editor?.chain().focus().insertContent("@").run()
          }
          title="Mention"
        >
          <AtSign size={13} />
        </FmtBtn>
        <FmtBtn
          onClick={() => setShowEmoji((v) => !v)}
          title="Emoji"
          active={showEmoji}
        >
          <Smile size={13} />
        </FmtBtn>
        <FmtBtn
          onClick={() => fileRef.current?.click()}
          title="Attach file"
        >
          <Paperclip size={13} />
        </FmtBtn>
        <button
          type="button"
          className="ml-auto h-6 px-2 rounded-md bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={onSubmit}
          disabled={marks.empty && staged.length === 0}
        >
          <Send size={11} /> Send
        </button>
      </div>

      {/* Editor */}
      <div
        className="rounded-md bg-ink-800 border border-ink-700 focus-within:border-brand-500/60 px-2 py-1.5 min-h-[48px] cursor-text"
        onClick={() => editor?.commands.focus()}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Staged attachments */}
      {staged.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {staged.map((s, i) => (
            <AttachmentChip
              key={`${s.fileName}-${i}`}
              attachment={s}
              onRemove={() =>
                setStaged((prev) => prev.filter((_, idx) => idx !== i))
              }
            />
          ))}
        </div>
      )}

      {showEmoji && editor && (
        <EmojiPicker
          onPick={(e) => editor.chain().focus().insertContent(e).run()}
          onClose={() => setShowEmoji(false)}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={onFilesChosen}
      />
    </div>
  );
}

function FmtBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`w-6 h-6 inline-flex items-center justify-center rounded transition-colors ${
        active
          ? "bg-brand-600 text-white"
          : "hover:bg-ink-700 text-ink-300"
      }`}
    >
      {children}
    </button>
  );
}

type MentionClientRect = {
  getBoundingClientRect: () => DOMRect;
  getClientRects?: () => DOMRectList;
};

/**
 * Wires the TipTap Mention suggestion to our React MentionDropdown. The
 * user-list closure pulls from the live store via getUsers() so suggestions
 * reflect current state without tearing down the editor.
 */
function buildMentionSuggestion(getUsers: () => User[]) {
  return {
    items: ({ query }: { query: string }) => {
      const q = query.toLowerCase();
      return getUsers()
        .filter((u) => u.name.toLowerCase().includes(q))
        .slice(0, 6);
    },
    render: () => {
      let renderer: ReactRenderer<MentionDropdownHandle> | null = null;
      let container: HTMLDivElement | null = null;

      function positionAt(rect: DOMRect | null | undefined) {
        if (!container || !rect) return;
        container.style.top = `${rect.bottom + 4}px`;
        container.style.left = `${rect.left}px`;
      }

      return {
        onStart: (props: {
          editor: Editor;
          clientRect?: (() => DOMRect | null) | null;
          items: User[];
          command: (attrs: { id: string; label: string }) => void;
        }) => {
          renderer = new ReactRenderer(MentionDropdown, {
            props: { items: props.items, command: props.command },
            editor: props.editor,
          });
          container = document.createElement("div");
          container.style.position = "absolute";
          container.style.zIndex = "60";
          // Marker for `<ThreadPopover />`'s outside-click dismiss handler:
          // the dropdown is portaled to <body>, so it's outside the popover
          // DOM ref. Without this signal a click on a suggestion would
          // close the popover before TipTap commits the mention.
          container.setAttribute("data-comment-popover-keep-open", "");
          container.appendChild(renderer.element);
          document.body.appendChild(container);
          positionAt(props.clientRect?.());
        },
        onUpdate(props: {
          clientRect?: (() => DOMRect | null) | null;
          items: User[];
          command: (attrs: { id: string; label: string }) => void;
        }) {
          renderer?.updateProps({
            items: props.items,
            command: props.command,
          });
          positionAt(props.clientRect?.());
        },
        onKeyDown(props: { event: KeyboardEvent }) {
          if (props.event.key === "Escape") {
            return true;
          }
          return renderer?.ref?.onKeyDown(props.event) ?? false;
        },
        onExit() {
          renderer?.destroy();
          if (container && container.parentNode) {
            container.parentNode.removeChild(container);
          }
          renderer = null;
          container = null;
        },
      };
    },
  };
}

// Keep the clientRect type name in the file so tsc doesn't flag it as unused
// when the suggestion surface evolves.
export type _MentionClientRect = MentionClientRect;
