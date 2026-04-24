import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  TEXT_TYPE_PRESETS,
  getTextTypePreset,
  type TextType,
  type TextTypePreset,
} from "../lib/textTypes";

interface Props {
  current: TextType | null;
  onPick: (preset: TextTypePreset) => void;
}

/**
 * Trigger + dropdown that swaps the current text shape (or tool defaults)
 * between Heading 1–6 and Body presets. Lives inside `[data-text-format-bar]`
 * so the surrounding text-edit overlay treats clicks here as in-bar.
 */
export function TextTypePicker({ current, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMd(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMd);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMd);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerLabel = current ? getTextTypePreset(current).shortLabel : "Custom";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title="Text type"
        className={`h-7 w-20 px-2 pr-1.5 flex items-center gap-1 rounded-full border text-xs outline-none transition-colors ${
          open
            ? "bg-ink-700 border-brand-500 text-ink-100"
            : "bg-ink-700/80 border-ink-700 text-ink-100 hover:bg-ink-700"
        }`}
      >
        <span className="flex-1 truncate text-left">{triggerLabel}</span>
        <ChevronDown size={12} className="opacity-70 shrink-0" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-50 rounded-md shadow-2xl py-1.5 px-1 w-52 ring-1 ring-black/40"
          style={{ background: "var(--bg-secondary)" }}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-400 px-2 pb-1">
            Text type
          </div>
          {TEXT_TYPE_PRESETS.map((p) => {
            const active = current === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(p);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded transition-colors ${
                  active ? "bg-brand-500/20 text-ink-100" : "text-ink-200 hover:bg-ink-700/70"
                }`}
              >
                <span
                  className="flex-1 text-left truncate"
                  style={{
                    fontSize: Math.min(p.fontSize, 22),
                    fontWeight: p.bold ? 700 : 400,
                    lineHeight: 1.1,
                  }}
                >
                  {p.label}
                </span>
                <span className="text-[10px] tabular-nums opacity-60 shrink-0">
                  {p.fontSize}px
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
