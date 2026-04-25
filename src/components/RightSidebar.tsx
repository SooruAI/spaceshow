import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Star,
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Heart,
  PanelRightClose,
  Plus,
  Trash2,
  Sparkles,
} from "lucide-react";
import { useStore } from "../store";
import {
  insertViewShape,
  viewportCenterInSheet,
  VIEW_DRAG_MIME,
} from "../lib/viewInsert";
import type { ViewItem } from "../types";

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
  const removeView = useStore((s) => s.removeView);
  const openRightPanel = useStore((s) => s.openRightPanel);
  const activeSheetId = useStore((s) => s.activeSheetId);
  const showToast = useStore((s) => s.showToast);

  // Local state for the view item right-click menu. Lives here (not in
  // the global `contextMenu` slice) because that slice is canvas-scoped
  // and toggles different action sets — keeping the views menu local
  // avoids cross-talk and lets it close when the sidebar unmounts.
  const [viewMenu, setViewMenu] = useState<{
    x: number;
    y: number;
    view: ViewItem;
  } | null>(null);

  // Close the view menu on Escape, scroll, or mousedown outside.
  useEffect(() => {
    if (!viewMenu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setViewMenu(null);
    }
    function onDown() {
      setViewMenu(null);
    }
    window.addEventListener("keydown", onKey);
    // Capture phase so a click on a menu item still fires its handler
    // (the item calls setViewMenu(null) itself before this listener can
    // race it). mousedown closes the menu before the click fires which
    // matches the canvas ContextMenu's pattern.
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onDown, true);
    };
  }, [viewMenu]);

  function handleInsert(view: ViewItem) {
    if (!activeSheetId) {
      showToast("No active sheet to insert into.", "error");
      return;
    }
    const center = viewportCenterInSheet(activeSheetId);
    insertViewShape(view, {
      sheetId: activeSheetId,
      x: center.x,
      y: center.y,
      center: center.center,
    });
  }

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
      {/* Collapse lives on the LEFT edge (the side closest to the canvas)
          so the click target sits where the user's cursor is already
          headed when dismissing the panel. The "Views" label is centered
          in the remaining space for visual balance. */}
      <div className="relative px-2 h-9 flex items-center justify-center border-b border-ink-800 text-xs text-ink-300 uppercase tracking-wider">
        <button
          type="button"
          onClick={() => openRightPanel(null)}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-400 hover:text-ink-100 hover:bg-ink-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <PanelRightClose size={14} />
        </button>
        <span>Views</span>
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
              onDragStart={(e) => {
                // Tag the drag with both the custom MIME (so the Canvas
                // drop handler can recognize it) and a plain text fallback
                // for browsers that mishandle custom MIMEs in some edge
                // cases. The Canvas reads from the custom MIME first.
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData(VIEW_DRAG_MIME, v.id);
                e.dataTransfer.setData("text/plain", v.id);
              }}
              onDoubleClick={() => handleInsert(v)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setViewMenu({ x: e.clientX, y: e.clientY, view: v });
              }}
              title="Double-click to insert. Drag onto canvas. Right-click for options."
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${v.thumbnail} opacity-90 pointer-events-none`}
              />
              <div className="absolute inset-0 bg-black/10 pointer-events-none" />
              <div className="absolute bottom-1 left-1.5 text-[10px] text-white drop-shadow pointer-events-none">
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

      {viewMenu && (
        <ViewContextMenu
          x={viewMenu.x}
          y={viewMenu.y}
          onInsert={() => {
            handleInsert(viewMenu.view);
            setViewMenu(null);
          }}
          onDelete={() => {
            removeView(viewMenu.view.id);
            setViewMenu(null);
          }}
          onRender={() => {
            showToast(`Render queued for ${viewMenu.view.name}.`, "info");
            setViewMenu(null);
          }}
        />
      )}
    </div>
  );
}

/** Floating menu for the views grid right-click. Renders at viewport
 *  coords (`position: fixed`) so it can escape the sidebar's clipping
 *  scroll container, and flips against the right/bottom edges. */
function ViewContextMenu({
  x,
  y,
  onInsert,
  onDelete,
  onRender,
}: {
  x: number;
  y: number;
  onInsert: () => void;
  onDelete: () => void;
  onRender: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;
    let nx = x;
    let ny = y;
    if (nx + rect.width + pad > vw) nx = vw - rect.width - pad;
    if (ny + rect.height + pad > vh) ny = vh - rect.height - pad;
    setPos({ x: Math.max(pad, nx), y: Math.max(pad, ny) });
  }, [x, y]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: "fixed",
        left: pos?.x ?? x,
        top: pos?.y ?? y,
        visibility: pos ? "visible" : "hidden",
      }}
      className="z-50 min-w-[140px] panel rounded-md shadow-xl py-1"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuRow icon={<Plus size={13} />} label="Insert" onClick={onInsert} />
      <MenuRow
        icon={<Sparkles size={13} />}
        label="Render"
        onClick={onRender}
      />
      <MenuRow
        icon={<Trash2 size={13} />}
        label="Delete"
        onClick={onDelete}
        danger
      />
    </div>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
        danger
          ? "text-rose-300 hover:bg-rose-500/15"
          : "text-ink-100 hover:bg-ink-700"
      }`}
    >
      <span className="w-4 inline-flex items-center justify-center text-ink-300">
        {icon}
      </span>
      {label}
    </button>
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
