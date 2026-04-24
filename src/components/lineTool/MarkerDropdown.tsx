/**
 * Marker-end dropdown — custom listbox so each option can render an SVG
 * preview. Native `<select>` can't do that. Follows the WAI-ARIA Authoring
 * Practices listbox pattern.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LineMarkerKind } from "../../types";
import { LINE_MARKER_KINDS } from "../../types";
import { MarkerPreview } from "./markers";

interface Props {
  value: LineMarkerKind;
  onChange: (next: LineMarkerKind) => void;
  direction: "start" | "end";
  ariaLabel: string;
}

export function MarkerDropdown({ value, onChange, direction, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    Math.max(0, LINE_MARKER_KINDS.findIndex((m) => m.value === value)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const currentLabel = useMemo(
    () =>
      LINE_MARKER_KINDS.find((m) => m.value === value)?.label ??
      LINE_MARKER_KINDS[0].label,
    [value],
  );

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const opt = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${activeIndex}"]`,
    );
    opt?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function handleTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function handleListKey(e: React.KeyboardEvent<HTMLUListElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(LINE_MARKER_KINDS.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(LINE_MARKER_KINDS.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onChange(LINE_MARKER_KINDS[activeIndex].value);
        setOpen(false);
        triggerRef.current?.focus();
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${ariaLabel} — ${currentLabel}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleTriggerKey}
        className="flex items-center gap-1.5 h-7 pl-1.5 pr-1 rounded border border-edge bg-ink-800/60 hover:bg-ink-700 text-ink-200 transition-colors"
      >
        <MarkerPreview kind={value} direction={direction} size={12} />
        <ChevronDown size={12} className="text-ink-300" />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={handleListKey}
          autoFocus
          className="absolute left-0 top-full mt-1 z-50 panel rounded-lg shadow-pop py-1 min-w-[180px] max-h-64 overflow-auto focus:outline-none"
        >
          {LINE_MARKER_KINDS.map((m, i) => {
            const selected = m.value === value;
            const active = i === activeIndex;
            return (
              <li
                key={m.value}
                data-idx={i}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  onChange(m.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`flex items-center gap-2 px-2 h-7 cursor-pointer text-xs ${
                  active ? "bg-ink-700" : ""
                } ${selected ? "text-ink-100" : "text-ink-200"}`}
              >
                <MarkerPreview kind={m.value} direction={direction} size={12} />
                <span className="flex-1">{m.label}</span>
                {selected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
