import {
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  ChevronsDown,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  MoreHorizontal,
  CopyPlus,
  Scissors,
  Copy,
  ClipboardPaste,
  Pencil,
  Trash2,
  Group,
  Ungroup,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Row controls for the Sheets & Layers sidebar.
//
// Each row in the sidebar surfaces common list-management actions without
// leaving the sidebar. The controls are split into two clusters so the caller
// can position them on opposite sides of the row's name:
//
//   [caret][ <RowReorderControl> ][icon][name][count][ <RowRightControls> ]
//                  ↑                                         ↑
//              left cluster                            right cluster
//
// - `RowReorderControl` renders a ChevronsUpDown trigger whose popover lists
//   Move to top / Move up / Move down / Move to bottom.
// - `RowRightControls` renders Hide, Lock, and a More-options popover
//   containing Duplicate, Cut, Copy, Paste, Rename, Delete.
//
// Every trigger is opacity-0 by default and reveals on `group-hover:` /
// `group-focus-within:` from the row wrapper (which must be `className="group
// relative"`). When the row is `forceVisible` (selected or active), every
// control stays at opacity-100. Hide/Lock also stay at opacity-100 whenever
// their state is active so users can see what's hidden/locked without having
// to hover every row.
//
// Both popovers are absolutely positioned inside the row wrapper's `relative`
// context. They close on outside `mousedown` or `Escape`.
// ─────────────────────────────────────────────────────────────────────────────

export type MoveDirection = "up" | "down" | "top" | "bottom";

// ── RowReorderControl (left cluster) ────────────────────────────────────────

export interface RowReorderControlProps {
  entity: "sheet" | "shape" | "group";
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: MoveDirection) => void;
  /** Force the trigger visible — use when the row is selected/active. */
  forceVisible: boolean;
  /** Which edge of the trigger the popover aligns to. "start" (default) pins
   *  the popover's LEFT edge to the trigger and opens rightward — correct
   *  for the narrow left sidebar where the popover overflows into the
   *  canvas. "end" pins the popover's RIGHT edge and opens leftward — use
   *  when the trigger sits at the far right of a bounded container (e.g.
   *  a modal) and a rightward popover would clip the container. */
  popoverAlign?: "start" | "end";
}

export function RowReorderControl({
  entity,
  canUp,
  canDown,
  onMove,
  forceVisible,
  popoverAlign = "start",
}: RowReorderControlProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const visible =
    open || forceVisible
      ? "opacity-100"
      : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";

  function act(dir: MoveDirection) {
    onMove(dir);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={`Reorder ${entity}`}
        aria-label={`Reorder ${entity}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${visible} text-ink-300 hover:text-white transition-opacity p-0.5 rounded`}
      >
        <ChevronsUpDown size={12} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`Reorder ${entity}`}
          className={
            "absolute top-full mt-1 z-40 w-44 rounded-md border border-ink-700 bg-ink-900/95 text-ink-100 shadow-2xl py-1 backdrop-blur-sm " +
            (popoverAlign === "end" ? "right-0" : "left-0")
          }
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <MenuItem
            icon={<ChevronsUp size={13} />}
            label="Move to top"
            disabled={!canUp}
            onClick={() => act("top")}
          />
          <MenuItem
            icon={<ChevronUp size={13} />}
            label="Move up"
            disabled={!canUp}
            onClick={() => act("up")}
          />
          <MenuItem
            icon={<ChevronDown size={13} />}
            label="Move down"
            disabled={!canDown}
            onClick={() => act("down")}
          />
          <MenuItem
            icon={<ChevronsDown size={13} />}
            label="Move to bottom"
            disabled={!canDown}
            onClick={() => act("bottom")}
          />
        </div>
      )}
    </div>
  );
}

// ── RowRightControls (right cluster: Hide + Lock + More) ────────────────────

export interface RowRightControlsProps {
  entity: "sheet" | "shape" | "group";
  hidden: boolean;
  locked: boolean;
  canCut: boolean;
  canPaste: boolean;
  /** Force triggers visible — use when the row is selected/active. Hide &
   *  Lock ALSO force-visible automatically whenever their state is active. */
  forceVisible: boolean;
  /** Show a "Group selection" menu item. Only meaningful for shape rows — set
   *  by the caller when ≥2 shapes are multi-selected AND this row is one of
   *  them. */
  showGroup?: boolean;
  /** Show an "Ungroup" menu item. Only meaningful for shape rows — set by the
   *  caller when this row's shape has a `groupId`. */
  showUngroup?: boolean;
  onToggleHidden: () => void;
  onToggleLocked: () => void;
  onDuplicate: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onRenameRequest: () => void;
  onDelete: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
}

export function RowRightControls(props: RowRightControlsProps) {
  return (
    <>
      <HideToggle
        entity={props.entity}
        hidden={props.hidden}
        onToggle={props.onToggleHidden}
        forceVisible={props.forceVisible}
      />
      <LockToggle
        entity={props.entity}
        locked={props.locked}
        onToggle={props.onToggleLocked}
        forceVisible={props.forceVisible}
      />
      <RowMoreMenu
        entity={props.entity}
        canCut={props.canCut}
        canPaste={props.canPaste}
        forceVisible={props.forceVisible}
        showGroup={props.showGroup}
        showUngroup={props.showUngroup}
        onDuplicate={props.onDuplicate}
        onCut={props.onCut}
        onCopy={props.onCopy}
        onPaste={props.onPaste}
        onRenameRequest={props.onRenameRequest}
        onDelete={props.onDelete}
        onGroup={props.onGroup}
        onUngroup={props.onUngroup}
      />
    </>
  );
}

// ── Hide & Lock toggles ──────────────────────────────────────────────────────

export function HideToggle({
  entity,
  hidden,
  onToggle,
  forceVisible,
}: {
  entity: "sheet" | "shape" | "group";
  hidden: boolean;
  onToggle: () => void;
  forceVisible: boolean;
}) {
  // Hidden state is intrinsically "show the eye-off even without hover" —
  // users need to see what's hidden at a glance.
  const visible =
    hidden || forceVisible
      ? "opacity-100"
      : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={hidden ? `Show ${entity}` : `Hide ${entity}`}
      aria-label={hidden ? `Show ${entity}` : `Hide ${entity}`}
      className={`${visible} shrink-0 text-ink-300 hover:text-white transition-opacity p-0.5 rounded`}
    >
      {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
    </button>
  );
}

function LockToggle({
  entity,
  locked,
  onToggle,
  forceVisible,
}: {
  entity: "sheet" | "shape" | "group";
  locked: boolean;
  onToggle: () => void;
  forceVisible: boolean;
}) {
  const visible =
    locked || forceVisible
      ? "opacity-100"
      : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={locked ? `Unlock ${entity}` : `Lock ${entity}`}
      aria-label={locked ? `Unlock ${entity}` : `Lock ${entity}`}
      className={`${visible} shrink-0 text-ink-300 hover:text-white transition-opacity p-0.5 rounded`}
    >
      {locked ? <Lock size={12} /> : <Unlock size={12} />}
    </button>
  );
}

// ── More-options button + popover ────────────────────────────────────────────

function RowMoreMenu({
  entity,
  canCut,
  canPaste,
  forceVisible,
  showGroup,
  showUngroup,
  onDuplicate,
  onCut,
  onCopy,
  onPaste,
  onRenameRequest,
  onDelete,
  onGroup,
  onUngroup,
}: {
  entity: "sheet" | "shape" | "group";
  canCut: boolean;
  canPaste: boolean;
  forceVisible: boolean;
  showGroup?: boolean;
  showUngroup?: boolean;
  onDuplicate: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onRenameRequest: () => void;
  onDelete: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const visible =
    open || forceVisible
      ? "opacity-100"
      : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";

  function run(fn: () => void) {
    fn();
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={`More ${entity} options`}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${visible} text-ink-300 hover:text-white transition-opacity p-0.5 rounded`}
      >
        <MoreHorizontal size={12} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`More ${entity} options`}
          className="absolute right-0 top-full mt-1 z-40 w-44 rounded-md border border-ink-700 bg-ink-900/95 text-ink-100 shadow-2xl py-1 backdrop-blur-sm"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <MenuItem
            icon={<CopyPlus size={13} />}
            label="Duplicate"
            onClick={() => run(onDuplicate)}
          />
          <MenuItem
            icon={<Scissors size={13} />}
            label="Cut"
            disabled={!canCut}
            onClick={() => run(onCut)}
          />
          <MenuItem
            icon={<Copy size={13} />}
            label="Copy"
            onClick={() => run(onCopy)}
          />
          <MenuItem
            icon={<ClipboardPaste size={13} />}
            label="Paste"
            disabled={!canPaste}
            onClick={() => run(onPaste)}
          />
          {(showGroup || showUngroup) && (
            <div className="h-px bg-ink-700 my-1" />
          )}
          {showGroup && onGroup && (
            <MenuItem
              icon={<Group size={13} />}
              label="Group selection"
              onClick={() => run(onGroup)}
            />
          )}
          {showUngroup && onUngroup && (
            <MenuItem
              icon={<Ungroup size={13} />}
              label="Ungroup"
              onClick={() => run(onUngroup)}
            />
          )}
          <div className="h-px bg-ink-700 my-1" />
          <MenuItem
            icon={<Pencil size={13} />}
            label="Rename"
            onClick={() => run(onRenameRequest)}
          />
          <MenuItem
            icon={<Trash2 size={13} />}
            label="Delete"
            danger
            onClick={() => run(onDelete)}
          />
        </div>
      )}
    </div>
  );
}

// ── Shared menu item ─────────────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick();
      }}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
        disabled
          ? "opacity-40 cursor-not-allowed"
          : "hover:bg-ink-700/70"
      } ${danger ? "text-rose-400" : "text-ink-100"}`}
    >
      <span className={danger ? "text-rose-400" : "text-ink-300"}>{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

// ── Outside-click hook (shared by both popovers) ─────────────────────────────

export function useClickOutside(
  ref: React.RefObject<HTMLElement>,
  onOut: () => void,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return;
    function onMd(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOut();
    }
    document.addEventListener("mousedown", onMd);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMd);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onOut, enabled]);
}
