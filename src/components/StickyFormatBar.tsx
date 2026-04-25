import { useEffect, useRef, useState } from "react";
import {
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  Lock,
  MoreHorizontal,
  Palette,
  Pencil,
  Scissors,
  Trash2,
  Type,
  Unlock,
} from "lucide-react";
import { useStore } from "../store";
import { DEFAULT_STICKY_BG } from "../lib/sticky";
import { StickyColorPicker } from "./StickyColorPicker";
import { RULER_SIZE } from "./Rulers";
import type { StickyShape } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// StickyFormatBar — sticky-specific top "tool kit" bar.
//
// Mounted at the top-center of the canvas (same anchor pattern as
// TextFormatBar) whenever exactly one sticky is selected. Carries the
// sticky-only options the regular SelectionToolbar can't host: colour
// picker, body-edit shortcut, lock/hide toggles, plus an overflow menu for
// the less-frequent actions (clipboard + rename + delete).
//
// Stays visible WHILE editing the sticky's body. In that state the
// TextFormatBar (which owns rich-text controls) renders directly BELOW
// this bar so the user always has the sticky-level actions in reach
// without losing the per-character formatting controls.
//
// Layout, left → right:
//
//   [Color ▾] | [Edit] | [Lock] [Hide] | [⋯ More]
//
// • Color: 6 preset swatches + a "+" tile that opens ColorPickerPanel for
//   custom hex. Pattern lifted from TextFormatBar's SwatchPopover.
// • Edit: enter body-edit mode (same effect as double-clicking the sticky).
// • Lock / Hide: BaseShape-level toggles applied to this sticky only.
// • More (⋯): popover menu with Duplicate, Copy, Cut, Paste, Rename,
//   Delete. Rename swaps the menu rows for an inline input pre-filled with
//   the current name; Enter or blur commits.
//
// Dismissal: changes automatically with selection — clicking elsewhere on
// the canvas clears the selection (or picks a different shape) and this
// bar unmounts. No bespoke Escape/mousedown handlers needed.
// ─────────────────────────────────────────────────────────────────────────────

export function StickyFormatBar() {
  const selectedShapeId = useStore((s) => s.selectedShapeId);
  const selectedShapeIds = useStore((s) => s.selectedShapeIds);
  const shapes = useStore((s) => s.shapes);
  const tool = useStore((s) => s.tool);
  const toolColors = useStore((s) => s.toolColors);
  const setToolColor = useStore((s) => s.setToolColor);
  const updateShape = useStore((s) => s.updateShape);
  const duplicateShape = useStore((s) => s.duplicateShape);
  const deleteShape = useStore((s) => s.deleteShape);
  const copyShape = useStore((s) => s.copyShape);
  const cutShape = useStore((s) => s.cutShape);
  const pasteShape = useStore((s) => s.pasteShape);
  const beginTextEdit = useStore((s) => s.beginTextEdit);

  const [colorOpen, setColorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close any open popover (color picker / more menu) on outside mousedown.
  // Same UX pattern used by TextFormatBar's swatches: a single listener
  // dismisses both popovers so the user doesn't have to dance around them.
  useEffect(() => {
    function onMd(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setColorOpen(false);
        setMoreOpen(false);
      }
    }
    if (colorOpen || moreOpen) document.addEventListener("mousedown", onMd);
    return () => document.removeEventListener("mousedown", onMd);
  }, [colorOpen, moreOpen]);

  // ── Visibility gates ─────────────────────────────────────────────────
  // The bar renders in TWO modes so it owns the top-center "sticky tool kit"
  // surface end-to-end, replacing the generic SheetToolbar pill that used to
  // appear when the sticky tool was picked:
  //
  //   1. Tool-pick mode: `tool === "sticky"` and no sticky selected yet.
  //      Only the Color swatch shows — it writes `toolColors.sticky`, which
  //      the Canvas create branch reads when dropping the next sticky.
  //   2. Selection mode: a single sticky is selected with the select tool.
  //      Full set of controls (Color / Edit / Lock / Hide / More).
  //
  // Multi-select bails — every action targets a single sticky, so the bar
  // would be misleading.
  const inToolMode = tool === "sticky";
  const selectedShape = selectedShapeId
    ? shapes.find((s) => s.id === selectedShapeId)
    : null;
  const stickyInSelection =
    tool === "select" &&
    !!selectedShape &&
    selectedShape.type === "sticky" &&
    selectedShapeIds.length <= 1
      ? (selectedShape as StickyShape)
      : null;

  if (!inToolMode && !stickyInSelection) return null;

  const sticky = stickyInSelection;

  // Color value source switches between the two modes:
  //  • In tool-pick mode, read/write `toolColors.sticky` — the next sticky's
  //    bgColor seed. Tool-mode stickies always seed at full opacity for now;
  //    the picker still surfaces the alpha slider so the user can dial in a
  //    transparent colour BEFORE dropping (commits to the selected sticky
  //    only, not back to the tool-colour state).
  //  • In selection mode, read/write the selected sticky's `bgColor` AND
  //    `bgOpacity` together.
  const bg = sticky?.bgColor ?? toolColors.sticky ?? DEFAULT_STICKY_BG;
  const bgAlpha = sticky?.bgOpacity ?? 1;

  function applyColor(next: { color: string; opacity: number }) {
    if (sticky) {
      updateShape(sticky.id, {
        bgColor: next.color,
        bgOpacity: next.opacity,
      } as Partial<StickyShape>);
    } else {
      // Tool-pick mode — persist colour on the tool so the next dropped
      // sticky uses it without clobbering already-placed stickies. Opacity
      // is intentionally NOT persisted to the tool: the next sticky always
      // drops opaque, and the user dials transparency per-shape after that.
      setToolColor("sticky", next.color);
    }
  }

  function enterEdit(field: "header" | "body") {
    if (!sticky || sticky.locked) return;
    beginTextEdit({ kind: "sticky", id: sticky.id, field });
  }

  const isLocked = sticky?.locked ?? false;
  const isVisible = sticky?.visible ?? true;

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label={
        sticky ? `Sticky actions for ${sticky.name}` : "Sticky tool options"
      }
      data-sticky-format-bar
      // Top-center anchor mirrors TextFormatBar so the two stack cleanly
      // (this bar on top, TextFormatBar directly below) when a sticky body
      // is being edited. Same `left-1/2 -translate-x-1/2` trick.
      className="absolute left-1/2 -translate-x-1/2 z-40 flex items-center gap-0.5 px-1.5 py-1 rounded-full shadow-xl ring-1 ring-black/40 bg-ink-900 text-ink-100"
      style={{ top: RULER_SIZE + 8 }}
      // Right-click on the bar shouldn't reopen the canvas context menu
      // under it. Mousedown shouldn't reach Canvas (no marquee start, no
      // accidental shape drop while sticky tool is active).
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Color ──────────────────────────────────────────────────── */}
      <div className="relative">
        <button
          type="button"
          title={sticky ? "Sticky colour" : "Next sticky colour"}
          aria-label={sticky ? "Sticky colour" : "Next sticky colour"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setColorOpen((v) => !v);
            setMoreOpen(false);
          }}
          className={`flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors ${
            colorOpen ? "row-active" : "hover:bg-ink-700/60 text-ink-100"
          }`}
        >
          <Palette size={13} />
          {/* Trigger swatch reflects BOTH colour and opacity — a half-
              transparent tile reads as "this sticky has alpha applied" at a
              glance, without having to open the picker. */}
          <span
            className="inline-block w-3.5 h-3.5 rounded-sm ring-1 ring-black/40"
            style={{ background: bg, opacity: bgAlpha }}
          />
        </button>
        {colorOpen && (
          <StickyColorPicker
            value={bg}
            opacity={bgAlpha}
            onApply={applyColor}
            onClose={() => setColorOpen(false)}
          />
        )}
      </div>

      {/* The rest of the toolkit always renders so the bar's footprint is
          identical across both modes (tool-pick AND selection). When there's
          no selected sticky to act on, these controls are disabled — the user
          still sees them and learns the layout, and they "wake up" the moment
          a sticky is dropped + selected without the bar visually shuffling. */}
      <Divider />

      {/* ── Edit text shortcut ─────────────────────────────────────── */}
      <button
        type="button"
        title="Edit text"
        aria-label="Edit text"
        onClick={() => enterEdit("body")}
        className="h-7 px-2 inline-flex items-center gap-1 rounded text-xs text-ink-100 hover:bg-ink-700/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={!sticky || sticky.locked}
      >
        <Type size={13} />
        <span>Edit</span>
      </button>

      <Divider />

      {/* ── Lock / Hide (kept inline because they're frequent toggles
            and their state is reflected in the icon itself) ────────── */}
      <ToolbarButton
        title={isLocked ? "Unlock" : "Lock"}
        onClick={() =>
          sticky &&
          updateShape(sticky.id, {
            locked: !isLocked,
          } as Partial<StickyShape>)
        }
        Icon={isLocked ? Unlock : Lock}
        disabled={!sticky}
      />
      <ToolbarButton
        title={isVisible ? "Hide" : "Unhide"}
        onClick={() =>
          sticky &&
          updateShape(sticky.id, {
            visible: !isVisible,
          } as Partial<StickyShape>)
        }
        Icon={isVisible ? EyeOff : Eye}
        disabled={!sticky}
      />

      <Divider />

      {/* ── More options ─────────────────────────────────────────── */}
      <div className="relative">
        <ToolbarButton
          title="More options"
          onClick={() => {
            // Disabled when no sticky is selected — there's nothing the
            // dropdown could act on, so swallow the click instead of opening
            // a menu of disabled rows.
            if (!sticky) return;
            setMoreOpen((v) => !v);
            setColorOpen(false);
          }}
          Icon={MoreHorizontal}
          disabled={!sticky}
        />
        {moreOpen && sticky && (
          <MoreOptionsMenu
            sticky={sticky}
            onDuplicate={() => {
              duplicateShape(sticky.id);
              setMoreOpen(false);
            }}
            onCopy={() => {
              copyShape(sticky.id);
              setMoreOpen(false);
            }}
            onCut={() => {
              cutShape(sticky.id);
              setMoreOpen(false);
            }}
            onPaste={() => {
              pasteShape();
              setMoreOpen(false);
            }}
            onRename={(next) => {
              updateShape(sticky.id, {
                name: next,
              } as Partial<StickyShape>);
              setMoreOpen(false);
            }}
            onDelete={() => {
              deleteShape(sticky.id);
              setMoreOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Three-dots dropdown — Duplicate / Copy / Cut / Paste / Rename / Delete.
 *  Rename swaps the row content for an inline `<input>` so the user can
 *  retype without leaving the menu. Other rows fire their callback and let
 *  the parent close the menu. */
function MoreOptionsMenu({
  sticky,
  onDuplicate,
  onCopy,
  onCut,
  onPaste,
  onRename,
  onDelete,
}: {
  sticky: StickyShape;
  onDuplicate: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onRename: (next: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(sticky.name ?? "Sticky note");
  const inputRef = useRef<HTMLInputElement>(null);

  // When entering rename mode, focus the input and select-all so the user
  // can type-replace without first clearing the field manually.
  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  function commitRename() {
    const trimmed = draftName.trim();
    onRename(trimmed.length > 0 ? trimmed : (sticky.name ?? "Sticky note"));
  }

  return (
    <div
      className="absolute top-full mt-2 right-0 z-40 min-w-[180px] rounded-md shadow-2xl ring-1 ring-black/40 py-1"
      style={{ background: "var(--bg-secondary)" }}
      // Right-clicks inside the menu shouldn't bubble to the canvas, and
      // we already swallow mousedown at the bar root.
      onContextMenu={(e) => e.preventDefault()}
    >
      {renaming ? (
        // Inline rename row — replaces the entire menu list while active.
        // Enter commits, Escape aborts (resets local draft + closes the
        // rename mode but keeps the menu open so the user can pick another
        // action without re-opening).
        <div className="px-2 py-1.5">
          <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
            Rename sticky
          </label>
          <input
            ref={inputRef}
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraftName(sticky.name ?? "Sticky note");
                setRenaming(false);
              }
              e.stopPropagation();
            }}
            // Commit on blur too, in case the user clicks Duplicate/etc
            // after typing a new name without hitting Enter.
            onBlur={commitRename}
            className="w-full h-7 px-2 rounded bg-ink-800 border border-ink-700 text-xs text-ink-100 outline-none focus:border-brand-500"
          />
        </div>
      ) : (
        <>
          <MenuItem Icon={CopyPlus} label="Duplicate" onClick={onDuplicate} />
          <MenuItem Icon={Copy} label="Copy" onClick={onCopy} />
          <MenuItem Icon={Scissors} label="Cut" onClick={onCut} />
          <MenuItem Icon={ClipboardPaste} label="Paste" onClick={onPaste} />
          <MenuItem
            Icon={Pencil}
            label="Rename"
            onClick={() => setRenaming(true)}
          />
          <div className="my-1 mx-2 h-px bg-ink-700/80" />
          <MenuItem
            Icon={Trash2}
            label="Delete"
            onClick={onDelete}
            danger
          />
        </>
      )}
    </div>
  );
}

function MenuItem({
  Icon,
  label,
  onClick,
  danger = false,
}: {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-1.5 inline-flex items-center gap-2 text-xs text-left transition-colors ${
        danger
          ? "text-red-400 hover:bg-red-500/15"
          : "text-ink-100 hover:bg-ink-700/60"
      }`}
    >
      <Icon size={13} />
      <span className="flex-1">{label}</span>
    </button>
  );
}

function ToolbarButton({
  title,
  onClick,
  Icon,
  danger = false,
  disabled = false,
}: {
  title: string;
  onClick: () => void;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-7 h-7 inline-flex items-center justify-center rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? "text-red-400 hover:bg-red-500/15"
          : "text-ink-100 hover:bg-ink-700/60"
      }`}
    >
      <Icon size={14} />
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-ink-700/80 mx-0.5" />;
}
