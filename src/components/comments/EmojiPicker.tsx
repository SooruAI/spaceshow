import { useEffect, useRef } from "react";

const EMOJIS = [
  "\uD83D\uDE42", "\uD83D\uDE00", "\uD83D\uDE09", "\uD83D\uDE02",
  "\uD83D\uDE0D", "\uD83D\uDE0E", "\uD83E\uDD14", "\uD83D\uDE2E",
  "\uD83D\uDC4D", "\uD83D\uDC4F", "\uD83D\uDE4C", "\uD83D\uDC40",
  "\u2764\uFE0F", "\uD83D\uDD25", "\u2728", "\uD83C\uDF89",
  "\u2705", "\u274C", "\u26A0\uFE0F", "\uD83D\uDEA8",
  "\uD83D\uDE80", "\uD83D\uDCA1", "\uD83D\uDCCC", "\uD83D\uDCAC",
];

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/**
 * Small self-rolled emoji palette (24 common icons). Avoids pulling in
 * emoji-mart or similar — that package ships ~400KB and we only need a
 * quick pick. Closes on outside click or Escape.
 */
export function EmojiPicker({ onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-40 bottom-full mb-1 right-0 panel rounded-md shadow-xl p-1.5 grid grid-cols-8 gap-0.5 w-[192px]"
    >
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => {
            onPick(e);
            onClose();
          }}
          className="w-5 h-5 inline-flex items-center justify-center text-sm rounded hover:bg-ink-700"
          aria-label={`Insert ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
