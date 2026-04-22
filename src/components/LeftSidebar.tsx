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
  Eye,
  EyeOff,
  FileText,
  Group as GroupIcon,
  Heart,
  Hexagon,
  Image as ImageIcon,
  Layers,
  Minus,
  Octagon,
  Pen,
  Settings,
  Square,
  Star,
  StickyNote,
  Triangle,
  Type,
} from "lucide-react";
import { useStore } from "../store";
import type { Shape } from "../types";

function shapeIcon(sh: Shape) {
  if (sh.type === "shape") {
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
    case "text": return <Type size={12} />;
    case "sticky": return <StickyNote size={12} />;
    case "pen": return <Pen size={12} />;
    case "image": return <ImageIcon size={12} />;
    case "line": return <Minus size={12} />;
  }
}

export function LeftSidebar() {
  const sheets = useStore((s) => s.sheets);
  const shapes = useStore((s) => s.shapes);
  const activeSheetId = useStore((s) => s.activeSheetId);
  const setActiveSheet = useStore((s) => s.setActiveSheet);
  const selectSheet = useStore((s) => s.selectSheet);
  const expanded = useStore((s) => s.expandedSheets);
  const toggleExpanded = useStore((s) => s.toggleSheetExpanded);
  const selectShape = useStore((s) => s.selectShape);
  const selectedShapeId = useStore((s) => s.selectedShapeId);
  const setShowProfile = useStore((s) => s.setShowProfile);
  const setShowSettings = useStore((s) => s.setShowSettings);
  const showProfile = useStore((s) => s.showProfile);
  const showSettings = useStore((s) => s.showSettings);

  const boardLayers = shapes.filter((sh) => sh.sheetId === "board");

  return (
    <div className="w-60 bg-ink-900 border-r border-ink-700 flex flex-col">
      <div className="px-3 h-9 flex items-center gap-2 border-b border-ink-800 text-xs text-ink-300 uppercase tracking-wider">
        <Layers size={13} />
        <span>Sheets & Layers</span>
        <span className="ml-auto normal-case tracking-normal text-ink-400 text-[11px]">
          {sheets.length} {sheets.length === 1 ? "sheet" : "sheets"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin py-1">
        {sheets.map((sheet) => {
          const isActive = sheet.id === activeSheetId;
          const isOpen = !!expanded[sheet.id];
          const sheetShapes = shapes
            .filter((sh) => sh.sheetId === sheet.id)
            .slice()
            .reverse();
          return (
            <div key={sheet.id} className="select-none">
              <div
                className={`group flex items-center gap-1 pl-2 pr-2 h-8 cursor-pointer ${
                  isActive ? "row-active" : "hover:bg-ink-700"
                }`}
                onClick={() => {
                  setActiveSheet(sheet.id);
                  selectSheet(sheet.id);
                }}
              >
                <button
                  className="p-0.5 text-ink-400 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(sheet.id);
                  }}
                >
                  {isOpen ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
                <FileText size={13} className="text-ink-300" />
                <span className="text-sm flex-1 truncate">{sheet.name}</span>
                <span className="text-[10px] text-ink-400">
                  {sheetShapes.length}
                </span>
              </div>
              {isOpen && (
                <div className="pl-7 pr-1 pb-1">
                  {sheetShapes.length === 0 && (
                    <div className="text-[11px] text-ink-500 px-2 py-1">
                      No layers
                    </div>
                  )}
                  <SheetShapeList shapes={sheetShapes} />
                </div>
              )}
            </div>
          );
        })}

        {boardLayers.length > 0 && (
          <div className="mt-2 border-t border-ink-800 pt-2">
            <div className="px-3 text-[10px] uppercase tracking-wider text-ink-400 mb-1">
              Board layers (free)
            </div>
            {boardLayers.map((sh) => (
              <div
                key={sh.id}
                className={`group flex items-center gap-1.5 h-7 mx-2 px-2 rounded text-xs cursor-pointer ${
                  selectedShapeId === sh.id
                    ? "row-selected"
                    : "text-ink-200 hover:bg-ink-700"
                }`}
                onClick={() => selectShape(sh.id)}
              >
                <span className="text-ink-400">{shapeIcon(sh)}</span>
                <span className="flex-1 truncate">{sh.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* footer: profile + settings */}
      <div className="border-t border-ink-800 px-2 py-2 flex items-center gap-1">
        <button
          className={`flex-1 flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors ${
            showProfile ? "row-active" : "hover:bg-ink-700 text-ink-200"
          }`}
          onClick={() => setShowProfile(!showProfile)}
          title="Profile"
        >
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 grid place-items-center text-[9px] font-bold text-white">
            B
          </div>
          <span>Profile</span>
        </button>
        <button
          className={`icon-btn ${showSettings ? "row-active" : ""}`}
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
        >
          <Settings size={15} />
        </button>
      </div>
    </div>
  );
}

/**
 * Renders a sheet's shape list with implicit groups: shapes sharing a
 * `groupId` collapse under a synthetic "Group" header that can be expanded.
 * Group expansion state is reused from the existing `expandedSheets` dict
 * with a `"group:" + groupId` key prefix.
 */
function SheetShapeList({ shapes }: { shapes: Shape[] }) {
  const selectedShapeId = useStore((s) => s.selectedShapeId);
  const selectShape = useStore((s) => s.selectShape);
  const toggleVisible = useStore((s) => s.toggleShapeVisible);
  const expanded = useStore((s) => s.expandedSheets);
  const toggleExpanded = useStore((s) => s.toggleSheetExpanded);

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

  return (
    <>
      {rows.map((row, i) => {
        if (row.kind === "shape") {
          const sh = row.shapes[0];
          return (
            <ShapeRow
              key={sh.id}
              shape={sh}
              selected={selectedShapeId === sh.id}
              onSelect={() => selectShape(sh.id)}
              onToggleVisible={() => toggleVisible(sh.id)}
            />
          );
        }
        const gid = row.gid!;
        const open = !!expanded["group:" + gid];
        const groupSelected = row.shapes.some((m) => m.id === selectedShapeId);
        return (
          <div key={`g-${gid}`} className="select-none">
            <div
              className={`group flex items-center gap-1 h-7 px-2 rounded text-xs cursor-pointer ${
                groupSelected ? "row-selected" : "text-ink-200 hover:bg-ink-700"
              }`}
              onClick={() => selectShape(row.shapes[0].id)}
            >
              <button
                className="p-0.5 text-ink-400 hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded("group:" + gid);
                }}
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              <GroupIcon size={12} className="text-ink-300" />
              <span className="flex-1 truncate">Group {i + 1}</span>
              <span className="text-[10px] text-ink-400">
                {row.shapes.length}
              </span>
            </div>
            {open && (
              <div className="pl-5">
                {row.shapes.map((sh) => (
                  <ShapeRow
                    key={sh.id}
                    shape={sh}
                    selected={selectedShapeId === sh.id}
                    onSelect={() => selectShape(sh.id, true)}
                    onToggleVisible={() => toggleVisible(sh.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function ShapeRow({
  shape,
  selected,
  onSelect,
  onToggleVisible,
}: {
  shape: Shape;
  selected: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-1.5 h-7 px-2 rounded text-xs cursor-pointer ${
        selected ? "row-selected" : "text-ink-200 hover:bg-ink-700"
      }`}
      onClick={onSelect}
    >
      <span className="text-ink-400">{shapeIcon(shape)}</span>
      <span className="flex-1 truncate">{shape.name}</span>
      <button
        className="opacity-0 group-hover:opacity-100 text-ink-300 hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisible();
        }}
        title={shape.visible ? "Hide" : "Show"}
      >
        {shape.visible ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
    </div>
  );
}
