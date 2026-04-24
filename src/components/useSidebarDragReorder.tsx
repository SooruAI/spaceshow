import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";

// ─────────────────────────────────────────────────────────────────────────────
// useSidebarDragReorder — native HTML5 drag-and-drop for the Sheets & Layers
// sidebar. Returns `dragProps(entity, id, scope, idx)` spread onto every row,
// an `insertionLine` element the caller mounts once inside the scroll
// container, and a `dragging` boolean for CSS hooks.
//
// Design:
//   - One draggable row at a time; we stash the src in a ref at dragstart.
//   - `scope` is a string identifier the caller builds ("sheets" |
//     `"shapes:<sheetId>"` | `"group:<gid>"`) — drops only fire when the hover
//     scope is compatible with the source (sheets→sheets, shapes→shapes|group).
//   - Drop target index computed from pointer Y vs the row's bounding rect
//     midpoint. `side === "before"` → insertAt = row's scope-idx; "after" →
//     insertAt = row's scope-idx + 1.
//   - Rows are stored visually REVERSED in the sidebar (top of list = highest
//     array index). Callers pass `idx` as the scope-relative REVERSED visual
//     index; we translate to the underlying scope index before dispatching.
// ─────────────────────────────────────────────────────────────────────────────

export type DragEntity = "sheet" | "shape";

interface DragSource {
  entity: DragEntity;
  id: string;
  scope: string; // e.g. "sheets" | "shapes:sheet_1" | "shapes:board"
  scopeSize: number; // length of the source's scope (for index translation)
  visualIdx: number; // source row's REVERSED visual index within its scope
}

interface DropHint {
  targetId: string; // row we're hovering over
  scope: string; // scope of the target row
  side: "before" | "after" | "onto";
  /** Absolute screen Y of the insertion line (relative to the nearest
   *  `relative` positioned ancestor — which the caller provides). */
  lineY: number;
  /** Width in px of the insertion line (= the target row's width). */
  lineWidth: number;
  /** Left offset of the insertion line. */
  lineX: number;
  /** When set, `side === "onto"` highlighted the whole target row instead of a
   *  thin line. Tells the UI to render a full-row ring instead of the line. */
  onto?: boolean;
}

export interface RowDragProps {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  "data-drag-scope": string;
  "data-drag-source"?: "true";
}

export function useSidebarDragReorder(
  // React 19's `useRef<T>(null)` returns `RefObject<T | null>`, so match that
  // shape to avoid forcing casts at every caller.
  containerRef: React.RefObject<HTMLElement | null>,
) {
  const moveShapeToIndex = useStore((s) => s.moveShapeToIndex);
  const moveSheetToIndex = useStore((s) => s.moveSheetToIndex);

  const srcRef = useRef<DragSource | null>(null);
  // Store the drop hint in both a ref AND state: the ref lets `onDrop` read the
  // latest hint synchronously (important when drag events fire in rapid
  // succession and React hasn't re-rendered yet), while the state drives the
  // insertion-line re-render.
  const hintRef = useRef<DropHint | null>(null);
  const [dropHint, setDropHintState] = useState<DropHint | null>(null);
  const setDropHint = useCallback((next: DropHint | null) => {
    hintRef.current = next;
    setDropHintState(next);
  }, []);
  const [dragging, setDragging] = useState(false);

  // Flip a global [data-dragging] attribute on <body> so CSS can apply the
  // grabbing cursor sitewide while a drag is in flight.
  useEffect(() => {
    if (dragging) document.body.setAttribute("data-dragging", "true");
    else document.body.removeAttribute("data-dragging");
    return () => {
      document.body.removeAttribute("data-dragging");
    };
  }, [dragging]);

  // Esc cancels a drag in flight. HTML5 DnD fires `dragend` on Esc anyway, but
  // listening here lets us clear the hint eagerly without relying on the row's
  // dragend firing first (which it always should — this is defensive).
  useEffect(() => {
    if (!dragging) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDropHint(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dragging]);

  const dragProps = useCallback(
    (
      entity: DragEntity,
      id: string,
      scope: string,
      visualIdx: number,
      scopeSize: number,
      opts?: { acceptsOnto?: boolean }
    ): RowDragProps => {
      const isSource = srcRef.current?.id === id && dragging;
      return {
        draggable: true,
        "data-drag-scope": scope,
        "data-drag-source": isSource ? "true" : undefined,
        onDragStart: (e) => {
          srcRef.current = { entity, id, scope, scopeSize, visualIdx };
          e.dataTransfer.effectAllowed = "move";
          // Custom drag-image: use the row itself but offset so the cursor
          // sits a bit inside the row (browser fallback without this is the
          // default ghost which is fine too).
          try {
            const el = e.currentTarget as HTMLElement;
            e.dataTransfer.setDragImage(el, 8, 8);
          } catch {
            /* setDragImage can throw on some browsers; ignore */
          }
          setDragging(true);
        },
        onDragEnd: () => {
          srcRef.current = null;
          setDropHint(null);
          setDragging(false);
        },
        onDragOver: (e) => {
          const src = srcRef.current;
          if (!src) return;
          // Compatibility: sheets can only drop onto sheets; shapes can drop
          // onto other shapes (any sheet scope) or onto a group header.
          const sameEntity =
            (src.entity === "sheet" && scope === "sheets") ||
            (src.entity === "shape" &&
              (scope.startsWith("shapes:") || scope.startsWith("group:")));
          if (!sameEntity) return;
          // Don't hint a drop on the source row itself.
          if (src.id === id && src.scope === scope) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const el = e.currentTarget as HTMLElement;
          const rect = el.getBoundingClientRect();
          const container = containerRef.current;
          const containerRect = container?.getBoundingClientRect();
          // Must add scrollTop/Left: `rect.top - containerRect.top` is the row's
          // offset from the container's VIEWPORT top, but `position: absolute;
          // top: lineY` inside a scrollable container is measured from the
          // content's TOP edge. When scrolled, those two origins differ by
          // scrollTop, so the line drifts upward without this compensation.
          const scrollTop = container?.scrollTop ?? 0;
          const scrollLeft = container?.scrollLeft ?? 0;
          const y = e.clientY - rect.top;
          // Onto-row (join group): only for group scopes, middle 60% of row.
          const inOntoZone =
            opts?.acceptsOnto &&
            src.entity === "shape" &&
            y > rect.height * 0.2 &&
            y < rect.height * 0.8;
          let side: DropHint["side"];
          let lineY: number;
          if (inOntoZone) {
            side = "onto";
            lineY = rect.top - (containerRect?.top ?? 0) + scrollTop;
          } else {
            const isBefore = y < rect.height / 2;
            side = isBefore ? "before" : "after";
            lineY =
              (isBefore ? rect.top : rect.bottom) -
              (containerRect?.top ?? 0) +
              scrollTop;
          }
          setDropHint({
            targetId: id,
            scope,
            side,
            lineY,
            lineX: rect.left - (containerRect?.left ?? 0) + scrollLeft,
            lineWidth: rect.width,
            onto: side === "onto",
          });
        },
        onDrop: (e) => {
          e.preventDefault();
          const src = srcRef.current;
          if (!src) return;
          // Read the hint from the ref, not the closure: onDragOver may have
          // just set it this tick, before React has re-rendered `dragProps`.
          const hint = hintRef.current;
          if (!hint || hint.targetId !== id) return;
          try {
            if (src.entity === "sheet") {
              // Sheets: visualIdx equals array index (no reversal).
              let destIdx = visualIdx + (hint.side === "after" ? 1 : 0);
              // After removing the src row (which is at src.visualIdx), the
              // target's index shifts down by 1 if the src was BEFORE it.
              if (src.visualIdx < destIdx) destIdx -= 1;
              moveSheetToIndex(src.id, destIdx);
            } else if (src.entity === "shape") {
              // Shapes: the sidebar shows scope REVERSED. Translate visual
              // index → scope index. Scope index = (scopeSize - 1) - visualIdx.
              // "before" the target visually = AFTER it in scope order.
              // "after" the target visually = BEFORE it in scope order.
              // (Because reversing a list flips before/after.)
              // Derive target scope id + destScope size at drop time so the
              // math stays honest.
              const targetScope = hint.scope; // e.g. "shapes:sheet_2"
              const targetSheetId = targetScope.startsWith("shapes:")
                ? targetScope.slice("shapes:".length)
                : targetScope.startsWith("group:")
                ? undefined // a group's parent sheet is inferred by the caller via joinGroupId
                : undefined;
              if (hint.side === "onto" && targetScope.startsWith("group:")) {
                // Join the group. Caller supplies the group's id via the scope
                // string; resolve the group's parent sheet from store below.
                const gid = targetScope.slice("group:".length);
                const st = useStore.getState();
                const firstMember = st.shapes.find((sh) => sh.groupId === gid);
                const parentSheetId = firstMember?.sheetId;
                if (!parentSheetId) return;
                // Insert at the end of that group's parent sheet; `moveShapeToIndex`
                // will put the shape at position (scopeSize) = append.
                const parentScopeSize = st.shapes.filter(
                  (sh) => sh.sheetId === parentSheetId && sh.id !== src.id
                ).length;
                moveShapeToIndex(src.id, parentScopeSize, parentSheetId, gid);
                return;
              }
              if (!targetSheetId) return;
              // Find the visual index of this target row in its scope (reversed list).
              // `visualIdx` is passed in already as the reversed index. Translate:
              // destScopeIdxBeforeRemoval = (scopeSize - 1) - visualIdx, adjusted
              // for "after" visually = one slot earlier in scope.
              // For cross-scope drag `scopeSize` here is the TARGET scope length
              // (callers pass scopeSize for their own scope; safe since we're
              // hovering on a row that belongs to targetScope).
              const scopeLen = scopeSize;
              let destScopeIdx: number;
              if (hint.side === "before") {
                // visually before this row = one slot higher in scope order
                destScopeIdx = scopeLen - visualIdx;
              } else {
                // after = same slot as this row (in scope order)
                destScopeIdx = scopeLen - 1 - visualIdx;
              }
              // Same-scope drag: moveShapeToIndex works in POST-removal scope.
              // If src is in the same scope AND its scope position is BEFORE the
              // destination, removing it shifts destScopeIdx down by 1.
              if (src.scope === targetScope) {
                const srcScopeIdx = scopeLen - 1 - src.visualIdx;
                if (srcScopeIdx < destScopeIdx) destScopeIdx -= 1;
              }
              destScopeIdx = Math.max(0, destScopeIdx);
              moveShapeToIndex(src.id, destScopeIdx, targetSheetId);
            }
          } finally {
            srcRef.current = null;
            setDropHint(null);
            setDragging(false);
          }
        },
      };
    },
    // `dropHint` intentionally omitted — reading it from `hintRef` inside
    // onDrop sidesteps a stale-closure bug when dragover→drop happens faster
    // than React can re-render. `setDropHint` is a stable ref-writer.
    [dragging, moveShapeToIndex, moveSheetToIndex, containerRef, setDropHint]
  );

  const insertionLine = dropHint ? (
    dropHint.onto ? (
      <div
        style={{
          position: "absolute",
          left: dropHint.lineX,
          top: dropHint.lineY,
          width: dropHint.lineWidth,
          height: 28, // typical row height
        }}
        className="pointer-events-none ring-2 ring-brand-500 rounded"
      />
    ) : (
      <div
        style={{
          position: "absolute",
          left: dropHint.lineX,
          top: dropHint.lineY - 1,
          width: dropHint.lineWidth,
          height: 2,
        }}
        className="pointer-events-none bg-brand-500 rounded"
      />
    )
  ) : null;

  return { dragProps, insertionLine, dragging };
}
