import { useEffect, useRef, useState } from "react";
import { MessageSquare, Play, Share2 } from "lucide-react";
import { useStore } from "../store";

// SpaceDM groups tabs as: [SpaceStory] | [SpaceSheets, SpaceDesign, SpaceModule] | [SpaceShow]
// We mirror the same three-group layout with dividers between groups.
const TABS_LEFT = [{ id: "story", label: "SpaceStory" }] as const;
const TABS_CENTER = [
  { id: "sheets", label: "SpaceSheets" },
  { id: "design", label: "SpaceDesign" },
  { id: "module", label: "SpaceModule" },
] as const;
const TABS_RIGHT = [{ id: "show", label: "SpaceShow" }] as const;

export function TopBar() {
  const showComments = useStore((s) => s.showComments);
  const openRightPanel = useStore((s) => s.openRightPanel);
  const startPresentation = useStore((s) => s.startPresentation);
  const projectName = useStore((s) => s.projectName);
  const setProjectName = useStore((s) => s.setProjectName);
  const presentationName = useStore((s) => s.presentationName);
  const setPresentationName = useStore((s) => s.setPresentationName);

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  const [editingPres, setEditingPres] = useState(false);
  const [draftPres, setDraftPres] = useState(presentationName);
  const presInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) {
      // Sync the draft to the latest projectName whenever edit mode opens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftName(projectName);
      // focus + select on next tick
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editingName, projectName]);

  useEffect(() => {
    if (editingPres) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftPres(presentationName);
      requestAnimationFrame(() => {
        presInputRef.current?.focus();
        presInputRef.current?.select();
      });
    }
  }, [editingPres, presentationName]);

  function commitName() {
    const next = draftName.trim();
    if (next.length > 0) setProjectName(next);
    setEditingName(false);
  }
  function cancelEdit() {
    setDraftName(projectName);
    setEditingName(false);
  }

  function commitPres() {
    const next = draftPres.trim();
    if (next.length > 0) setPresentationName(next);
    setEditingPres(false);
  }
  function cancelPresEdit() {
    setDraftPres(presentationName);
    setEditingPres(false);
  }

  return (
    <div className="flex flex-col border-b border-ink-700 bg-ink-900">
      {/* Row 1: logo + project name + centered pill tabs + right actions.
          Laid out as a relative flex row so the tab group can be absolutely
          centered (matches SpaceDM's `.topbar-center` pattern). */}
      <div className="h-12 flex items-center px-3 gap-2 relative">
        {/* Left: logo + project name + presentation name (both editable) */}
        <div className="flex items-center gap-1">
          <img
            src="/logo.svg"
            alt="SpaceSync"
            width={28}
            height={28}
            className="block mr-1"
          />

          {!editingName ? (
            <span
              onClick={() => setEditingName(true)}
              title="Click to rename"
              className="px-2 py-1 rounded-md text-[13px] font-semibold text-ink-100 hover:bg-ink-700 cursor-text whitespace-nowrap max-w-[180px] overflow-hidden text-ellipsis"
            >
              {projectName}
            </span>
          ) : (
            <input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") cancelEdit();
              }}
              spellCheck={false}
              className="text-[13px] font-semibold bg-ink-800 border border-brand-600 rounded-md px-2 py-1 w-[180px] outline-none text-ink-100"
            />
          )}

          <span className="text-ink-500 text-[13px] px-1 select-none">/</span>

          {!editingPres ? (
            <span
              onClick={() => setEditingPres(true)}
              title="Click to rename presentation"
              className="px-2 py-1 rounded-md text-[13px] font-semibold text-ink-100 hover:bg-ink-700 cursor-text whitespace-nowrap max-w-[180px] overflow-hidden text-ellipsis"
            >
              {presentationName}
            </span>
          ) : (
            <input
              ref={presInputRef}
              value={draftPres}
              onChange={(e) => setDraftPres(e.target.value)}
              onBlur={commitPres}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitPres();
                if (e.key === "Escape") cancelPresEdit();
              }}
              spellCheck={false}
              className="text-[13px] font-semibold bg-ink-800 border border-brand-600 rounded-md px-2 py-1 w-[180px] outline-none text-ink-100"
            />
          )}
        </div>

        {/* Center: absolutely-centered pill tab group */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
          <div className="flex items-center gap-0.5 bg-ink-800 rounded-md p-[3px]">
            {TABS_LEFT.map((t) => (
              <TopTab key={t.id} id={t.id} label={t.label} active={false} />
            ))}
            <TabDivider />
            {TABS_CENTER.map((t) => (
              <TopTab key={t.id} id={t.id} label={t.label} active={false} />
            ))}
            <TabDivider />
            {TABS_RIGHT.map((t) => (
              <TopTab key={t.id} id={t.id} label={t.label} active={true} />
            ))}
          </div>
        </div>

        {/* Right: Comments + Present + Share */}
        <div className="ml-auto flex items-center gap-2">
          <button
            className={`pill-btn ${showComments ? "pill-btn-accent" : ""}`}
            onClick={() => openRightPanel(showComments ? null : "comments")}
          >
            <MessageSquare size={14} className="mr-1.5" /> Comments
          </button>
          <button
            className="pill-btn"
            onClick={() => startPresentation()}
            title="Present — F5"
          >
            <Play size={14} className="mr-1.5" /> Present
          </button>
          <button className="pill-btn pill-btn-accent">
            <Share2 size={14} className="mr-1.5" /> Share
          </button>
        </div>
      </div>
    </div>
  );
}

// Single tab in the SpaceDM-style pill group. Only "SpaceShow" is active here;
// the others are disabled placeholders for the sibling apps that don't exist
// in this repo yet.
function TopTab({
  id,
  label,
  active,
}: {
  id: string;
  label: string;
  active: boolean;
}) {
  const base =
    "px-3 py-[5px] text-[12px] font-semibold rounded-[6px] transition-colors whitespace-nowrap";
  if (active) {
    return (
      <button
        className={`${base} bg-brand-600 text-white shadow-sm`}
        title={label}
      >
        {label}
      </button>
    );
  }
  return (
    <button
      className={`${base} text-ink-400 hover:text-ink-100 hover:bg-ink-700 disabled:cursor-not-allowed`}
      disabled
      title={`${label} — coming soon`}
      data-tab={id}
    >
      {label}
    </button>
  );
}

function TabDivider() {
  return (
    <div className="w-3 relative" aria-hidden>
      <div className="absolute top-1 bottom-1 left-1/2 w-px bg-ink-700" />
    </div>
  );
}


