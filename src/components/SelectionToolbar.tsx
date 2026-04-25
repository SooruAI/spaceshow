import { useEffect } from "react";
import {
  CopyPlus,
  Copy,
  Scissors,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import { worldToScreen } from "../lib/zoom";
import { useStore } from "../store";
import type { Shape } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// SelectionToolbar — floating "top tool bar" that appears directly above a
// single shape with the most common quick actions: Duplicate, Copy, Cut,
// Lock/Unlock, Hide/Unhide, Delete.
//
// Right-click gated: only visible when the user explicitly triggers it via
// right-click or two-finger-tap (Canvas's onContextMenu calls
// `showSelectionToolbarFor(shapeId)`). It is NOT driven by normal selection —
// a left-click that selects a shape does not summon the bar. This is a
// deliberate UX choice: the bar is a companion to the context menu, not a
// persistent piece of chrome on every selected shape.
//
// Dismissal triggers (mirrors ContextMenu):
//   • Escape
//   • Left mousedown outside the bar AND outside the context menu (clicks on
//     context menu items don't nuke the bar — the menu's own runAndClose
//     handles the menu, and the bar stays for chained toolbar actions).
//   • Board right-click (Canvas calls hideSelectionToolbar)
//   • Shape disappears (visibility guard short-circuits + cleanup effect
//     clears the stale id)
//
// Hides for image shapes (ImageOptionsBar owns that airspace), stickies
// (StickyFormatBar owns that airspace), while editing a text shape
// (TextFormatBar owns that), and outside the select tool.
// ─────────────────────────────────────────────────────────────────────────────

/** World-coord anchor for the toolbar = shape's top-left, lifted into world
 *  space by adding the parent sheet's origin (shapes on sheets store
 *  sheet-local coords; shapes on the infinite board store world coords). */
function shapeAnchorWorld(
  shape: Shape,
  sheetOriginX: number,
  sheetOriginY: number,
): { x: number; y: number } {
  return { x: sheetOriginX + shape.x, y: sheetOriginY + shape.y };
}

// Gap (in screen px) between the top of the shape and the bottom of the
// toolbar. Keeps the bar from sitting on the shape's resize handles.
const GAP_PX = 8;
// Estimated toolbar height (~h-8 + border); used for off-top clamp. A ref
// measurement would be more precise but this is within 2 px of actual.
const EST_HEIGHT_PX = 34;

export function SelectionToolbar() {
  const selectionToolbarShapeId = useStore((s) => s.selectionToolbarShapeId);
  const shapes = useStore((s) => s.shapes);
  const sheets = useStore((s) => s.sheets);
  const zoom = useStore((s) => s.zoom);
  const pan = useStore((s) => s.pan);
  const tool = useStore((s) => s.tool);
  const editingTextShapeId = useStore((s) => s.editingTextShapeId);
  const updateShape = useStore((s) => s.updateShape);
  const duplicateShape = useStore((s) => s.duplicateShape);
  const deleteShape = useStore((s) => s.deleteShape);
  const copyShape = useStore((s) => s.copyShape);
  const cutShape = useStore((s) => s.cutShape);
  const hideSelectionToolbar = useStore((s) => s.hideSelectionToolbar);

  // Dismiss on Escape + left mousedown outside the toolbar. Uses a data
  // attribute on the ContextMenu root so clicks on menu items don't close
  // this toolbar — the two live together after a right-click, and only a
  // real "click away" should retire both.
  useEffect(() => {
    if (!selectionToolbarShapeId) return;
    function onDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const target = e.target as Element | null;
      if (!target) return;
      if (target.closest("[data-selection-toolbar]")) return;
      if (target.closest("[data-context-menu]")) return;
      hideSelectionToolbar();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") hideSelectionToolbar();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [selectionToolbarShapeId, hideSelectionToolbar]);

  // Clear a stale id after the referenced shape is deleted (Cut/Delete).
  // Without this, the store would hold a pointer to a nonexistent shape —
  // harmless for rendering (visibility guard returns null) but untidy and
  // could confuse future code that watches this field.
  useEffect(() => {
    if (!selectionToolbarShapeId) return;
    const exists = shapes.some((s) => s.id === selectionToolbarShapeId);
    if (!exists) hideSelectionToolbar();
  }, [selectionToolbarShapeId, shapes, hideSelectionToolbar]);

  // Visibility gates — each returns null for a reason we've decided not to
  // surface the bar. Order matters only for readability; any true-gate bails.
  if (!selectionToolbarShapeId) return null;
  const shape = shapes.find((s) => s.id === selectionToolbarShapeId);
  if (!shape) return null;

  // Skip shape types that already have a dedicated toolbar.
  if (shape.type === "image") return null;
  // Stickies get their own selection-time toolbar (StickyFormatBar) with
  // sticky-only controls (color picker, header/body field-edit). Hide here so
  // the two bars don't stack on top of each other.
  if (shape.type === "sticky") return null;
  // Skip while editing a text shape — TextFormatBar owns the airspace.
  if (editingTextShapeId && editingTextShapeId === shape.id) return null;
  // Don't compete with drawing/placement tools. Appears only in select mode
  // (same rule used by other selection-driven affordances like handles).
  if (tool !== "select") return null;

  const sheet = sheets.find((s) => s.id === shape.sheetId);
  const originX = sheet?.x ?? 0;
  const originY = sheet?.y ?? 0;
  const anchor = shapeAnchorWorld(shape, originX, originY);

  // world → screen. worldGroup applies `scale(zoom)` and `translate(pan)`,
  // so this mirrors Konva's internal transform pipeline exactly.
  const screenX = worldToScreen(anchor.x, zoom) + pan.x;
  const screenY = worldToScreen(anchor.y, zoom) + pan.y;

  // Clamp so the toolbar never renders above the viewport top. When the
  // shape's top edge is near y=0 we push the bar below the shape instead of
  // off-screen (future refinement: flip the whole arrangement below so the
  // bar sits under the shape when above would clip).
  const top = Math.max(4, screenY - GAP_PX - EST_HEIGHT_PX);

  const isLocked = shape.locked;
  const isVisible = shape.visible;

  return (
    <div
      role="toolbar"
      aria-label={`Actions for ${shape.name}`}
      data-selection-toolbar
      className="absolute z-30 flex items-center gap-0.5 px-1 py-1 rounded-md border border-ink-700 bg-ink-900 text-ink-100 shadow-lg"
      style={{ left: screenX, top }}
      // Swallow context-menus on the toolbar itself — a right-click on one
      // of our buttons shouldn't reopen the canvas context menu under it.
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      // Stop mouse-down from reaching the Canvas so clicking a button
      // doesn't start a marquee or drop a shape under the toolbar.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ToolbarButton
        title="Duplicate"
        onClick={() => duplicateShape(shape.id)}
        Icon={CopyPlus}
      />
      <ToolbarButton
        title="Copy"
        onClick={() => copyShape(shape.id)}
        Icon={Copy}
      />
      <ToolbarButton
        title="Cut"
        // Cut deletes the shape, so retire the bar — without this the
        // cleanup effect would catch it, but an explicit call is clearer.
        onClick={() => {
          cutShape(shape.id);
          hideSelectionToolbar();
        }}
        Icon={Scissors}
      />
      <div className="w-px h-4 bg-ink-700/80 mx-0.5" />
      <ToolbarButton
        title={isLocked ? "Unlock" : "Lock"}
        onClick={() => updateShape(shape.id, { locked: !isLocked })}
        Icon={isLocked ? Unlock : Lock}
      />
      <ToolbarButton
        title={isVisible ? "Hide" : "Unhide"}
        onClick={() => updateShape(shape.id, { visible: !isVisible })}
        Icon={isVisible ? EyeOff : Eye}
      />
      <div className="w-px h-4 bg-ink-700/80 mx-0.5" />
      <ToolbarButton
        title="Delete"
        onClick={() => {
          deleteShape(shape.id);
          hideSelectionToolbar();
        }}
        Icon={Trash2}
        danger
      />
    </div>
  );
}

function ToolbarButton({
  title,
  onClick,
  Icon,
  danger = false,
}: {
  title: string;
  onClick: () => void;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`w-7 h-7 inline-flex items-center justify-center rounded transition-colors ${
        danger
          ? "text-red-400 hover:bg-red-500/15"
          : "text-ink-100 hover:bg-ink-700/60"
      }`}
    >
      <Icon size={14} />
    </button>
  );
}
