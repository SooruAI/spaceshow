/**
 * Accessible segmented control — radiogroup with roving tabIndex and
 * Left/Right/Home/End keyboard navigation. Used for Routing and Pattern.
 */

import { useRef } from "react";

interface SegmentedOption<V extends string> {
  value: V;
  label: string;
}

interface Props<V extends string> {
  options: ReadonlyArray<SegmentedOption<V>>;
  value: V;
  onChange: (next: V) => void;
  ariaLabel: string;
}

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: Props<V>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function focusIndex(i: number) {
    const next = ((i % options.length) + options.length) % options.length;
    refs.current[next]?.focus();
    onChange(options[next].value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusIndex(i + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusIndex(i - 1);
        break;
      case "Home":
        e.preventDefault();
        focusIndex(0);
        break;
      case "End":
        e.preventDefault();
        focusIndex(options.length - 1);
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-ink-800/60 ring-1 ring-ink-700"
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="radio"
            aria-checked={selected}
            tabIndex={i === activeIndex ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`h-6 px-2 text-[11px] rounded transition-colors ${
              selected
                ? "bg-brand-500 text-white shadow"
                : "text-ink-200 hover:bg-ink-700"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
