import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Undo2,
  Redo2,
  MessageSquare,
  Play,
  Share2,
  Plus,
  Copy,
  FileUp,
  FileDown,
  Eye,
  Pencil,
  Ruler,
  Sun,
  Moon,
} from "lucide-react";
import { useStore } from "../store";
import { applyTheme, getStoredTheme, type ThemeMode } from "../theme";

const MODULES = [
  { id: "story", label: "SpaceStory" },
  { id: "sheets", label: "SpaceSheet" },
  { id: "design", label: "SpaceDesign" },
  { id: "module", label: "SpaceModule" },
  { id: "show", label: "SpaceShow" },
] as const;

export function TopBar() {
  const showHamburger = useStore((s) => s.showHamburger);
  const setShowHamburger = useStore((s) => s.setShowHamburger);
  const boards = useStore((s) => s.boards);
  const activeBoardId = useStore((s) => s.activeBoardId);
  const setActiveBoard = useStore((s) => s.setActiveBoard);
  const addBoard = useStore((s) => s.addBoard);
  const duplicateBoard = useStore((s) => s.duplicateBoard);
  const showComments = useStore((s) => s.showComments);
  const setShowComments = useStore((s) => s.setShowComments);
  const setPresenting = useStore((s) => s.setPresenting);
  const projectName = useStore((s) => s.projectName);
  const setProjectName = useStore((s) => s.setProjectName);

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) {
      setDraftName(projectName);
      // focus + select on next tick
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editingName, projectName]);

  function commitName() {
    const next = draftName.trim();
    if (next.length > 0) setProjectName(next);
    setEditingName(false);
  }
  function cancelEdit() {
    setDraftName(projectName);
    setEditingName(false);
  }

  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowHamburger(false);
      }
    }
    if (showHamburger) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showHamburger, setShowHamburger]);

  const activeBoard = boards.find((b) => b.id === activeBoardId);

  return (
    <div className="flex flex-col border-b border-ink-700 bg-ink-900">
      {/* Row 1: brand + modules + present/share */}
      <div className="h-12 flex items-center px-3 gap-2">
        <div className="relative flex items-center gap-1" ref={menuRef}>
          <button
            type="button"
            className="flex items-center gap-2 px-2 h-9 rounded-md hover:bg-ink-700 transition-colors"
            onClick={() => setShowHamburger(!showHamburger)}
            title="Open menu"
          >
            <img
              src="/logo.svg"
              alt="SpaceSync"
              width={26}
              height={26}
              className="block"
            />
            <ChevronDown
              size={14}
              className={`text-ink-400 transition-transform ${
                showHamburger ? "rotate-180" : ""
              }`}
            />
          </button>

          {!editingName ? (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              title="Rename project"
              className="group flex items-center gap-1.5 h-9 px-2 rounded-md hover:bg-ink-700 transition-colors"
            >
              <span
                className="font-heading font-bold uppercase tracking-[0.2em] text-[15px]"
                style={{ color: "#3ecfb8" }}
              >
                {projectName}
              </span>
              <Pencil
                size={12}
                className="text-ink-400 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </button>
          ) : (
            <div className="flex items-center gap-1.5 h-9 px-1.5">
              <input
                ref={inputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") cancelEdit();
                }}
                spellCheck={false}
                className="font-heading font-bold uppercase tracking-[0.18em] text-[15px] bg-ink-700 border border-edge rounded-md px-2 h-8 outline-none focus:border-brand-600 min-w-[180px]"
                style={{ color: "#3ecfb8" }}
              />
              <button
                type="button"
                className="pill-btn pill-btn-accent h-8 px-2.5"
                onClick={commitName}
                disabled={
                  draftName.trim().length === 0 ||
                  draftName.trim() === projectName
                }
                title="Apply name"
              >
                Change name
              </button>
              <button
                type="button"
                className="pill-btn h-8 px-2.5"
                onClick={cancelEdit}
                title="Discard changes"
              >
                Cancel
              </button>
            </div>
          )}
          {showHamburger && <HamburgerMenu />}
        </div>

        <div className="flex items-center gap-1 ml-4">
          {MODULES.map((m) => (
            <button
              key={m.id}
              className={`top-tab ${m.id === "show" ? "top-tab-active" : ""}`}
              disabled={m.id !== "show"}
              title={m.id !== "show" ? "Coming soon" : "SpaceShow"}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <button className="pill-btn" onClick={() => setPresenting(true)}>
            <Play size={14} className="mr-1.5" /> Present
          </button>
          <button className="pill-btn pill-btn-accent">
            <Share2 size={14} className="mr-1.5" /> Share
          </button>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 grid place-items-center text-[11px] font-bold text-white ml-1">
            B
          </div>
        </div>
      </div>

      {/* Row 2: board selector + actions + comments */}
      <div className="h-10 flex items-center px-3 gap-2 border-t border-ink-800">
        <BoardSelector />
        <button className="icon-btn" title="New board" onClick={addBoard}>
          <Plus size={16} />
        </button>
        <button
          className="icon-btn"
          title="Duplicate board"
          onClick={duplicateBoard}
        >
          <Copy size={16} />
        </button>

        <div className="w-px h-5 bg-ink-700 mx-1" />
        <button className="icon-btn" title="Undo">
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" title="Redo">
          <Redo2 size={16} />
        </button>
        <div className="w-px h-5 bg-ink-700 mx-1" />
        <button className="icon-btn" title="Import">
          <FileUp size={16} />
        </button>
        <button className="icon-btn" title="Export">
          <FileDown size={16} />
        </button>
        <button className="icon-btn" title="Edit">
          <Pencil size={16} />
        </button>
        <button className="icon-btn" title="View">
          <Eye size={16} />
        </button>
        <button className="icon-btn" title="Rulers">
          <Ruler size={16} />
        </button>
        <div className="w-px h-5 bg-ink-700 mx-1" />
        <div className="text-xs text-ink-400">
          {activeBoard?.name ?? "Board"}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            className={`pill-btn ${showComments ? "pill-btn-accent" : ""}`}
            onClick={() => setShowComments(!showComments)}
          >
            <MessageSquare size={14} className="mr-1.5" /> Comments
          </button>
        </div>
      </div>
    </div>
  );
}

function BoardSelector() {
  const boards = useStore((s) => s.boards);
  const activeBoardId = useStore((s) => s.activeBoardId);
  const setActiveBoard = useStore((s) => s.setActiveBoard);
  return (
    <div className="relative">
      <select
        value={activeBoardId}
        onChange={(e) => setActiveBoard(e.target.value)}
        className="appearance-none pl-3 pr-8 h-8 bg-ink-700 hover:bg-ink-600 rounded-md text-sm text-white outline-none border border-ink-700"
      >
        {boards.map((b) => (
          <option key={b.id} value={b.id} className="bg-ink-800">
            {b.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="text-ink-300 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
      />
    </div>
  );
}

function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme());
  useEffect(() => {
    applyTheme(mode);
  }, [mode]);
  return (
    <button
      className="icon-btn"
      title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setMode(mode === "dark" ? "light" : "dark")}
    >
      {mode === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

function HamburgerMenu() {
  const items = [
    { icon: <FileUp size={14} />, label: "Import (PDF, PPT, Image)" },
    { icon: <FileDown size={14} />, label: "Export (PDF, PPT, Image)" },
    { icon: <Pencil size={14} />, label: "Edit comments / history" },
    { icon: <Eye size={14} />, label: "View comments / framecall" },
    { icon: <Ruler size={14} />, label: "Rulers / Units" },
  ];
  return (
    <div className="absolute top-9 left-0 z-30 w-60 panel rounded-md shadow-xl py-1">
      {items.map((it) => (
        <button
          key={it.label}
          className="w-full text-left px-3 py-2 text-sm text-ink-100 hover:bg-ink-700 flex items-center gap-2"
        >
          <span className="text-ink-300">{it.icon}</span> {it.label}
        </button>
      ))}
    </div>
  );
}
