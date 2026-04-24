import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Circle,
  Cloud,
  Diamond,
  FileText,
  Group as GroupIcon,
  Heart,
  Hexagon,
  Image as ImageIcon,
  Minus,
  Octagon,
  PanelLeftClose,
  Pen,
  Square,
  Star,
  StickyNote,
  Triangle,
  Type,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import type { Shape } from "../types";
import {
  RowReorderControl,
  RowRightControls,
} from "./LeftSidebarRowControls";
import type { MoveDirection } from "./LeftSidebarRowControls";
import { useSidebarDragReorder } from "./useSidebarDragReorder";
import { SheetsTab } from "./SheetsTab";

// Stable function-type alias so rows can declare the prop without re-importing
// the hook's internals. Matches the hook's `dragProps` return shape.
type DragPropsFn = ReturnType<typeof useSidebarDragReorder>["dragProps"];

function shapeIcon(sh: Shape) {
  if (sh.type === "shape") {
    // Text elements live as transparent rectangles with text content; show
    // the Type icon for those so they read as text in the layer panel.
    if (sh.kind === "rectangle" && sh.text && sh.text.text.length > 0 && (sh.style.fillOpacity ?? 1) === 0 && !sh.style.borderEnabled) {
      return <Type size={12} />;
    }
    switch (sh.kind) {
      case "rectangle": return <Square size={12} />;
      case "ellipse": return <Circle size={12} />;
      case "triangle": return <Triangle size={12} />;
      case "star": return <Star size={12} />;
      case "cloud": return <Cloud size={12} />;
      case "diamond": return <Diamond size={12} />;
      case "heart": return <Heart size={12} />;
      case "rhombus": return <Diamond size={12} />;
      case "tickbox": return <CheckSquare size={12} />;
      case "polygon": return <Hexagon size={12} />;
      case "arrow-left": return <ArrowLeft size={12} />;
      case "arrow-right": return <ArrowRight size={12} />;
      case "arrow-up": return <ArrowUp size={12} />;
      case "arrow-down": return <ArrowDown size={12} />;
      default: return <Octagon size={12} />;
    }
  }
  switch (sh.type) {
    case "rect": return <Square size={12} />;
    case "sticky": return <StickyNote size={12} />;
    case "pen": return <Pen size={12} />;
    case "image": return <ImageIcon size={12} />;
    case "line": return <Minus size={12} />;
  }
}

export function LeftSidebar() {
  const selectedShapeIds = useStore((s) => s.selectedShapeIds);
  const setSelectedShapeIds = useStore((s) => s.setSelectedShapeIds);
  const groupSelected = useStore((s) => s.groupSelected);
  const tab = useStore((s) => s.leftSidebarTab);
  const setTab = useStore((s) => s.setLeftSidebarTab);
  const setShowLeftSidebar = useStore((s) => s.setShowLeftSidebar);

  return (
    <div className="w-60 bg-ink-900 border-r border-ink-700 flex flex-col">
      {/* Tab bar — segmented pill that toggles between the Sheets navigator
          and the Layers tree. The collapse button sits on the right edge,
          absolutely-positioned so the tab pill stays visually centered. */}
      <div className="relative px-2 pt-3 pb-2 border-b border-ink-800 flex justify-center">
        <div
          role="tablist"
          aria-label="Left sidebar tabs"
          className="inline-flex items-center gap-0.5 bg-ink-800 rounded-full p-0.5 border border-ink-700"
        >
          {(["sheets", "layers"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={
                "h-7 px-4 text-[12px] font-medium rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 " +
                (tab === id
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-ink-300 hover:text-ink-100")
              }
            >
              {id === "sheets" ? "Sheets" : "Layers"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowLeftSidebar(false)}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-400 hover:text-ink-100 hover:bg-ink-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Selection toolbar — appears whenever ≥2 shapes are in the multi-
          selection, giving one-click access to Group without needing the More
          menu or a keyboard shortcut. Mounted above the tab body so it stays
          pinned regardless of scroll position. */}
      {selectedShapeIds.length >= 2 && (
        <div className="px-2 py-1.5 border-b border-ink-800 flex items-center gap-2 bg-ink-800/40">
          <span className="text-[11px] text-ink-300">
            {selectedShapeIds.length} selected
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => groupSelected()}
              className="text-[11px] px-2 py-0.5 rounded bg-brand-500 text-white hover:bg-brand-400 transition-colors"
              title="Group selected shapes"
            >
              Group
            </button>
            <button
              type="button"
              onClick={() => setSelectedShapeIds([])}
              className="text-[11px] px-2 py-0.5 rounded bg-ink-700 text-ink-200 hover:bg-ink-600 transition-colors"
              title="Clear selection"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Tab body — only one tab is mounted at a time, so each tab owns its
          own `scrollRef` + drag-reorder hook instance without conflicts.
          Profile + Settings moved to the BottomBar; no sidebar footer
          needed here. */}
      {tab === "sheets" ? <SheetsTab /> : <LayersTab />}
    </div>
  );
}

// ── LayersTab ─────────────────────────────────────────────────────────────
// The existing Sheet→shapes→groups tree plus the "Board layers (free)"
// section, lifted into its own component unchanged. Keeps all existing
// behavior — drag-reorder, Hide/Lock/More menus, inline rename, group
// expansion — untouched. Only the framing changed.

function LayersTab() {
  const sheets = useStore((s) => s.sheets);
  const shapes = useStore((s) => s.shapes);

  // Reverse so the sidebar reads top→bottom as highest z-index → lowest,
  // matching the per-sheet treatment below and the Konva draw order.
  const boardLayers = shapes
    .filter((sh) => sh.sheetId === "board")
    .slice()
    .reverse();

  // The drag-reorder hook owns its own drag state + the floating insertion
  // line. `dragProps(entity, id, scope, visualIdx, scopeSize, opts?)` is
  // spread onto every row wrapper; `insertionLine` mounts once inside the
  // `relative`-positioned scroll container so its absolute coords line up.
  const scrollRef = useRef<HTMLDivElement>(null);
  const { dragProps, insertionLine } = useSidebarDragReorder(scrollRef);

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 overflow-y-auto scroll-thin py-1"
    >
      {sheets.map((sheet, idx) => (
        <SheetRow
          key={sheet.id}
          sheet={sheet}
          sheetIndex={idx}
          totalSheets={sheets.length}
          dragProps={dragProps}
        />
      ))}

      {boardLayers.length > 0 && (
        <div className="mt-2 border-t border-ink-800 pt-2">
          <div className="px-3 text-[10px] uppercase tracking-wider text-ink-400 mb-1">
            Board layers (free)
          </div>
          <div className="px-2">
            {boardLayers.map((sh, i) => (
              <ShapeRow
                key={sh.id}
                shape={sh}
                bypassGroupOnSelect={false}
                dragProps={dragProps}
                scope="shapes:board"
                visualIdx={i}
                scopeSize={boardLayers.length}
              />
            ))}
          </div>
        </div>
      )}

      {insertionLine}
    </div>
  );
}

// ── SheetRow ──────────────────────────────────────────────────────────────
//
// Extracted so each row owns its RowControls + inline-rename state. The row
// renders: caret (expand/collapse), Reorder, FileText, name-or-input,
// count-badge (auto-hidden on hover), Hide, Lock, More.

function SheetRow({
  sheet,
  sheetIndex,
  totalSheets,
  dragProps,
}: {
  sheet: { id: string; name: string; locked: boolean; hidden: boolean };
  sheetIndex: number;
  totalSheets: number;
  dragProps: DragPropsFn;
}) {
  const activeSheetId = useStore((s) => s.activeSheetId);
  const selectedSheetId = useStore((s) => s.selectedSheetId);
  const expanded = useStore((s) => s.expandedSheets);
  const shapes = useStore((s) => s.shapes);
  const clipboard = useStore((s) => s.clipboard);
  const renamingSheetId = useStore((s) => s.renamingSheetId);

  const setActiveSheet = useStore((s) => s.setActiveSheet);
  const selectSheet = useStore((s) => s.selectSheet);
  const toggleExpanded = useStore((s) => s.toggleSheetExpanded);
  const toggleSheetHidden = useStore((s) => s.toggleSheetHidden);
  const toggleSheetLocked = useStore((s) => s.toggleSheetLocked);
  const duplicateSheet = useStore((s) => s.duplicateSheet);
  const deleteSheet = useStore((s) => s.deleteSheet);
  const renameSheet = useStore((s) => s.renameSheet);
  const copySheetToClip = useStore((s) => s.copySheetToClip);
  const pasteSheetFromClip = useStore((s) => s.pasteSheetFromClip);
  const startRenameSheet = useStore((s) => s.startRenameSheet);
  const stopRenameSheet = useStore((s) => s.stopRenameSheet);
  const moveSheetUp = useStore((s) => s.moveSheetUp);
  const moveSheetDown = useStore((s) => s.moveSheetDown);
  const moveSheetToTop = useStore((s) => s.moveSheetToTop);
  const moveSheetToBottom = useStore((s) => s.moveSheetToBottom);

  const isActive = sheet.id === activeSheetId;
  const isSelected = sheet.id === selectedSheetId;
  const isOpen = !!expanded[sheet.id];
  const sheetShapes = shapes.filter((sh) => sh.sheetId === sheet.id).slice().reverse();
  const isRenaming = renamingSheetId === sheet.id;

  const canPaste = !!(clipboard.sheet || clipboard.multi);
  const canCutOrDelete = totalSheets > 1;

  function onMove(dir: MoveDirection) {
    if (dir === "up") moveSheetUp(sheet.id);
    else if (dir === "down") moveSheetDown(sheet.id);
    else if (dir === "top") moveSheetToTop(sheet.id);
    else if (dir === "bottom") moveSheetToBottom(sheet.id);
  }

  function cutSheet() {
    // Composite: copy to clipboard, then delete. Guarded against orphaning.
    if (!canCutOrDelete) return;
    copySheetToClip(sheet.id);
    deleteSheet(sheet.id);
  }

  return (
    <div className="select-none">
      <div
        data-row-id={sheet.id}
        {...dragProps("sheet", sheet.id, "sheets", sheetIndex, totalSheets)}
        className={`group relative flex items-center gap-1 pl-2 pr-2 h-8 cursor-pointer ${
          isActive ? "row-active" : isSelected ? "row-selected" : "hover:bg-ink-700"
        }`}
        onClick={() => {
          setActiveSheet(sheet.id);
          selectSheet(sheet.id);
        }}
      >
        <button
          className="p-0.5 text-ink-400 hover:text-white shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded(sheet.id);
          }}
          aria-label={isOpen ? "Collapse sheet" : "Expand sheet"}
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {/* Reorder sits between the caret and the type-icon. */}
        <RowReorderControl
          entity="sheet"
          canUp={sheetIndex > 0}
          canDown={sheetIndex < totalSheets - 1}
          onMove={onMove}
          forceVisible={isActive || isSelected}
        />
        <FileText size={13} className="text-ink-300 shrink-0" />
        {isRenaming ? (
          <RenameInput
            initialValue={sheet.name}
            ariaLabel={`Rename sheet ${sheet.name}`}
            onCommit={(v) => {
              renameSheet(sheet.id, v);
              stopRenameSheet();
            }}
            onCancel={() => stopRenameSheet()}
          />
        ) : (
          <span className="text-sm flex-1 truncate">{sheet.name}</span>
        )}
        {/* Count hides on hover so the row controls breathe. */}
        {!isRenaming && (
          <span className="text-[10px] text-ink-400 group-hover:hidden shrink-0">
            {sheetShapes.length}
          </span>
        )}
        {/* Right cluster — Hide / Lock / More. */}
        {!isRenaming && (
          <RowRightControls
            entity="sheet"
            hidden={sheet.hidden}
            locked={sheet.locked}
            canCut={canCutOrDelete}
            canPaste={canPaste}
            forceVisible={isActive || isSelected}
            onToggleHidden={() => toggleSheetHidden(sheet.id)}
            onToggleLocked={() => toggleSheetLocked(sheet.id)}
            onDuplicate={() => duplicateSheet(sheet.id)}
            onCut={cutSheet}
            onCopy={() => copySheetToClip(sheet.id)}
            onPaste={pasteSheetFromClip}
            onRenameRequest={() => startRenameSheet(sheet.id)}
            onDelete={() => {
              if (!canCutOrDelete) return;
              deleteSheet(sheet.id);
            }}
          />
        )}
      </div>
      {isOpen && (
        <div className="pl-7 pr-1 pb-1">
          {sheetShapes.length === 0 && (
            <div className="text-[11px] text-ink-500 px-2 py-1">No layers</div>
          )}
          <SheetShapeList
            shapes={sheetShapes}
            sheetId={sheet.id}
            dragProps={dragProps}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Renders a sheet's shape list with implicit groups: shapes sharing a
 * `groupId` collapse under a synthetic "Group" header that can be expanded.
 * Group expansion state is reused from the existing `expandedSheets` dict
 * with a `"group:" + groupId` key prefix.
 */
function SheetShapeList({
  shapes,
  sheetId,
  dragProps,
}: {
  shapes: Shape[];
  sheetId: string;
  dragProps: DragPropsFn;
}) {
  // Walk the shape list in order. When we hit a shape with a groupId we
  // haven't emitted yet, render the whole group as one nested block so
  // siblings stay together regardless of insertion order.
  const seenGroups = new Set<string>();
  const rows: { kind: "shape" | "group"; shapes: Shape[]; gid?: string }[] = [];
  for (const sh of shapes) {
    if (sh.groupId) {
      if (seenGroups.has(sh.groupId)) continue;
      seenGroups.add(sh.groupId);
      const members = shapes.filter((x) => x.groupId === sh.groupId);
      rows.push({ kind: "group", shapes: members, gid: sh.groupId });
    } else {
      rows.push({ kind: "shape", shapes: [sh] });
    }
  }

  // `shapes` here is the SHEET's reversed list — visualIdx for each row maps
  // to position in that list, and scopeSize is its length. Nested group
  // members share the same scope (they live in the sheet's shape array), so
  // they use the same sheet-relative visualIdx. This keeps cross-scope drag
  // math consistent regardless of whether a shape is rendered under a group
  // header or directly in the sheet.
  const scope = `shapes:${sheetId}`;
  const scopeSize = shapes.length;

  return (
    <>
      {rows.map((row, i) => {
        if (row.kind === "shape") {
          const sh = row.shapes[0];
          const visualIdx = shapes.findIndex((x) => x.id === sh.id);
          return (
            <ShapeRow
              key={sh.id}
              shape={sh}
              bypassGroupOnSelect={false}
              dragProps={dragProps}
              scope={scope}
              visualIdx={visualIdx}
              scopeSize={scopeSize}
            />
          );
        }
        const gid = row.gid!;
        return (
          <GroupRow
            key={`g-${gid}`}
            gid={gid}
            members={row.shapes}
            fallbackLabel={`Group ${i + 1}`}
            sheetId={sheetId}
            scopeShapes={shapes}
            scopeSize={scopeSize}
            dragProps={dragProps}
          />
        );
      })}
    </>
  );
}

// ── GroupRow ──────────────────────────────────────────────────────────────
// Full controls: block-level reorder (whole group moves as one), Hide / Lock
// across members, and a More menu with Duplicate, Rename, Ungroup, Delete.

function GroupRow({
  gid,
  members,
  fallbackLabel,
  sheetId,
  scopeShapes,
  scopeSize,
  dragProps,
}: {
  gid: string;
  members: Shape[];
  /** Used only when `groupMeta[gid]` has no `name`. Typically "Group N" based
   *  on the row's position within its sheet. */
  fallbackLabel: string;
  sheetId: string;
  /** The sheet's reversed shape list — members find their visual index in
   *  here, not in `members`, so cross-scope drag math stays scope-relative. */
  scopeShapes: Shape[];
  scopeSize: number;
  dragProps: DragPropsFn;
}) {
  const shapes = useStore((s) => s.shapes);
  const selectedShapeId = useStore((s) => s.selectedShapeId);
  const selectShape = useStore((s) => s.selectShape);
  const expanded = useStore((s) => s.expandedSheets);
  const toggleExpanded = useStore((s) => s.toggleSheetExpanded);
  const updateShape = useStore((s) => s.updateShape);
  const groupMeta = useStore((s) => s.groupMeta);
  const setGroupName = useStore((s) => s.setGroupName);
  const moveGroupUp = useStore((s) => s.moveGroupUp);
  const moveGroupDown = useStore((s) => s.moveGroupDown);
  const moveGroupToTop = useStore((s) => s.moveGroupToTop);
  const moveGroupToBottom = useStore((s) => s.moveGroupToBottom);
  const duplicateGroup = useStore((s) => s.duplicateGroup);
  const deleteGroup = useStore((s) => s.deleteGroup);
  const ungroupGroup = useStore((s) => s.ungroupGroup);

  const open = !!expanded["group:" + gid];
  const groupIsSelected = members.some((m) => m.id === selectedShapeId);
  const allHidden = members.every((m) => !m.visible);
  const allLocked = members.every((m) => m.locked);
  const memberScope = `shapes:${sheetId}`;
  const label = groupMeta[gid]?.name ?? fallbackLabel;
  // Inline-rename state is local: the sidebar only ever has one group being
  // renamed at a time in practice, and a dedicated store field would force
  // `groupSelected`/`ungroupSelected` to reason about it. Local state keeps
  // that blast radius small.
  const [isRenaming, setIsRenaming] = useState(false);

  // Scope-aware reorder availability: "up" is possible when at least one
  // non-member scope shape has a HIGHER array index than the last member;
  // "down" is possible when at least one has a LOWER index than the first.
  const memberIdSet = new Set(members.map((m) => m.id));
  const sheetIdx: number[] = [];
  for (let i = 0; i < shapes.length; i++) {
    if (shapes[i].sheetId === sheetId) sheetIdx.push(i);
  }
  const firstMemberAbs = shapes.findIndex((sh) => memberIdSet.has(sh.id));
  let lastMemberAbs = -1;
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (memberIdSet.has(shapes[i].id)) {
      lastMemberAbs = i;
      break;
    }
  }
  const canReorderUp =
    lastMemberAbs >= 0 &&
    shapes
      .slice(lastMemberAbs + 1)
      .some((sh) => sh.sheetId === sheetId && !memberIdSet.has(sh.id));
  const canReorderDown =
    firstMemberAbs > 0 &&
    shapes
      .slice(0, firstMemberAbs)
      .some((sh) => sh.sheetId === sheetId && !memberIdSet.has(sh.id));

  function setAllHidden(hidden: boolean) {
    for (const m of members) {
      updateShape(m.id, { visible: !hidden } as Partial<Shape>);
    }
  }
  function setAllLocked(locked: boolean) {
    for (const m of members) {
      updateShape(m.id, { locked } as Partial<Shape>);
    }
  }
  function onMove(dir: MoveDirection) {
    if (dir === "up") moveGroupUp(gid);
    else if (dir === "down") moveGroupDown(gid);
    else if (dir === "top") moveGroupToTop(gid);
    else if (dir === "bottom") moveGroupToBottom(gid);
  }

  return (
    <div className="select-none">
      <div
        data-row-id={`group:${gid}`}
        {...dragProps(
          "shape",
          gid,
          `group:${gid}`,
          0,
          members.length,
          { acceptsOnto: true },
        )}
        // Group rows are drop targets (shapes can be dropped ONTO them to
        // join). Whole-group drag-reorder stays disabled for now — the
        // Reorder popover is the only block-level move affordance. Override
        // draggable=false after the spread to suppress dragstart while
        // preserving dragover/drop for join-group semantics.
        draggable={false}
        className={`group relative flex items-center gap-1 h-7 px-2 rounded text-xs cursor-pointer ${
          groupIsSelected ? "row-selected" : "text-ink-200 hover:bg-ink-700"
        }`}
        onClick={() => selectShape(members[0].id)}
      >
        <button
          className="p-0.5 text-ink-400 hover:text-white shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded("group:" + gid);
          }}
          aria-label={open ? "Collapse group" : "Expand group"}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <RowReorderControl
          entity="group"
          canUp={canReorderUp}
          canDown={canReorderDown}
          onMove={onMove}
          forceVisible={groupIsSelected}
        />
        <GroupIcon size={12} className="text-ink-300 shrink-0" />
        {isRenaming ? (
          <RenameInput
            initialValue={label}
            ariaLabel={`Rename group ${label}`}
            onCommit={(v) => {
              const trimmed = v.trim();
              if (trimmed) setGroupName(gid, trimmed);
              setIsRenaming(false);
            }}
            onCancel={() => setIsRenaming(false)}
          />
        ) : (
          <span
            className="flex-1 truncate"
            onDoubleClick={(e) => {
              // Stop the row's onClick from firing "select group" on the
              // second press in a dblclick sequence.
              e.stopPropagation();
              setIsRenaming(true);
            }}
          >
            {label}
          </span>
        )}
        {!isRenaming && (
          <span className="text-[10px] text-ink-400 group-hover:hidden shrink-0">
            {members.length}
          </span>
        )}
        {!isRenaming && (
          <RowRightControls
            entity="group"
            hidden={allHidden}
            locked={allLocked}
            // Group-as-a-unit clipboard isn't wired yet — disable the items so
            // the menu still renders predictably. Duplicate is the coarse
            // alternative for copying a group.
            canCut={false}
            canPaste={false}
            forceVisible={groupIsSelected}
            showUngroup
            onToggleHidden={() => setAllHidden(!allHidden)}
            onToggleLocked={() => setAllLocked(!allLocked)}
            onDuplicate={() => duplicateGroup(gid)}
            onCut={() => {}}
            onCopy={() => {}}
            onPaste={() => {}}
            onRenameRequest={() => setIsRenaming(true)}
            onDelete={() => deleteGroup(gid)}
            onUngroup={() => ungroupGroup(gid)}
          />
        )}
      </div>
      {open && (
        <div className="pl-5">
          {members.map((sh) => {
            const visualIdx = scopeShapes.findIndex((x) => x.id === sh.id);
            return (
              <ShapeRow
                key={sh.id}
                shape={sh}
                bypassGroupOnSelect={true}
                dragProps={dragProps}
                scope={memberScope}
                visualIdx={visualIdx}
                scopeSize={scopeSize}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ShapeRow ──────────────────────────────────────────────────────────────

function ShapeRow({
  shape,
  bypassGroupOnSelect,
  dragProps,
  scope,
  visualIdx,
  scopeSize,
}: {
  shape: Shape;
  /** True when the row is rendered inside an expanded group — selecting a
   *  single member shouldn't re-expand the whole group. */
  bypassGroupOnSelect: boolean;
  dragProps: DragPropsFn;
  /** Drag-reorder scope this row belongs to — e.g. "shapes:sheet_1" or
   *  "shapes:board". Must match the scope of sibling rows that participate
   *  in the same reorder pool. */
  scope: string;
  /** Row's REVERSED visual index within `scope` (top-of-list = 0). The hook
   *  translates this to an array index at drop time. */
  visualIdx: number;
  /** Total number of shapes in `scope`. Hook uses this for index math. */
  scopeSize: number;
}) {
  const selectedShapeId = useStore((s) => s.selectedShapeId);
  const selectedShapeIds = useStore((s) => s.selectedShapeIds);
  const lastAnchorShapeId = useStore((s) => s.lastAnchorShapeId);
  const selectShape = useStore((s) => s.selectShape);
  const setSelectedShapeIds = useStore((s) => s.setSelectedShapeIds);
  const setLastAnchorShapeId = useStore((s) => s.setLastAnchorShapeId);
  const shapes = useStore((s) => s.shapes);
  const clipboard = useStore((s) => s.clipboard);
  const renamingShapeId = useStore((s) => s.renamingShapeId);

  const toggleShapeVisible = useStore((s) => s.toggleShapeVisible);
  const toggleShapeLocked = useStore((s) => s.toggleShapeLocked);
  const duplicateShape = useStore((s) => s.duplicateShape);
  const deleteShape = useStore((s) => s.deleteShape);
  const copyShape = useStore((s) => s.copyShape);
  const cutShape = useStore((s) => s.cutShape);
  const pasteShape = useStore((s) => s.pasteShape);
  const updateShape = useStore((s) => s.updateShape);
  const startRenameShape = useStore((s) => s.startRenameShape);
  const stopRenameShape = useStore((s) => s.stopRenameShape);
  const moveShapeUp = useStore((s) => s.moveShapeUp);
  const moveShapeDown = useStore((s) => s.moveShapeDown);
  const moveShapeToTop = useStore((s) => s.moveShapeToTop);
  const moveShapeToBottom = useStore((s) => s.moveShapeToBottom);
  const groupSelected = useStore((s) => s.groupSelected);
  const ungroupSelected = useStore((s) => s.ungroupSelected);

  const isPrimary = selectedShapeId === shape.id;
  const isInMultiSelection = selectedShapeIds.includes(shape.id);
  const isRenaming = renamingShapeId === shape.id;
  // Group menu item surfaces only when the user has multi-selected ≥2 shapes
  // AND this row is part of that selection — grouping one isolated row makes
  // no sense. Ungroup surfaces whenever this shape already belongs to a group.
  const showGroup = selectedShapeIds.length >= 2 && isInMultiSelection;
  const showUngroup = !!shape.groupId;

  // Scope-aware reorder availability — later index in `shapes` array renders
  // on top in Konva, so "Up" is toward the end of the scope-filtered list.
  const scopeIds: string[] = [];
  for (const s of shapes) {
    if (s.sheetId === shape.sheetId) scopeIds.push(s.id);
  }
  const scopePos = scopeIds.indexOf(shape.id);
  const canReorderUp = scopePos >= 0 && scopePos < scopeIds.length - 1;
  const canReorderDown = scopePos > 0;

  const canPaste = !!(clipboard.shape || clipboard.multi);

  function onMove(dir: MoveDirection) {
    if (dir === "up") moveShapeUp(shape.id);
    else if (dir === "down") moveShapeDown(shape.id);
    else if (dir === "top") moveShapeToTop(shape.id);
    else if (dir === "bottom") moveShapeToBottom(shape.id);
  }

  function onRowClick(e: React.MouseEvent) {
    const meta = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;
    // Cmd/Ctrl+click: toggle this row in the multi-selection.
    if (meta && !shift) {
      const next = isInMultiSelection
        ? selectedShapeIds.filter((x) => x !== shape.id)
        : [...selectedShapeIds, shape.id];
      setSelectedShapeIds(next, true);
      setLastAnchorShapeId(shape.id);
      return;
    }
    // Shift+click: range-select from anchor to here, scoped to same sheetId
    // so a range in Sheet 1 can't leak into Sheet 2.
    if (shift && lastAnchorShapeId) {
      const anchor = shapes.find((x) => x.id === lastAnchorShapeId);
      if (anchor && anchor.sheetId === shape.sheetId) {
        const scope = shapes.filter((x) => x.sheetId === shape.sheetId);
        const a = scope.findIndex((x) => x.id === lastAnchorShapeId);
        const b = scope.findIndex((x) => x.id === shape.id);
        if (a >= 0 && b >= 0) {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const ids = scope.slice(lo, hi + 1).map((x) => x.id);
          setSelectedShapeIds(ids, true);
          return;
        }
      }
      // Anchor in different scope → fall through to plain select.
    }
    selectShape(shape.id, bypassGroupOnSelect || e.altKey);
  }

  const rowClass = isPrimary
    ? "row-selected"
    : isInMultiSelection
    ? "row-multi-selected"
    : "text-ink-200 hover:bg-ink-700";

  return (
    <div
      data-row-id={shape.id}
      {...dragProps("shape", shape.id, scope, visualIdx, scopeSize)}
      className={`group relative flex items-center gap-1.5 h-7 px-2 rounded text-xs ${rowClass}`}
      onClick={onRowClick}
    >
      {/* Reorder lives left of the type-icon. */}
      <RowReorderControl
        entity="shape"
        canUp={canReorderUp}
        canDown={canReorderDown}
        onMove={onMove}
        forceVisible={isPrimary}
      />
      <span className="text-ink-400 shrink-0">{shapeIcon(shape)}</span>
      {isRenaming ? (
        <RenameInput
          initialValue={shape.name}
          ariaLabel={`Rename shape ${shape.name}`}
          onCommit={(v) => {
            updateShape(shape.id, { name: v.trim() || shape.name } as Partial<Shape>);
            stopRenameShape();
          }}
          onCancel={() => stopRenameShape()}
        />
      ) : (
        <span className="flex-1 truncate">{shape.name}</span>
      )}
      {/* Right cluster — Hide / Lock / More. */}
      {!isRenaming && (
        <RowRightControls
          entity="shape"
          hidden={!shape.visible}
          locked={shape.locked}
          canCut={true}
          canPaste={canPaste}
          forceVisible={isPrimary}
          showGroup={showGroup}
          showUngroup={showUngroup}
          onToggleHidden={() => toggleShapeVisible(shape.id)}
          onToggleLocked={() => toggleShapeLocked(shape.id)}
          onDuplicate={() => duplicateShape(shape.id)}
          onCut={() => cutShape(shape.id)}
          onCopy={() => copyShape(shape.id)}
          onPaste={pasteShape}
          onRenameRequest={() => startRenameShape(shape.id)}
          onDelete={() => deleteShape(shape.id)}
          onGroup={groupSelected}
          onUngroup={ungroupSelected}
        />
      )}
    </div>
  );
}

// ── Inline rename input ──────────────────────────────────────────────────
// Matches the pattern in SheetToolbar.tsx:2306-2346 — autoFocus + select, Enter
// commits, Escape cancels, blur commits. Empty trim → cancel.

function RenameInput({
  initialValue,
  onCommit,
  onCancel,
  ariaLabel,
}: {
  initialValue: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  function commit() {
    const v = draft.trim();
    if (v) onCommit(v);
    else onCancel();
  }
  return (
    <input
      ref={ref}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      aria-label={ariaLabel}
      className="flex-1 min-w-0 h-6 px-1 text-xs rounded bg-ink-800 border border-brand-600 outline-none text-ink-100"
    />
  );
}
