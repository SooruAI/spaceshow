import { useMemo, useState } from "react";
import { EyeOff } from "lucide-react";
import { useStore } from "../../store";
import type { SlideFilter } from "./shareTypes";

interface Props {
  selectedSheetIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectIds: (ids: string[]) => void;
  onDeselectIds: (ids: string[]) => void;
}

const FILTERS: { id: SlideFilter; label: string }[] = [
  { id: "unhidden", label: "Unhidden" },
  { id: "all", label: "All" },
  { id: "hidden", label: "Hidden" },
];

export function SlideSelector({ selectedSheetIds, onToggle, onSelectIds, onDeselectIds }: Props) {
  const sheets = useStore((s) => s.sheets);
  const [filter, setFilter] = useState<SlideFilter>("unhidden");

  // Number against the canonical sheet order so "Slide N" matches the
  // sidebar — filtering must not renumber.
  const indexed = useMemo(() => sheets.map((s, i) => ({ sheet: s, index: i })), [sheets]);
  const visible = useMemo(() => {
    if (filter === "all") return indexed;
    if (filter === "hidden") return indexed.filter((x) => x.sheet.hidden);
    return indexed.filter((x) => !x.sheet.hidden);
  }, [indexed, filter]);

  const visibleSelectedCount = visible.filter((x) => selectedSheetIds.has(x.sheet.id)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelectedCount === visible.length;
  const visibleIds = visible.map((x) => x.sheet.id);

  const emptyLabel =
    filter === "hidden"
      ? "No hidden slides."
      : filter === "unhidden"
        ? "No unhidden slides."
        : "No slides yet.";

  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`h-6 px-2 rounded text-[11px] font-semibold transition-colors ${
              filter === f.id
                ? "bg-brand-600 text-white"
                : "bg-ink-700 text-ink-300 hover:bg-ink-600"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-ink-400 tabular-nums" title="Selected in current filter">
          {visibleSelectedCount}/{visible.length}
        </span>
      </div>
      <div className="flex items-center justify-between px-0.5 mb-1">
        <span className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold">
          Slides
        </span>
        <button
          type="button"
          onClick={() => (allVisibleSelected ? onDeselectIds(visibleIds) : onSelectIds(visibleIds))}
          disabled={visible.length === 0}
          className="text-[11px] text-brand-500 hover:text-brand-600 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {allVisibleSelected ? "Clear" : "Select all"}
        </button>
      </div>
      <div className="flex flex-col max-h-[180px] overflow-y-auto scroll-thin border border-edge-subtle rounded-md">
        {visible.map(({ sheet, index }) => {
          const checked = selectedSheetIds.has(sheet.id);
          return (
            <label
              key={sheet.id}
              className={`flex items-center gap-2 px-2.5 py-1.5 text-[12px] cursor-pointer hover:bg-ink-700/60 transition-colors ${checked ? "bg-ink-700/40" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(sheet.id)}
                className="accent-brand-600"
              />
              <span className="text-ink-300 tabular-nums w-12 shrink-0">Slide {index + 1}</span>
              <span className="text-ink-100 truncate flex-1">{sheet.name}</span>
              {sheet.hidden && (
                <EyeOff size={12} className="text-ink-400 shrink-0" aria-label="Hidden" />
              )}
            </label>
          );
        })}
        {visible.length === 0 && (
          <div className="px-2.5 py-3 text-[12px] text-ink-400 italic">{emptyLabel}</div>
        )}
      </div>
    </div>
  );
}
