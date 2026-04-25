import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Copy,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  MessageSquarePlus,
  FilePlus2,
} from "lucide-react";
import type Konva from "konva";
import { useStore } from "../store";

// ─────────────────────────────────────────────────────────────────────────────
// ContextMenu — canvas right-click / two-finger-tap menu.
//
// Driven entirely by `store.contextMenu` (Phase 1). This component:
//   • Renders a floating menu at viewport coords when `contextMenu.open`.
//   • Branches its item list on `contextMenu.target`:
//       - "element": Duplicate · Copy · Cut · Paste · Lock/Unlock ·
//         Hide/Unhide · Rename · Add a Comment · Delete.
//       - "board":   Paste · Add a Comment · Add Sheet.
//   • Flips horizontally/vertically to stay on-screen (collision detection
//     measures the rendered menu, then nudges left/up if the click is near
//     a viewport edge).
//   • Dismisses on mouse-down outside, Escape, scroll, or right-click (since
//     the Canvas will re-open the menu at the new coords via Phase-1 handler).
//
// Multi-awareness (Phase 4): when the right-clicked shape is part of a
// multi-selection — which happens naturally when Canvas's onContextMenu
// passes a grouped shape through `selectShape(id)` and the store expands to
// the whole group — actions operate on the entire selection instead of just
// the clicked shape. Item labels suffix "(N)" to make the scope explicit so
// users don't click "Delete" thinking it only affects the one they clicked.
//
// Rename uses `window.prompt` as a deliberate Phase-4 MVP: it's synchronous,
// universally available, and doesn't block the rest of the feature on a
// polished inline-edit overlay. A later polish pass can replace it.
//
// Add a Comment dispatches a `spaceshow:add-comment-at` custom event with
// the click's viewport coords. Canvas listens and does the viewport→world→
// sheet-local conversion there — the math needs the stage's DOM offset and
// the sheet-hit helper, both of which already live in Canvas.
// ─────────────────────────────────────────────────────────────────────────────

interface MenuAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface MenuSeparator {
  id: string;
  separator: true;
}

type MenuEntry = MenuAction | MenuSeparator;

// Minimum gap between the menu and the viewport edge. Keeps the shadow from
// clipping and gives the user a visible margin before a flipped menu lands.
const EDGE_PADDING = 8;

export function ContextMenu() {
  const ctx = useStore((s) => s.contextMenu);
  const close = useStore((s) => s.closeContextMenu);
  const shapes = useStore((s) => s.shapes);
  const selectedShapeIds = useStore((s) => s.selectedShapeIds);

  // Single-target actions — used when exactly one shape is in play.
  const duplicateShape = useStore((s) => s.duplicateShape);
  const copyShape = useStore((s) => s.copyShape);
  const cutShape = useStore((s) => s.cutShape);
  const deleteShape = useStore((s) => s.deleteShape);
  const updateShape = useStore((s) => s.updateShape);
  // Multi-target actions — used when the right-click landed on a grouped
  // shape (Phase-3 selection expansion puts the whole group into
  // `selectedShapeIds`) so the menu operates on the full set.
  const copyMultiToClip = useStore((s) => s.copyMultiToClip);
  // Paste handlers are read from `useStore.getState()` inside `handlePaste`
  // so we don't subscribe this component to clipboard changes (the menu
  // doesn't need to re-render when the clipboard updates).
  const addSheet = useStore((s) => s.addSheet);

  const menuRef = useRef<HTMLDivElement>(null);
  // Collision-adjusted coords. `null` until the first useLayoutEffect pass —
  // while null, the menu renders with `visibility: hidden` so there's no
  // one-frame flash at the unclamped position when the click is near the
  // right or bottom edge.
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Reset + re-measure whenever the menu opens at a new coordinate or target.
  // Include `ctx.target` / `ctx.elementId` because a target swap can change
  // the item list (and therefore the menu height).
  useLayoutEffect(() => {
    if (!ctx.open) {
      setPosition(null);
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = ctx.x;
    let ny = ctx.y;
    if (nx + rect.width > vw - EDGE_PADDING) {
      nx = Math.max(EDGE_PADDING, ctx.x - rect.width);
    }
    if (ny + rect.height > vh - EDGE_PADDING) {
      ny = Math.max(EDGE_PADDING, ctx.y - rect.height);
    }
    setPosition({ x: nx, y: ny });
  }, [ctx.open, ctx.x, ctx.y, ctx.target, ctx.elementId]);

  // Dismiss on left mouse-down outside, Escape, or scroll. Right mouse-down
  // outside is NOT handled here — the Canvas handler fires on right-click
  // and calls `openContextMenu` again, replacing this state with the new
  // click's target. That feels like the menu "moved", which is what users
  // expect from a context menu.
  useEffect(() => {
    if (!ctx.open) return;
    function onDown(e: MouseEvent) {
      if (e.button !== 0) return;
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    function onScroll() {
      close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [ctx.open, close]);

  if (!ctx.open) return null;

  // Resolve the right-clicked shape (for toggle labels + single-target ops).
  // Safe if the shape was deleted between open and render — fall back to the
  // board item set so the menu stays usable.
  const targetShape =
    ctx.target === "element" && ctx.elementId
      ? shapes.find((s) => s.id === ctx.elementId) ?? null
      : null;

  // Are we operating on a multi-selection? True when the right-click hit a
  // shape that's part of an expanded selection (typically: Phase-3 grouped-
  // shape expansion). Collapsing multi→single on a non-grouped right-click
  // is done in Canvas, so here we trust `selectedShapeIds` as the canonical
  // "what the user has selected right now" set.
  const isMulti =
    !!targetShape &&
    selectedShapeIds.length > 1 &&
    selectedShapeIds.includes(targetShape.id);

  // The ids the actions below will dispatch against. Multi → full selection;
  // single → just the right-clicked shape (or empty when the menu is in
  // board mode).
  const operatingIds: string[] = isMulti
    ? selectedShapeIds
    : targetShape
      ? [targetShape.id]
      : [];
  const operatingShapes = shapes.filter((s) => operatingIds.includes(s.id));
  // "all locked" / "all visible" drive the toggle label + determine the
  // direction of the multi-flip. If the set is mixed (some locked, some
  // not), we show "Lock" and lock everything — a deliberate choice that
  // matches Figma's "dominant inverse" behavior.
  const allLocked =
    operatingShapes.length > 0 && operatingShapes.every((s) => s.locked);
  const allVisible =
    operatingShapes.length > 0 && operatingShapes.every((s) => s.visible);

  // Wrap any action so the menu always closes after it fires. Keeps callers
  // from having to remember to add `close()` to every onClick.
  const runAndClose = (fn: () => void) => () => {
    fn();
    close();
  };

  // ── Action handlers ─────────────────────────────────────────────────────
  const handleDuplicate = runAndClose(() => {
    // Per-shape duplicate works fine for both paths: duplicating each
    // member of a group individually yields a duplicated group-equivalent
    // set (the store preserves groupId on the duplicates).
    operatingIds.forEach((id) => duplicateShape(id));
  });

  const handleCopy = runAndClose(() => {
    if (isMulti) {
      copyMultiToClip(operatingIds, []);
    } else if (targetShape) {
      copyShape(targetShape.id);
    }
  });

  const handleCut = runAndClose(() => {
    if (isMulti) {
      // No dedicated multi-cut in the store, so mimic it: copy the set to
      // the multi clipboard, then drop the shapes individually.
      copyMultiToClip(operatingIds, []);
      operatingIds.forEach((id) => deleteShape(id));
    } else if (targetShape) {
      cutShape(targetShape.id);
    }
  });

  const handlePaste = runAndClose(() => {
    // "Paste must land where the mouse was". We do the viewport → world →
    // sheet-local conversion inline instead of bouncing through a custom
    // event to Canvas — one fewer moving piece, and crucially: we avoid
    // depending on a useEffect listener registration that's hard to
    // diagnose when something goes wrong.
    //
    // The only Canvas-owned piece we actually need is the Konva stage, so
    // we read it off `window.__spaceshow_stage` (the same global pattern
    // SheetToolbar uses for PNG/JPEG export). Everything else — pan, zoom,
    // sheets, clipboard, paste actions — is in the store.
    const st = useStore.getState();
    const stage = (window as unknown as { __spaceshow_stage?: Konva.Stage })
      .__spaceshow_stage;
    // Bail early if both clipboards are empty — nothing to paste.
    if (!st.clipboard.multi && !st.clipboard.shape) return;
    // Without a stage we can't translate the viewport coords into world
    // space, so we degrade to the anchorless paste (same as Cmd+V).
    if (!stage) {
      if (st.clipboard.multi) st.pasteMultiFromClip();
      else st.pasteShape();
      return;
    }
    const rect = stage.container().getBoundingClientRect();
    const stageX = ctx.x - rect.left;
    const stageY = ctx.y - rect.top;
    const wx = (stageX - st.pan.x) / st.zoom;
    const wy = (stageY - st.pan.y) / st.zoom;
    // Prefer the top-most sheet under the cursor; iterate the sheets array
    // in reverse so a sheet rendered last (visually on top) wins a tie.
    const targetSheet = [...st.sheets]
      .reverse()
      .find(
        (sh) =>
          wx >= sh.x &&
          wx <= sh.x + sh.width &&
          wy >= sh.y &&
          wy <= sh.y + sh.height,
      );
    // Cursor over empty board area → fall back to the active sheet but
    // still honor the cursor world coords (shape lands under the mouse
    // whether or not it's strictly inside a sheet's rect). If there's no
    // active sheet at all, degrade to the anchorless paste.
    const anchorSheet =
      targetSheet ?? st.sheets.find((sh) => sh.id === st.activeSheetId);
    if (!anchorSheet) {
      if (st.clipboard.multi) st.pasteMultiFromClip();
      else st.pasteShape();
      return;
    }
    const anchor = {
      sheetId: anchorSheet.id,
      x: wx - anchorSheet.x,
      y: wy - anchorSheet.y,
    };
    if (st.clipboard.multi) st.pasteMultiFromClip(anchor);
    else st.pasteShape(anchor);
  });

  const handleLockToggle = runAndClose(() => {
    const nextLocked = !allLocked;
    operatingIds.forEach((id) => updateShape(id, { locked: nextLocked }));
  });

  const handleHideToggle = runAndClose(() => {
    const nextVisible = !allVisible;
    operatingIds.forEach((id) => updateShape(id, { visible: nextVisible }));
  });

  const handleRename = runAndClose(() => {
    // Single-target only — multi-rename is hidden from the menu below.
    if (!targetShape) return;
    // Route the rename through the Layers sidebar's inline-rename flow so
    // there's one editing UX for rename regardless of where it's triggered.
    // We need to make sure the row is actually visible before we flip the
    // store into rename mode, otherwise `RenameInput`'s autoFocus fires on
    // an unmounted row and nothing happens.
    //
    // Visibility checklist:
    //   1. Left sidebar must be expanded (it can be collapsed via the
    //      splitter toggle).
    //   2. Layers tab must be active (it defaults to Layers, but the user
    //      may be on Sheets).
    //   3. The shape's parent sheet must be expanded in the Layers tree.
    //   4. If the shape belongs to a group, that group must be expanded —
    //      grouped shapes nest under a "group:<id>" expansion key.
    //
    // Once the row is guaranteed to mount, `startRenameShape(id)` flips
    // `renamingShapeId` and the row swaps its name span for `RenameInput`,
    // which autoFocus()/select()s and lets the user type immediately.
    const st = useStore.getState();
    st.setShowLeftSidebar(true);
    st.setLeftSidebarTab("layers");
    // Use `setState` directly for expansion because the store only exposes
    // a toggle — we need set-to-true semantics (toggling a sheet that's
    // already open would collapse it and hide the row).
    const groupKey = targetShape.groupId
      ? `group:${targetShape.groupId}`
      : null;
    useStore.setState((s) => ({
      expandedSheets: {
        ...s.expandedSheets,
        [targetShape.sheetId]: true,
        ...(groupKey ? { [groupKey]: true } : {}),
      },
    }));
    st.startRenameShape(targetShape.id);
  });

  const handleAddComment = runAndClose(() => {
    // Canvas owns the viewport→world→sheet-local conversion because it has
    // the stage's DOM offset and `findSheetAt`. We just forward the click's
    // viewport coords.
    window.dispatchEvent(
      new CustomEvent("spaceshow:add-comment-at", {
        detail: { clientX: ctx.x, clientY: ctx.y },
      }),
    );
  });

  const handleDelete = runAndClose(() => {
    operatingIds.forEach((id) => deleteShape(id));
  });

  const handleAddSheet = runAndClose(() => addSheet());

  // "(3)" suffix on multi-labels makes the scope explicit so the user
  // doesn't click "Delete" thinking it's a single-shape action.
  const countSuffix = isMulti ? ` (${operatingIds.length})` : "";

  let items: MenuEntry[];
  if (targetShape) {
    items = [
      {
        id: "duplicate",
        label: `Duplicate${countSuffix}`,
        icon: CopyPlus,
        onClick: handleDuplicate,
      },
      {
        id: "copy",
        label: `Copy${countSuffix}`,
        icon: Copy,
        onClick: handleCopy,
      },
      {
        id: "cut",
        label: `Cut${countSuffix}`,
        icon: Scissors,
        onClick: handleCut,
      },
      {
        id: "paste",
        label: "Paste",
        icon: ClipboardPaste,
        onClick: handlePaste,
      },
      { id: "sep1", separator: true },
      {
        id: "lock",
        label: `${allLocked ? "Unlock" : "Lock"}${countSuffix}`,
        icon: allLocked ? Unlock : Lock,
        onClick: handleLockToggle,
      },
      {
        id: "hide",
        label: `${allVisible ? "Hide" : "Unhide"}${countSuffix}`,
        icon: allVisible ? EyeOff : Eye,
        onClick: handleHideToggle,
      },
      // Rename is single-shape only — multi-rename isn't a meaningful
      // operation (there's no single name to set). The item is simply
      // omitted when `isMulti` so the menu stays honest about what it can
      // do rather than showing a disabled row the user has to figure out.
      ...(isMulti
        ? []
        : [
            {
              id: "rename",
              label: "Rename",
              icon: Pencil,
              onClick: handleRename,
            } as MenuAction,
          ]),
      { id: "sep2", separator: true },
      {
        id: "comment",
        label: "Add a Comment",
        icon: MessageSquarePlus,
        onClick: handleAddComment,
      },
      {
        id: "delete",
        label: `Delete${countSuffix}`,
        icon: Trash2,
        onClick: handleDelete,
        danger: true,
      },
    ];
  } else {
    // Board target (or element with a stale id). Clipboard + comment
    // actions only, plus Add Sheet which is unique to the board menu.
    items = [
      {
        id: "paste",
        label: "Paste",
        icon: ClipboardPaste,
        onClick: handlePaste,
      },
      {
        id: "comment",
        label: "Add a Comment",
        icon: MessageSquarePlus,
        onClick: handleAddComment,
      },
      { id: "sep1", separator: true },
      {
        id: "add-sheet",
        label: "Add Sheet",
        icon: FilePlus2,
        onClick: handleAddSheet,
      },
    ];
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      // Attribute lets SelectionToolbar's outside-mousedown listener treat
      // clicks on context-menu items as "inside the right-click interaction"
      // so the paired toolbar doesn't dismiss when the user picks a menu row.
      data-context-menu
      aria-label={
        targetShape
          ? isMulti
            ? `Selection actions (${operatingIds.length} shapes)`
            : `Element actions for ${targetShape.name}`
          : "Board actions"
      }
      className="fixed z-50 min-w-[180px] rounded-md border border-ink-700 bg-ink-900 text-ink-100 shadow-2xl py-1 select-none"
      style={{
        left: position ? position.x : ctx.x,
        top: position ? position.y : ctx.y,
        // Render off-screen until collision math has run (first layout pass).
        // Avoids a visible jump when the click lands near a viewport edge.
        visibility: position ? "visible" : "hidden",
      }}
      // Swallow right-clicks on the menu itself so Canvas doesn't re-open
      // the menu on top of our own click. Left mouse-down stays un-stopped
      // so menu items still receive their click events.
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((entry) => {
        if ("separator" in entry && entry.separator) {
          return (
            <div
              key={entry.id}
              className="my-1 h-px bg-ink-700/80"
              role="separator"
            />
          );
        }
        const item = entry as MenuAction;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={item.onClick}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-left transition-colors ${
              item.danger
                ? "text-red-400 hover:bg-red-500/15"
                : "hover:bg-ink-700/60"
            } disabled:opacity-40 disabled:pointer-events-none`}
          >
            <Icon size={14} className="shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
