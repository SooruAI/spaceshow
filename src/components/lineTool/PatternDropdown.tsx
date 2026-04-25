/**
 * PatternDropdown — ARIA-listbox picker for Solid / Dashed / Dotted.
 *
 * Shares its interaction model and visual shell with `RoutingDropdown`
 * and `MarkerDropdown` so the three pickers sitting side by side in
 * the LineToolMenu read as one consistent control family.
 *
 * The glyph shown in the trigger + each list row is a tiny horizontal
 * line rendered with the corresponding SVG `stroke-dasharray`, so the
 * preview *is* the actual stroke pattern the user is picking.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LinePattern } from "../../types";
import { LINE_PATTERNS } from "../../types";

interface Props {
  value: LinePattern;
  onChange: (next: LinePattern) => void;
  ariaLabel: string;
}

// Matches the stroke-dasharray conventions used by LineShape.tsx /
// PresenterShape.tsx so the preview corresponds to what the user will see
// on canvas. Kept local because these are purely visual aids for the
// dropdown — the runtime renderer owns its own arrays.
const PATTERN_DASH: Record<LinePattern, string | undefined> = {
  solid: undefined,
  dashed: "6 4",
  dotted: "2 3",
};

function PatternPreview({
  pattern,
  width = 24,
}: {
  pattern: LinePattern;
  width?: number;
}) {
  return (
    <svg
      width={width}
      height={8}
      viewBox={`0 0 ${width} 8`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap={pattern === "dotted" ? "round" : "butt"}
      aria-hidden="true"
    >
      <line
        x1={1}
        y1={4}
        x2={width - 1}
        y2={4}
        strokeDasharray={PATTERN_DASH[pattern]}
      />
    </svg>
  );
}

export function PatternDropdown({ value, onChange, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    Math.max(0, LINE_PATTERNS.findIndex((p) => p.value === value)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const currentLabel = useMemo(
    () => LINE_PATTERNS.find((p) => p.value === value)?.label ?? LINE_PATTERNS[0].label,
    [value],
  );

  useEffect(() => {
    const i = LINE_PATTERNS.findIndex((p) => p.value === value);
    if (i >= 0) setActiveIndex(i);
  }, [value]);

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
        setActiveIndex((i) => Math.min(LINE_PATTERNS.length - 1, i + 1));
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
        setActiveIndex(LINE_PATTERNS.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onChange(LINE_PATTERNS[activeIndex].value);
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
        <span className="inline-flex text-ink-100">
          <PatternPreview pattern={value} />
        </span>
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
          className="absolute left-0 top-full mt-1 z-50 panel rounded-lg shadow-pop py-1 min-w-[160px] max-h-64 overflow-auto focus:outline-none"
        >
          {LINE_PATTERNS.map((p, i) => {
            const selected = p.value === value;
            const active = i === activeIndex;
            return (
              <li
                key={p.value}
                data-idx={i}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  onChange(p.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`flex items-center gap-2 px-2 h-7 cursor-pointer text-xs ${
                  active ? "bg-ink-700" : ""
                } ${selected ? "text-ink-100" : "text-ink-200"}`}
              >
                <span className="inline-flex">
                  <PatternPreview pattern={p.value} />
                </span>
                <span className="flex-1">{p.label}</span>
                {selected && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-brand-500"
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
