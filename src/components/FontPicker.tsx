import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { FONT_CATEGORIES, TEXT_FONTS, type FontCategory, type TextFont } from "../lib/fonts";

interface FontPickerProps {
  value: string;
  onChange: (next: string) => void;
}

/**
 * Searchable font picker that previews each option in its own face. Sits inside
 * `[data-text-format-bar]` so the surrounding text-edit overlay treats clicks
 * here as in-bar (no overlay dismissal). All buttons preventDefault on
 * mousedown to keep the textarea's caret/selection intact.
 */
export function FontPicker({ value, onChange }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = useMemo(
    () => TEXT_FONTS.find((f) => f.value === value) ?? TEXT_FONTS[0],
    [value]
  );

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

  useEffect(() => {
    if (open) {
      // Defer focus so the click that opened the picker doesn't immediately
      // trigger the outside-click handler.
      const id = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    setQuery("");
  }, [open]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const buckets = new Map<FontCategory, TextFont[]>();
    for (const cat of FONT_CATEGORIES) buckets.set(cat, []);
    for (const f of TEXT_FONTS) {
      if (q && !f.label.toLowerCase().includes(q)) continue;
      buckets.get(f.category)?.push(f);
    }
    return FONT_CATEGORIES.map((cat) => ({
      category: cat,
      fonts: buckets.get(cat) ?? [],
    })).filter((g) => g.fonts.length > 0);
  }, [query]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title="Font family"
        className={`h-7 w-36 px-2 pr-1.5 flex items-center gap-1 rounded-full border text-xs outline-none transition-colors ${
          open
            ? "bg-ink-700 border-brand-500 text-ink-100"
            : "bg-ink-700/80 border-ink-700 text-ink-100 hover:bg-ink-700"
        }`}
      >
        <span
          className="flex-1 truncate text-left"
          style={{ fontFamily: current.value }}
        >
          {current.label}
        </span>
        <ChevronDown size={12} className="opacity-70 shrink-0" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-50 w-72 rounded-lg shadow-2xl ring-1 ring-black/40 overflow-hidden"
          style={{ background: "var(--bg-secondary)" }}
        >
          <div
            className="flex items-center gap-2 px-2.5 py-2 border-b border-ink-700/80"
            style={{ background: "var(--bg-secondary)" }}
          >
            <Search size={13} className="text-ink-400 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  const first = grouped[0]?.fonts[0];
                  if (first) {
                    onChange(first.value);
                    setOpen(false);
                  }
                }
              }}
              placeholder="Search fonts…"
              className="w-full bg-transparent text-xs text-ink-100 placeholder:text-ink-500 outline-none"
            />
          </div>

          <div
            className="max-h-80 overflow-y-auto py-1"
            style={{ scrollbarWidth: "thin" }}
          >
            {grouped.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-ink-400">
                No fonts match "{query}"
              </div>
            ) : (
              grouped.map(({ category, fonts }) => (
                <div key={category}>
                  <div
                    className="sticky top-0 px-3 py-1 text-[10px] uppercase tracking-wider text-ink-400 backdrop-blur-sm"
                    style={{ background: "var(--bg-secondary)" }}
                  >
                    {category}
                  </div>
                  {fonts.map((f) => {
                    const active = f.value === value;
                    return (
                      <button
                        key={f.label}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onChange(f.value);
                          setOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                          active
                            ? "bg-brand-500/20 text-ink-100"
                            : "text-ink-200 hover:bg-ink-700/70"
                        }`}
                        style={{ fontFamily: f.value }}
                        title={f.label}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
