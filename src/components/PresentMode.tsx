import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Stage, Layer, Group, Rect, Text, Line } from "react-konva";
import { useStore } from "../store";

export function PresentMode() {
  const sheets = useStore((s) => s.sheets.filter((sh) => !sh.hidden));
  const shapes = useStore((s) => s.shapes);
  const setPresenting = useStore((s) => s.setPresenting);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPresenting(false);
      if (e.key === "ArrowRight" || e.key === " ")
        setIdx((i) => Math.min(sheets.length - 1, i + 1));
      if (e.key === "ArrowLeft")
        setIdx((i) => Math.max(0, i - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheets.length, setPresenting]);

  const sheet = sheets[idx];
  if (!sheet) return null;
  const sheetShapes = shapes.filter(
    (s) => s.sheetId === sheet.id && s.visible
  );

  // fit sheet to viewport
  const padding = 80;
  const vw = window.innerWidth - padding * 2;
  const vh = window.innerHeight - padding * 2;
  const scale = Math.min(vw / sheet.width, vh / sheet.height);
  const stageW = sheet.width * scale;
  const stageH = sheet.height * scale;

  return (
    <div className="fixed inset-0 z-50 overlay-bg flex items-center justify-center">
      <button
        className="absolute top-4 right-4 icon-btn bg-ink-800"
        onClick={() => setPresenting(false)}
      >
        <X size={16} />
      </button>
      <button
        className="absolute left-4 icon-btn bg-ink-800 disabled:opacity-30"
        onClick={() => setIdx(Math.max(0, idx - 1))}
        disabled={idx === 0}
      >
        <ChevronLeft size={18} />
      </button>
      <button
        className="absolute right-4 icon-btn bg-ink-800 disabled:opacity-30"
        onClick={() => setIdx(Math.min(sheets.length - 1, idx + 1))}
        disabled={idx === sheets.length - 1}
      >
        <ChevronRight size={18} />
      </button>
      <div
        style={{
          width: stageW,
          height: stageH,
          background: sheet.background,
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <Stage width={stageW} height={stageH}>
          <Layer>
            <Group scaleX={scale} scaleY={scale}>
              {sheetShapes.map((sh) => {
                if (sh.type === "rect")
                  return (
                    <Rect
                      key={sh.id}
                      x={sh.x}
                      y={sh.y}
                      width={sh.width}
                      height={sh.height}
                      fill={sh.fill}
                      cornerRadius={2}
                    />
                  );
                if (sh.type === "text")
                  return (
                    <Text
                      key={sh.id}
                      x={sh.x}
                      y={sh.y}
                      text={sh.text}
                      fontSize={sh.fontSize}
                      fill={sh.fill}
                    />
                  );
                if (sh.type === "line" || sh.type === "pen")
                  return (
                    <Line
                      key={sh.id}
                      points={sh.points}
                      stroke={sh.stroke}
                      strokeWidth={sh.strokeWidth}
                      lineCap="round"
                      tension={sh.type === "pen" ? 0.5 : 0}
                    />
                  );
                if (sh.type === "sticky")
                  return (
                    <Group key={sh.id} x={sh.x} y={sh.y}>
                      <Rect
                        width={sh.width}
                        height={sh.height}
                        fill={sh.fill}
                        cornerRadius={4}
                      />
                      <Text
                        text={sh.text}
                        x={10}
                        y={10}
                        width={sh.width - 20}
                        fontSize={16}
                        fill="#1c1e25"
                      />
                    </Group>
                  );
                return null;
              })}
            </Group>
          </Layer>
        </Stage>
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-ink-300 text-sm">
        {sheet.name} — {idx + 1} / {sheets.length}
      </div>
    </div>
  );
}
