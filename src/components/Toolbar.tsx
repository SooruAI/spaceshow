import {
  MousePointer2,
  Pen,
  Eraser,
  Square,
  Minus,
  StickyNote,
  Type,
  Upload,
  FilePlus,
} from "lucide-react";
import { useStore } from "../store";
import type { Tool } from "../types";

const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: "select", label: "Select (V)", icon: <MousePointer2 size={16} /> },
  { id: "pen", label: "Pen (P)", icon: <Pen size={16} /> },
  { id: "eraser", label: "Eraser (E)", icon: <Eraser size={16} /> },
  { id: "rect", label: "Rectangle (R)", icon: <Square size={16} /> },
  { id: "line", label: "Line (L)", icon: <Minus size={16} /> },
  { id: "sticky", label: "Sticky note (S)", icon: <StickyNote size={16} /> },
  { id: "text", label: "Text (T)", icon: <Type size={16} /> },
  { id: "upload", label: "Upload file (U)", icon: <Upload size={16} /> },
];

export function Toolbar({ onUploadClick }: { onUploadClick: () => void }) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const addSheet = useStore((s) => s.addSheet);

  return (
    <div className="absolute left-9 top-1/2 -translate-y-1/2 z-20 panel rounded-xl py-2 px-1 flex flex-col gap-1 shadow-2xl">
      <button
        title="Add sheet"
        className="toolbar-btn text-brand-500"
        onClick={addSheet}
      >
        <FilePlus size={16} />
      </button>
      <div className="my-1 mx-1 h-px bg-ink-700" />
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.label}
          className={`toolbar-btn ${tool === t.id ? "toolbar-btn-active" : ""}`}
          onClick={() => {
            setTool(t.id);
            if (t.id === "upload") onUploadClick();
          }}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}
