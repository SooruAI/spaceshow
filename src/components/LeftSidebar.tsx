import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  FileText,
  Type,
  Square,
  StickyNote,
  Pen,
  Image as ImageIcon,
  Minus,
  Settings,
} from "lucide-react";
import { useStore } from "../store";
import type { Shape } from "../types";

function shapeIcon(t: Shape["type"]) {
  switch (t) {
    case "rect":
      return <Square size={12} />;
    case "text":
      return <Type size={12} />;
    case "sticky":
      return <StickyNote size={12} />;
    case "pen":
      return <Pen size={12} />;
    case "image":
      return <ImageIcon size={12} />;
    case "line":
      return <Minus size={12} />;
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
  const toggleVisible = useStore((s) => s.toggleShapeVisible);
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
        <Layers size={13} /> Sheets & Layers
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
                  {sheetShapes.map((sh) => (
                    <div
                      key={sh.id}
                      className={`group flex items-center gap-1.5 h-7 px-2 rounded text-xs cursor-pointer ${
                        selectedShapeId === sh.id
                          ? "row-selected"
                          : "text-ink-200 hover:bg-ink-700"
                      }`}
                      onClick={() => selectShape(sh.id)}
                    >
                      <span className="text-ink-400">{shapeIcon(sh.type)}</span>
                      <span className="flex-1 truncate">{sh.name}</span>
                      <button
                        className="opacity-0 group-hover:opacity-100 text-ink-300 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleVisible(sh.id);
                        }}
                        title={sh.visible ? "Hide" : "Show"}
                      >
                        {sh.visible ? (
                          <Eye size={12} />
                        ) : (
                          <EyeOff size={12} />
                        )}
                      </button>
                    </div>
                  ))}
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
                <span className="text-ink-400">{shapeIcon(sh.type)}</span>
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
