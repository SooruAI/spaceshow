import { useEffect } from "react";
import { useStore } from "../store";
import type { Shape, Tool } from "../types";

// Platform detection — resolved once.
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

// Pretty-printed key labels for the cheatsheet. "Mod" = Cmd on Mac, Ctrl elsewhere.
const MOD = isMac ? "\u2318" : "Ctrl";
const SHIFT = isMac ? "\u21E7" : "Shift";
const ALT = isMac ? "\u2325" : "Alt";

export interface ShortcutRow {
  keys: string;
  label: string;
  group: string;
}

// Canonical binding list — also rendered by <ShortcutsCheatsheet/>.
export const SHORTCUTS: ShortcutRow[] = [
  // Tools
  { group: "Tools", keys: "V", label: "Select tool" },
  { group: "Tools", keys: "P", label: "Pen tool" },
  { group: "Tools", keys: "E", label: "Eraser" },
  { group: "Tools", keys: "R", label: "Rectangle" },
  { group: "Tools", keys: "L", label: "Line" },
  { group: "Tools", keys: "S", label: "Sticky note" },
  { group: "Tools", keys: "T", label: "Text" },
  { group: "Tools", keys: "C", label: "Comment" },
  { group: "Tools", keys: "U", label: "Upload image" },
  // Selection / Edit
  { group: "Edit", keys: "Esc", label: "Clear selection" },
  { group: "Edit", keys: "Del / Backspace", label: "Delete selected shape" },
  { group: "Edit", keys: `${MOD} D`, label: "Duplicate selected shape or sheet" },
  { group: "Edit", keys: `${MOD} C`, label: "Copy shape" },
  { group: "Edit", keys: `${MOD} X`, label: "Cut shape" },
  { group: "Edit", keys: `${MOD} V`, label: "Paste shape onto active sheet" },
  { group: "Edit", keys: "Arrow keys", label: "Nudge selected shape by 1px" },
  { group: "Edit", keys: `${SHIFT} + Arrow`, label: "Nudge selected shape by 10px" },
  { group: "Edit", keys: `${MOD} Z`, label: "Undo" },
  { group: "Edit", keys: `${MOD} ${SHIFT} Z`, label: "Redo" },
  { group: "Edit", keys: `${MOD} ${SHIFT} H`, label: "Hide / unhide selection" },
  { group: "Edit", keys: `${MOD} ${SHIFT} L`, label: "Lock / unlock selection" },
  { group: "Edit", keys: "[ / ]", label: "Rotate selection \u00b115\u00b0 (Shift \u00b145\u00b0)" },
  { group: "Edit", keys: `${MOD} G`, label: "Group selected shapes" },
  { group: "Edit", keys: `${MOD} ${SHIFT} G`, label: "Ungroup selected shapes" },
  // View
  { group: "View", keys: `${MOD} =`, label: "Zoom in" },
  { group: "View", keys: `${MOD} -`, label: "Zoom out" },
  { group: "View", keys: `${MOD} 0`, label: "Reset zoom" },
  { group: "View", keys: `${MOD} 1`, label: "Fit all sheets" },
  { group: "View", keys: "G", label: "Cycle grid mode" },
  { group: "View", keys: `${SHIFT} R`, label: "Toggle rulers" },
  // Panels
  { group: "Panels", keys: `${MOD} \\`, label: "Toggle left sidebar" },
  { group: "Panels", keys: `${MOD} /`, label: "Toggle right sidebar" },
  { group: "Panels", keys: `${MOD} ${SHIFT} M`, label: "Toggle comments" },
  { group: "Panels", keys: `${MOD} ,`, label: "Toggle settings" },
  // Sheets
  { group: "Sheets", keys: `${MOD} Enter`, label: "Add new sheet" },
  { group: "Sheets", keys: `${MOD} Backspace`, label: "Delete selected sheet" },
  { group: "Sheets", keys: "F2", label: "Rename active sheet" },
  { group: "Sheets", keys: `${ALT} \u2192`, label: "Next sheet" },
  { group: "Sheets", keys: `${ALT} \u2190`, label: "Previous sheet" },
  // Present / Help
  { group: "Present", keys: "F5", label: "Enter present mode" },
  { group: "Help", keys: "?", label: "Show this cheatsheet" },
];

// True if the user is typing into an editable field — shortcuts must yield.
function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

const TOOL_KEYS: Record<string, string> = {
  v: "select",
  p: "pen",
  e: "eraser",
  r: "rect",
  l: "line",
  s: "sticky",
  t: "text",
  c: "comment",
};

// Viewport midpoint is used as the zoom anchor for Mod+=/Mod+-.
function viewportCenter(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

/**
 * Global keyboard shortcut layer. Call once from <App/>. Guards against
 * modifier-prefixed browser commands (Cmd+R, Cmd+T…) so tool letters never
 * steal from the browser.
 */
export function useShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Skip while typing in inputs / contentEditable — let the field handle keys.
      if (isEditableTarget(e.target)) return;

      const mod = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;
      const s = useStore.getState();

      // When SpacePresent is active (selecting modal or presenting fullscreen),
      // its own handler (src/hooks/usePresenterKeys.ts) owns the keyboard.
      // Return early so editor shortcuts don't fire — e.g. Delete/Backspace
      // while presenting would otherwise try to delete a shape in the editor
      // underneath.
      if (s.presentationStatus !== "idle") return;

      // ----- Cheatsheet open/close (works anywhere) -----
      if (!mod && !e.altKey && (key === "?" || (e.shiftKey && key === "/"))) {
        e.preventDefault();
        s.setShowShortcuts(!s.showShortcuts);
        return;
      }

      // ----- Enter: commit an in-progress crop -----
      if (key === "Enter" && s.croppingImageId) {
        e.preventDefault();
        s.endImageCrop(true);
        return;
      }

      // ----- Escape: clear selection / close overlays -----
      if (key === "Escape") {
        if (s.croppingImageId) {
          e.preventDefault();
          s.endImageCrop(false);
          return;
        }
        if (s.editingTextShapeId) {
          s.endTextEdit();
          return;
        }
        if (s.showShortcuts) {
          s.setShowShortcuts(false);
          return;
        }
        // A selected ruler guide is its own focused object — Esc removes it
        // (matches Delete/Backspace behavior the user expects for guides).
        if (s.selectedGuideId) {
          s.deleteGuide(s.selectedGuideId);
          return;
        }
        s.selectShape(null);
        s.selectSheet(null);
        s.setSelectedShapeIds([]);
        s.setSelectedSheetIds([]);
        s.setTool("select");
        return;
      }

      // ----- Group / Ungroup -----
      if (mod && !e.shiftKey && lower === "g") {
        if (s.selectedShapeIds.length >= 2) {
          e.preventDefault();
          s.groupSelected();
          return;
        }
      }
      if (mod && e.shiftKey && lower === "g") {
        if (s.selectedShapeIds.length >= 1 || s.selectedShapeId) {
          e.preventDefault();
          s.ungroupSelected();
          return;
        }
      }

      // ----- Undo / Redo -----
      if (mod && !e.shiftKey && lower === "z") {
        e.preventDefault();
        s.undo();
        return;
      }
      if (mod && e.shiftKey && lower === "z") {
        e.preventDefault();
        s.redo();
        return;
      }

      // ----- Clipboard -----
      if (mod && !e.shiftKey && lower === "c") {
        // Multi-selection copy wins when more than one item is selected.
        if (s.selectedShapeIds.length + s.selectedSheetIds.length > 1) {
          e.preventDefault();
          s.copyMultiToClip(s.selectedShapeIds, s.selectedSheetIds);
          return;
        }
        if (s.selectedShapeId) {
          e.preventDefault();
          s.copyShape(s.selectedShapeId);
          return;
        }
        if (s.selectedSheetId) {
          e.preventDefault();
          s.copySheetToClip(s.selectedSheetId);
          return;
        }
      }
      if (mod && !e.shiftKey && lower === "x") {
        // Multi-selection cut: copy the batch to the multi clipboard, then
        // delete each. Mirrors the context menu's handleCut path (no
        // dedicated multi-cut store action, so we compose one). Same
        // coalesce pattern as multi-duplicate so the whole cut is a single
        // undo step.
        if (s.selectedShapeIds.length + s.selectedSheetIds.length > 1) {
          e.preventDefault();
          s.beginHistoryCoalesce(`multi-cut-${Date.now()}`);
          s.copyMultiToClip(s.selectedShapeIds, s.selectedSheetIds);
          s.selectedShapeIds.forEach((id) => s.deleteShape(id));
          // Sheet deletion guarded by the same "keep at least one sheet
          // around" rule as Mod+Backspace — we can't leave the board empty.
          if (s.sheets.length > s.selectedSheetIds.length) {
            s.selectedSheetIds.forEach((id) => s.deleteSheet(id));
          }
          s.endHistoryCoalesce();
          return;
        }
        if (s.selectedShapeId) {
          e.preventDefault();
          s.cutShape(s.selectedShapeId);
          return;
        }
        // Single-sheet cut: copy to sheet clipboard, then delete. Same
        // "at least one sheet" guard as multi.
        if (s.selectedSheetId && s.sheets.length > 1) {
          e.preventDefault();
          s.copySheetToClip(s.selectedSheetId);
          s.deleteSheet(s.selectedSheetId);
          return;
        }
      }
      if (mod && !e.shiftKey && lower === "v") {
        // Multi paste takes precedence when we have a batched clipboard.
        if (s.clipboard.multi) {
          e.preventDefault();
          s.pasteMultiFromClip();
          return;
        }
        if (s.clipboard.shape) {
          e.preventDefault();
          s.pasteShape();
          return;
        }
        if (s.clipboard.sheet) {
          e.preventDefault();
          s.pasteSheetFromClip();
          return;
        }
      }

      // ----- Duplicate -----
      if (mod && !e.shiftKey && lower === "d") {
        // Multi-selection: duplicate every selected shape AND sheet.
        const multiShapes = s.selectedShapeIds;
        const multiSheets = s.selectedSheetIds;
        if (multiShapes.length + multiSheets.length > 1) {
          e.preventDefault();
          s.beginHistoryCoalesce(`multi-dup-${Date.now()}`);
          multiShapes.forEach((id) => s.duplicateShape(id));
          multiSheets.forEach((id) => s.duplicateSheet(id));
          s.endHistoryCoalesce();
          return;
        }
        if (s.selectedShapeId) {
          e.preventDefault();
          s.duplicateShape(s.selectedShapeId);
          return;
        }
        if (s.selectedSheetId) {
          e.preventDefault();
          s.duplicateSheet(s.selectedSheetId);
          return;
        }
      }

      // ----- Hide / Unhide multi-selection (Cmd/Ctrl + Shift + H) -----
      if (mod && e.shiftKey && lower === "h") {
        const shapeSel = s.selectedShapeIds;
        const sheetSel = s.selectedSheetIds;
        if (shapeSel.length + sheetSel.length === 0) return;
        e.preventDefault();
        // If ANY selected item is currently visible/unhidden, hide the batch;
        // otherwise flip them all back on. Mirrors Finder's "Show/Hide" toggle.
        const anyVisible =
          s.shapes.some((sh) => shapeSel.includes(sh.id) && sh.visible) ||
          s.sheets.some((sh) => sheetSel.includes(sh.id) && !sh.hidden);
        s.setMultiVisible(!anyVisible);
        return;
      }

      // ----- Lock / Unlock multi-selection (Cmd/Ctrl + Shift + L) -----
      if (mod && e.shiftKey && lower === "l") {
        const shapeSel = s.selectedShapeIds;
        const sheetSel = s.selectedSheetIds;
        if (shapeSel.length + sheetSel.length === 0) return;
        e.preventDefault();
        const anyUnlocked =
          s.shapes.some((sh) => shapeSel.includes(sh.id) && !sh.locked) ||
          s.sheets.some((sh) => sheetSel.includes(sh.id) && !sh.locked);
        s.setMultiLocked(anyUnlocked);
        return;
      }

      // ----- Rotate multi-selection by 15° increments ([ = CCW, ] = CW) -----
      if (!mod && !e.altKey && (key === "[" || key === "]")) {
        if (
          s.selectedShapeIds.length + s.selectedSheetIds.length === 0
        ) {
          return;
        }
        e.preventDefault();
        const step = e.shiftKey ? 45 : 15;
        s.rotateSelectedBy(key === "]" ? step : -step);
        return;
      }

      // ----- Zoom (Mod += / -- / 0 / 1) -----
      if (mod && (key === "=" || key === "+")) {
        e.preventDefault();
        const c = viewportCenter();
        s.zoomAt(1.1, c.x, c.y);
        return;
      }
      if (mod && key === "-") {
        e.preventDefault();
        const c = viewportCenter();
        s.zoomAt(1 / 1.1, c.x, c.y);
        return;
      }
      if (mod && key === "0") {
        e.preventDefault();
        s.setZoom(1);
        s.setPan({ x: 0, y: 0 });
        return;
      }
      if (mod && key === "1") {
        e.preventDefault();
        s.fitAllSheets(window.innerWidth, window.innerHeight);
        return;
      }

      // ----- Panels -----
      if (mod && !e.shiftKey && key === "\\") {
        e.preventDefault();
        s.setShowLeftSidebar(!s.showLeftSidebar);
        return;
      }
      if (mod && !e.shiftKey && key === "/") {
        e.preventDefault();
        s.openRightPanel(s.showRightSidebar ? null : "views");
        return;
      }
      if (mod && e.shiftKey && lower === "m") {
        e.preventDefault();
        s.openRightPanel(s.showComments ? null : "comments");
        return;
      }
      if (mod && !e.shiftKey && key === ",") {
        e.preventDefault();
        s.setShowSettings(!s.showSettings);
        return;
      }

      // ----- Sheet add / delete / rename -----
      if (mod && key === "Enter") {
        e.preventDefault();
        s.addSheet();
        return;
      }
      if (mod && (key === "Backspace" || key === "Delete")) {
        const target = s.selectedSheetId;
        if (target && s.sheets.length > 1) {
          e.preventDefault();
          if (window.confirm("Delete this sheet and all its shapes?")) {
            s.deleteSheet(target);
          }
        }
        return;
      }
      if (!mod && !e.shiftKey && !e.altKey && key === "F2") {
        const id = s.selectedSheetId || s.activeSheetId;
        if (id) {
          e.preventDefault();
          s.startRenameSheet(id);
        }
        return;
      }

      // ----- Alt+ArrowLeft / ArrowRight: cycle sheets -----
      if (e.altKey && !mod && !e.shiftKey && (key === "ArrowRight" || key === "ArrowLeft")) {
        const idx = s.sheets.findIndex((sh) => sh.id === (s.selectedSheetId || s.activeSheetId));
        if (idx === -1 || s.sheets.length === 0) return;
        const dir = key === "ArrowRight" ? 1 : -1;
        const next = s.sheets[(idx + dir + s.sheets.length) % s.sheets.length];
        if (!next) return;
        e.preventDefault();
        s.setActiveSheet(next.id);
        s.selectSheet(next.id);
        // Pan viewport so the newly-focused sheet is roughly centered.
        const cx = next.x + next.width / 2;
        const cy = next.y + next.height / 2;
        s.setPan({
          x: window.innerWidth / 2 - cx * s.zoom,
          y: window.innerHeight / 2 - cy * s.zoom,
        });
        return;
      }

      // ----- Present -----
      // F5 mirrors the PowerPoint/Keynote convention for starting a show.
      // We preventDefault to stop the browser reload; the check for no
      // modifiers (!mod && !e.shiftKey && !e.altKey) keeps Ctrl+F5 and
      // Shift+F5 free as browser hard-reload shortcuts in development.
      if (key === "F5" && !mod && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        s.startPresentation();
        return;
      }

      // ----- Delete/Backspace on shape (no modifier) -----
      if (!mod && !e.altKey && (key === "Delete" || key === "Backspace")) {
        // Selected ruler guide takes priority — same key, dedicated target.
        if (s.selectedGuideId) {
          e.preventDefault();
          s.deleteGuide(s.selectedGuideId);
          return;
        }
        // Multi-selection: delete every selected shape in one undo step.
        if (s.selectedShapeIds.length > 1) {
          e.preventDefault();
          s.beginHistoryCoalesce(`multi-del-${Date.now()}`);
          s.selectedShapeIds.forEach((id) => s.deleteShape(id));
          s.endHistoryCoalesce();
          return;
        }
        if (s.selectedShapeId) {
          e.preventDefault();
          useStore.getState().deleteShape(s.selectedShapeId);
        }
        return;
      }

      // ----- Slide-mode prev/next (no shape selected) -----
      // Plain Left/Right arrows in slide mode step between slides when there's
      // no active shape selection — wrap-free (clamped at first/last). PageUp /
      // PageDown work in slide mode regardless of selection (matches keynote).
      // Shape-nudge below still wins when something is selected.
      if (
        s.viewMode === "slide" &&
        !mod &&
        !e.altKey &&
        !e.shiftKey &&
        !s.selectedShapeId &&
        s.selectedShapeIds.length === 0 &&
        (key === "ArrowLeft" || key === "ArrowRight")
      ) {
        e.preventDefault();
        s.gotoSlideByOffset(key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (s.viewMode === "slide" && !mod && (key === "PageUp" || key === "PageDown")) {
        e.preventDefault();
        s.gotoSlideByOffset(key === "PageDown" ? 1 : -1);
        return;
      }

      // ----- Arrow nudge (no modifier, or only Shift) -----
      if (
        !mod &&
        !e.altKey &&
        (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight")
      ) {
        const id = s.selectedShapeId;
        if (!id) return;
        const sh = s.shapes.find((x) => x.id === id);
        if (!sh) return;
        const step = e.shiftKey ? 10 : 1;
        const dx =
          key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
        const dy =
          key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
        if (typeof sh.x === "number" && typeof sh.y === "number") {
          e.preventDefault();
          s.updateShape(id, { x: sh.x + dx, y: sh.y + dy } as Partial<Shape>);
        }
        return;
      }

      // ----- View toggles: G (grid cycle), Shift+R (rulers) -----
      if (!mod && !e.altKey && !e.shiftKey && lower === "g") {
        e.preventDefault();
        const modes: Array<"plain" | "dots" | "lines"> = ["plain", "dots", "lines"];
        const i = modes.indexOf(s.gridMode);
        s.setGridMode(modes[(i + 1) % modes.length]);
        return;
      }
      if (!mod && !e.altKey && e.shiftKey && lower === "r") {
        e.preventDefault();
        const both = s.showRulerH && s.showRulerV;
        s.setShowRulerBoth(!both);
        return;
      }

      // ----- Tool letter shortcuts — must NOT fire with any modifier. -----
      if (mod || e.altKey) return;
      // Upload image — dispatched via a tiny custom event so App can open its file picker.
      if (!e.shiftKey && lower === "u") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("spaceshow:upload"));
        return;
      }
      if (!e.shiftKey && lower in TOOL_KEYS) {
        e.preventDefault();
        s.setTool(TOOL_KEYS[lower] as Tool);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
