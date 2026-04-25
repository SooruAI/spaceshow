/**
 * RoutingDropdown — ARIA-listbox picker for the four line routings
 * (Straight / Arc / Elbow Joint / Curved). Modeled on `MarkerDropdown`.
 *
 * Why a custom listbox (vs. a native <select>): each option shows an
 * SVG glyph alongside its label so you can preview the routing before
 * committing. Native <select> can't render arbitrary HTML inside its
 * options.
 *
 * Icons + labels come from `routingIcons.tsx`, the same module the
 * left-sidebar LineToolButton reads from — one source of truth for
 * both surfaces.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LineRouting } from "../../types";
import { LINE_ROUTING_META } from "./routingIcons";

interface Props {
  value: LineRouting;
  onChange: (next: LineRouting) => void;
  ariaLabel: string;
}

export function RoutingDropdown({ value, onChange, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    Math.max(0, LINE_ROUTING_META.findIndex((r) => r.id === value)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const current = useMemo(
    () => LINE_ROUTING_META.find((r) => r.id === value) ?? LINE_ROUTING_META[0],
    [value],
  );

  // Keep the keyboard cursor in sync with the selected value whenever it
  // changes externally (e.g. tool default picked from the left flyout).
  useEffect(() => {
    const i = LINE_ROUTING_META.findIndex((r) => r.id === value);
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
        setActiveIndex((i) => Math.min(LINE_ROUTING_META.length - 1, i + 1));
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
        setActiveIndex(LINE_ROUTING_META.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onChange(LINE_ROUTING_META[activeIndex].id);
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
        aria-label={`${ariaLabel} — ${current.label}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleTriggerKey}
        className="flex items-center gap-1.5 h-7 pl-1.5 pr-1 rounded border border-edge bg-ink-800/60 hover:bg-ink-700 text-ink-200 transition-colors"
      >
        <span className="inline-flex text-ink-100">{current.icon}</span>
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
          {LINE_ROUTING_META.map((r, i) => {
            const selected = r.id === value;
            const active = i === activeIndex;
            return (
              <li
                key={r.id}
                data-idx={i}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  onChange(r.id);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`flex items-center gap-2 px-2 h-7 cursor-pointer text-xs ${
                  active ? "bg-ink-700" : ""
                } ${selected ? "text-ink-100" : "text-ink-200"}`}
              >
                <span className="inline-flex">{r.icon}</span>
                <span className="flex-1">{r.label}</span>
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
