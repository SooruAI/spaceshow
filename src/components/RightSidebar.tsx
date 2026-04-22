import { useEffect, useRef } from "react";
import {
  ChevronDown,
  Star,
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Heart,
  Settings,
} from "lucide-react";
import { useStore } from "../store";

export function RightSidebar() {
  const iterations = useStore((s) => s.iterations);
  const activeIterationId = useStore((s) => s.activeIterationId);
  const setActiveIteration = useStore((s) => s.setActiveIteration);
  const showDropdown = useStore((s) => s.showIterationDropdown);
  const setShowDropdown = useStore((s) => s.setShowIterationDropdown);

  const views = useStore((s) => s.views);
  const filter = useStore((s) => s.viewFilter);
  const setFilter = useStore((s) => s.setViewFilter);
  const sort = useStore((s) => s.viewSort);
  const setSort = useStore((s) => s.setViewSort);
  const toggleFav = useStore((s) => s.toggleViewFavorite);

  const dropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showDropdown, setShowDropdown]);

  const filtered = views
    .filter((v) => v.iterationId === activeIterationId)
    .filter((v) => {
      if (filter === "favorites") return v.favorite;
      if (filter === "hidden") return v.hidden;
      if (filter === "unhidden") return !v.hidden;
      return true;
    })
    .sort((a, b) =>
      sort === "asc" ? a.addedAt - b.addedAt : b.addedAt - a.addedAt
    );

  const activeIter = iterations.find((i) => i.id === activeIterationId);

  return (
    <div className="w-72 bg-ink-900 border-l border-ink-700 flex flex-col">
      <div className="px-3 h-9 flex items-center justify-between border-b border-ink-800 text-xs text-ink-300 uppercase tracking-wider">
        <span>Views</span>
        <button className="icon-btn" title="Canvas settings">
          <Settings size={14} />
        </button>
      </div>

      {/* Iteration selector */}
      <div className="px-3 py-2 border-b border-ink-800 relative" ref={dropRef}>
        <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">
          From iteration
        </div>
        <button
          className="w-full h-8 px-2.5 rounded-md bg-ink-800 hover:bg-ink-700 flex items-center justify-between text-sm text-white"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <span>{activeIter?.name ?? "Select"}</span>
          <ChevronDown size={14} className="text-ink-300" />
        </button>
        {showDropdown && (
          <div className="absolute z-30 left-3 right-3 mt-1 panel rounded-md shadow-xl py-1 max-h-60 overflow-y-auto">
            {iterations.map((it) => (
              <button
                key={it.id}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between ${
                  it.id === activeIterationId
                    ? "row-selected"
                    : "text-ink-100 hover:bg-ink-700"
                }`}
                onClick={() => setActiveIteration(it.id)}
              >
                {it.name}
                {it.id === activeIterationId && (
                  <span className="text-brand-500 text-xs">●</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-1 text-xs">
        <FilterTab
          label="Unhidden"
          icon={<Eye size={12} />}
          active={filter === "unhidden"}
          onClick={() => setFilter("unhidden")}
        />
        <FilterTab
          label="All"
          icon={<Eye size={12} />}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterTab
          label="Favorites"
          icon={<Heart size={12} />}
          active={filter === "favorites"}
          onClick={() => setFilter("favorites")}
        />
        <FilterTab
          label="Hidden"
          icon={<EyeOff size={12} />}
          active={filter === "hidden"}
          onClick={() => setFilter("hidden")}
        />
      </div>

      {/* Sort */}
      <div className="px-3 py-2 flex items-center gap-2 text-xs text-ink-300">
        <ArrowDownUp size={12} /> Sort by date added
        <button
          className="icon-btn ml-auto"
          title={sort === "asc" ? "Ascending" : "Descending"}
          onClick={() => setSort(sort === "asc" ? "desc" : "asc")}
        >
          {sort === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        </button>
      </div>

      {/* Views grid */}
      <div className="flex-1 overflow-y-auto scroll-thin px-3 pb-3">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((v) => (
            <div
              key={v.id}
              className="group relative aspect-[4/3] rounded-md overflow-hidden bg-ink-800 border border-ink-700 cursor-pointer hover:border-brand-500"
              draggable
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${v.thumbnail} opacity-90`}
              />
              <div className="absolute inset-0 bg-black/10" />
              <div className="absolute bottom-1 left-1.5 text-[10px] text-white drop-shadow">
                {v.name}
              </div>
              <button
                className={`absolute top-1 right-1 ${
                  v.favorite ? "text-amber-400" : "text-white/70"
                } opacity-0 group-hover:opacity-100 ${
                  v.favorite ? "opacity-100" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFav(v.id);
                }}
                title={v.favorite ? "Unfavorite" : "Favorite"}
              >
                <Star
                  size={14}
                  fill={v.favorite ? "#f59e0b" : "none"}
                />
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-2 text-center text-xs text-ink-400 py-6">
              No views match this filter.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function FilterTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded ${
        active
          ? "bg-brand-600 text-white"
          : "text-ink-300 hover:bg-ink-800 hover:text-white"
      }`}
    >
      {icon} {label}
    </button>
  );
}
