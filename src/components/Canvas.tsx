import { useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Rect,
  Text,
  Line,
  Group,
  Image as KImage,
} from "react-konva";
import useImage from "use-image";
import { Plus } from "lucide-react";
import { Rulers, RULER_SIZE } from "./Rulers";
import { useStore, uid } from "../store";
import { useThemeVars } from "../theme";
import type { LineStyle, Sheet, Shape, Tool } from "../types";

interface Props {
  width: number;
  height: number;
}

export function Canvas({ width, height }: Props) {
  const zoom = useStore((s) => s.zoom);
  const pan = useStore((s) => s.pan);
  const setPan = useStore((s) => s.setPan);
  const zoomAt = useStore((s) => s.zoomAt);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const sheets = useStore((s) => s.sheets);
  const shapes = useStore((s) => s.shapes);
  const activeSheetId = useStore((s) => s.activeSheetId);
  const setActiveSheet = useStore((s) => s.setActiveSheet);
  const selectedSheetId = useStore((s) => s.selectedSheetId);
  const selectSheet = useStore((s) => s.selectSheet);
  const insertSheetAfter = useStore((s) => s.insertSheetAfter);
  const addSheet = useStore((s) => s.addSheet);
  const addShape = useStore((s) => s.addShape);
  const updateShape = useStore((s) => s.updateShape);
  const selectShape = useStore((s) => s.selectShape);
  const selectedShapeId = useStore((s) => s.selectedShapeId);
  const showRulerH = useStore((s) => s.showRulerH);
  const showRulerV = useStore((s) => s.showRulerV);
  const gridMode = useStore((s) => s.gridMode);
  const gridGap = useStore((s) => s.gridGap);
  const toolColors = useStore((s) => s.toolColors);
  const toolStrokeWidth = useStore((s) => s.toolStrokeWidth);
  const toolFontSize = useStore((s) => s.toolFontSize);
  const theme = useThemeVars();

  const stageRef = useRef<any>(null);
  const [drawing, setDrawing] = useState<Shape | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastPan = useRef<{ x: number; y: number } | null>(null);

  // expose stage to the SheetToolbar export action
  useEffect(() => {
    (window as any).__spaceshow_stage = stageRef.current;
    return () => {
      if ((window as any).__spaceshow_stage === stageRef.current) {
        delete (window as any).__spaceshow_stage;
      }
    };
  });

  const leftOffset = showRulerV ? RULER_SIZE : 0;
  const topOffset = showRulerH ? RULER_SIZE : 0;
  const stageW = Math.max(0, width - leftOffset);
  const stageH = Math.max(0, height - topOffset);

  // wheel: zoom with ctrl/meta, pan otherwise
  useEffect(() => {
    const node = stageRef.current?.container?.();
    if (!node) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        zoomAt(factor, cx, cy);
      } else {
        const { pan } = useStore.getState();
        setPan({ x: pan.x - e.deltaX, y: pan.y - e.deltaY });
      }
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoomAt, setPan]);

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        document.activeElement &&
        ["INPUT", "TEXTAREA"].includes(
          (document.activeElement as HTMLElement).tagName
        )
      )
        return;
      const map: Record<string, Tool> = {
        v: "select",
        p: "pen",
        e: "eraser",
        r: "rect",
        l: "line",
        s: "sticky",
        t: "text",
        u: "upload",
      };
      const t = map[e.key.toLowerCase()];
      if (t) setTool(t);
      if (e.key === "Escape") {
        useStore.getState().selectShape(null);
        useStore.getState().selectSheet(null);
        setTool("select");
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedShapeId) {
        useStore.getState().deleteShape(selectedShapeId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool, selectedShapeId]);

  function screenToWorld(x: number, y: number) {
    return { x: (x - pan.x) / zoom, y: (y - pan.y) / zoom };
  }

  function findSheetAt(wx: number, wy: number) {
    return [...sheets].reverse().find(
      (s) => wx >= s.x && wx <= s.x + s.width && wy >= s.y && wy <= s.y + s.height
    );
  }

  function onMouseDown(e: any) {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const { x: wx, y: wy } = screenToWorld(pointer.x, pointer.y);

    // Middle/space pan or select-tool drag pan on empty
    const evt = e.evt as MouseEvent;
    if (evt.button === 1 || (tool === "select" && e.target === stage)) {
      setIsPanning(true);
      lastPan.current = { x: evt.clientX, y: evt.clientY };
      selectShape(null);
      // Click on empty board (no sheet under cursor) → clear sheet selection
      if (!findSheetAt(wx, wy)) selectSheet(null);
      return;
    }

    if (tool === "select") {
      // selection handled by the Rect's onClick
      return;
    }

    const targetSheet = findSheetAt(wx, wy);
    const sheetId = targetSheet?.id ?? "board";
    if (targetSheet) setActiveSheet(targetSheet.id);
    const localX = targetSheet ? wx - targetSheet.x : wx;
    const localY = targetSheet ? wy - targetSheet.y : wy;

    const id = uid("shape");
    let newShape: Shape | null = null;

    if (tool === "rect") {
      newShape = {
        id,
        type: "rect",
        sheetId,
        name: `Rectangle`,
        visible: true,
        locked: false,
        x: localX,
        y: localY,
        width: 1,
        height: 1,
        fill: toolColors.rect,
      };
    } else if (tool === "pen") {
      newShape = {
        id,
        type: "pen",
        sheetId,
        name: "Pen stroke",
        visible: true,
        locked: false,
        x: 0,
        y: 0,
        points: [localX, localY],
        stroke: toolColors.pen,
        strokeWidth: toolStrokeWidth / zoom,
      };
    } else if (tool === "line") {
      newShape = {
        id,
        type: "line",
        sheetId,
        name: "Line",
        visible: true,
        locked: false,
        x: 0,
        y: 0,
        points: [localX, localY, localX, localY],
        stroke: toolColors.line,
        strokeWidth: toolStrokeWidth / zoom,
      };
    } else if (tool === "sticky") {
      const sticky: Shape = {
        id,
        type: "sticky",
        sheetId,
        name: "Sticky note",
        visible: true,
        locked: false,
        x: localX,
        y: localY,
        width: 180,
        height: 140,
        fill: toolColors.sticky,
        text: "Note",
      };
      addShape(sticky);
      setTool("select");
      selectShape(sticky.id);
      return;
    } else if (tool === "text") {
      const txt: Shape = {
        id,
        type: "text",
        sheetId,
        name: "Text",
        visible: true,
        locked: false,
        x: localX,
        y: localY,
        text: "Double-click to edit",
        fontSize: toolFontSize,
        fill: toolColors.text,
      };
      addShape(txt);
      setTool("select");
      selectShape(txt.id);
      return;
    } else if (tool === "eraser") {
      // hit-test top-most shape on this sheet and delete
      const onSheet = shapes.filter((s) => s.sheetId === sheetId);
      for (let i = onSheet.length - 1; i >= 0; i--) {
        const sh = onSheet[i];
        if (hitTest(sh, localX, localY)) {
          useStore.getState().deleteShape(sh.id);
          break;
        }
      }
      return;
    }

    if (newShape) {
      addShape(newShape);
      setDrawing(newShape);
    }
  }

  function onMouseMove(e: any) {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (isPanning && lastPan.current) {
      const evt = e.evt as MouseEvent;
      const dx = evt.clientX - lastPan.current.x;
      const dy = evt.clientY - lastPan.current.y;
      lastPan.current = { x: evt.clientX, y: evt.clientY };
      setPan({ x: pan.x + dx, y: pan.y + dy });
      return;
    }

    if (!drawing) return;
    const { x: wx, y: wy } = screenToWorld(pointer.x, pointer.y);
    const sheet = sheets.find((s) => s.id === drawing.sheetId);
    const localX = sheet ? wx - sheet.x : wx;
    const localY = sheet ? wy - sheet.y : wy;

    if (drawing.type === "rect") {
      updateShape(drawing.id, {
        width: localX - drawing.x,
        height: localY - drawing.y,
      } as any);
    } else if (drawing.type === "pen") {
      const pts = [...(drawing as any).points, localX, localY];
      updateShape(drawing.id, { points: pts } as any);
      (drawing as any).points = pts;
    } else if (drawing.type === "line") {
      const start = (drawing as any).points.slice(0, 2);
      updateShape(drawing.id, {
        points: [start[0], start[1], localX, localY],
      } as any);
    }
  }

  function onMouseUp() {
    setIsPanning(false);
    lastPan.current = null;
    if (drawing) {
      // normalize negative-sized rects
      if (drawing.type === "rect") {
        const sh = useStore
          .getState()
          .shapes.find((s) => s.id === drawing.id) as any;
        if (sh) {
          let { x, y, width, height } = sh;
          if (width < 0) {
            x += width;
            width = -width;
          }
          if (height < 0) {
            y += height;
            height = -height;
          }
          updateShape(drawing.id, { x, y, width, height } as any);
        }
      }
      // tiny shapes -> remove
      const sh = useStore
        .getState()
        .shapes.find((s) => s.id === drawing.id) as any;
      if (sh && sh.type === "rect" && (Math.abs(sh.width) < 3 || Math.abs(sh.height) < 3)) {
        useStore.getState().deleteShape(sh.id);
      }
      setDrawing(null);
      if (tool !== "pen") {
        setTool("select");
      }
    }
  }

  return (
    <div className="absolute inset-0">
      <Rulers
        width={width}
        height={height}
        showH={showRulerH}
        showV={showRulerV}
      />
      <div
        className="absolute"
        style={{
          left: leftOffset,
          top: topOffset,
          width: stageW,
          height: stageH,
          background:
            "radial-gradient(circle at 50% 50%, var(--canvas-bg-1), var(--canvas-bg-2) 70%)",
          cursor:
            tool === "select"
              ? isPanning
                ? "grabbing"
                : "default"
              : tool === "pen" || tool === "eraser"
              ? "crosshair"
              : "crosshair",
        }}
      >
        <Stage
          ref={stageRef}
          width={stageW}
          height={stageH}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {/* infinite-board grid */}
          <Layer listening={false}>
            <GridLayer
              width={stageW}
              height={stageH}
              pan={pan}
              zoom={zoom}
              color={theme["--grid-dot"]}
              mode={gridMode}
              gap={gridGap}
            />
          </Layer>

          {/* sheets */}
          <Layer>
            {sheets.map((s) => {
              const isFocused = s.id === selectedSheetId;
              const isActive = s.id === activeSheetId;
              const showHighlight = isFocused || isActive;
              return (
                <Group
                  key={s.id}
                  x={pan.x + s.x * zoom}
                  y={pan.y + s.y * zoom}
                  scaleX={zoom}
                  scaleY={zoom}
                  opacity={s.hidden ? 0.35 : 1}
                  onClick={() => {
                    setActiveSheet(s.id);
                    selectSheet(s.id);
                  }}
                  onTap={() => {
                    setActiveSheet(s.id);
                    selectSheet(s.id);
                  }}
                >
                  {/* shadow */}
                  <Rect
                    x={4 / zoom}
                    y={6 / zoom}
                    width={s.width}
                    height={s.height}
                    fill="rgba(0,0,0,0.45)"
                    cornerRadius={6 / zoom}
                  />
                  {/* page */}
                  <Rect
                    width={s.width}
                    height={s.height}
                    fill={s.background}
                    stroke={
                      isFocused
                        ? theme["--accent"]
                        : isActive
                        ? theme["--accent"]
                        : theme["--border"]
                    }
                    strokeWidth={(showHighlight ? 2 : 1) / zoom}
                    cornerRadius={6 / zoom}
                  />
                  {/* margin guides */}
                  <MarginGuides sheet={s} zoom={zoom} accent={theme["--accent"]} />
                  {/* borders */}
                  <SheetBorders sheet={s} />
                  {/* sheet name label */}
                  <Text
                    text={s.hidden ? `${s.name} (hidden)` : s.name}
                    x={0}
                    y={-22 / zoom}
                    fontSize={14 / zoom}
                    fill={
                      showHighlight
                        ? theme["--accent"]
                        : theme["--text-secondary"]
                    }
                    fontStyle={showHighlight ? "bold" : "normal"}
                  />
                  {/* shapes on this sheet */}
                  {shapes
                    .filter((sh) => sh.sheetId === s.id && sh.visible)
                    .map((sh) => (
                      <ShapeNode
                        key={sh.id}
                        shape={sh}
                        selected={selectedShapeId === sh.id}
                        onSelect={() => {
                          if (tool === "select" && !s.locked) selectShape(sh.id);
                        }}
                        onChange={(patch) => updateShape(sh.id, patch)}
                        draggable={tool === "select" && !s.locked}
                      />
                    ))}
                </Group>
              );
            })}

            {/* free board layers */}
            <Group x={pan.x} y={pan.y} scaleX={zoom} scaleY={zoom}>
              {shapes
                .filter((sh) => sh.sheetId === "board" && sh.visible)
                .map((sh) => (
                  <ShapeNode
                    key={sh.id}
                    shape={sh}
                    selected={selectedShapeId === sh.id}
                    onSelect={() => {
                      if (tool === "select") selectShape(sh.id);
                    }}
                    onChange={(patch) => updateShape(sh.id, patch)}
                    draggable={tool === "select"}
                  />
                ))}
            </Group>
          </Layer>
        </Stage>
        {/* HTML overlay: "+" between adjacent sheets, and one to append at the end */}
        <InterSheetAddOverlay
          sheets={sheets}
          pan={pan}
          zoom={zoom}
          onInsertAfter={(id) => insertSheetAfter(id)}
          onAppend={() => addSheet()}
        />
      </div>
    </div>
  );
}

function InterSheetAddOverlay({
  sheets,
  pan,
  zoom,
  onInsertAfter,
  onAppend,
}: {
  sheets: Sheet[];
  pan: { x: number; y: number };
  zoom: number;
  onInsertAfter: (id: string) => void;
  onAppend: () => void;
}) {
  if (sheets.length === 0) return null;
  const last = sheets[sheets.length - 1];
  const APPEND_OFFSET_PX = 32; // visible space between last sheet and the append placeholder
  // ghost-sheet placeholder dimensions in screen pixels
  const ghostScreenH = Math.max(120, last.height * zoom);
  const ghostScreenW = Math.max(90, ghostScreenH * (last.width / last.height));
  const appendLeft = (last.x + last.width) * zoom + pan.x + APPEND_OFFSET_PX;
  const appendTop = last.y * zoom + pan.y + (last.height * zoom - ghostScreenH) / 2;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {sheets.slice(0, -1).map((s, i) => {
        const next = sheets[i + 1];
        const midWorldX = (s.x + s.width + next.x) / 2;
        const midWorldY = (s.y + s.height / 2 + next.y + next.height / 2) / 2;
        const sx = midWorldX * zoom + pan.x;
        const sy = midWorldY * zoom + pan.y;
        return (
          <button
            key={`add-${s.id}`}
            className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-500 transition-colors opacity-70 hover:opacity-100"
            style={{ left: sx, top: sy }}
            onClick={() => onInsertAfter(s.id)}
            title="Insert sheet here"
          >
            <Plus size={14} />
          </button>
        );
      })}
      {/* append-at-end ghost-sheet placeholder — sits to the right of the last sheet */}
      <button
        key="append-end"
        className="pointer-events-auto absolute grid place-items-center rounded-md border-2 border-dashed border-brand-500/60 bg-brand-500/5 text-brand-500 hover:border-brand-500 hover:bg-brand-500/10 transition-colors"
        style={{
          left: appendLeft,
          top: appendTop,
          width: ghostScreenW,
          height: ghostScreenH,
        }}
        onClick={onAppend}
        title="Add sheet to the right"
      >
        <Plus size={28} strokeWidth={2.25} />
      </button>
    </div>
  );
}

function MarginGuides({
  sheet,
  zoom,
  accent,
}: {
  sheet: Sheet;
  zoom: number;
  accent: string;
}) {
  const sw = 1 / zoom;
  const dash = [6 / zoom, 4 / zoom];
  const lines: JSX.Element[] = [];
  const m = sheet.margins;
  if (typeof m.top === "number") {
    lines.push(
      <Line
        key="mt"
        points={[0, m.top, sheet.width, m.top]}
        stroke={accent}
        strokeWidth={sw}
        dash={dash}
        opacity={0.4}
        listening={false}
      />
    );
  }
  if (typeof m.bottom === "number") {
    const y = sheet.height - m.bottom;
    lines.push(
      <Line
        key="mb"
        points={[0, y, sheet.width, y]}
        stroke={accent}
        strokeWidth={sw}
        dash={dash}
        opacity={0.4}
        listening={false}
      />
    );
  }
  if (typeof m.left === "number") {
    lines.push(
      <Line
        key="ml"
        points={[m.left, 0, m.left, sheet.height]}
        stroke={accent}
        strokeWidth={sw}
        dash={dash}
        opacity={0.4}
        listening={false}
      />
    );
  }
  if (typeof m.right === "number") {
    const x = sheet.width - m.right;
    lines.push(
      <Line
        key="mr"
        points={[x, 0, x, sheet.height]}
        stroke={accent}
        strokeWidth={sw}
        dash={dash}
        opacity={0.4}
        listening={false}
      />
    );
  }
  return <>{lines}</>;
}

function dashFor(style: LineStyle, weight: number): number[] | undefined {
  if (style === "solid" || style === "double") return undefined;
  if (style === "dotted") return [1, Math.max(2, weight * 1.5)];
  if (style === "dashed") return [Math.max(4, weight * 3), Math.max(3, weight * 2)];
  return undefined;
}

function SheetBorders({ sheet }: { sheet: Sheet }) {
  const b = sheet.border;
  if (b.weight <= 0) return null;
  const w = sheet.width;
  const h = sheet.height;
  const lines: JSX.Element[] = [];
  const dash = dashFor(b.style, b.weight);

  function addSide(key: string, points: number[], offsetDir?: { x: number; y: number }) {
    if (b.style === "double") {
      const off = b.weight;
      const thin = Math.max(1, b.weight / 3);
      const sx = (offsetDir?.x ?? 0) * off;
      const sy = (offsetDir?.y ?? 0) * off;
      lines.push(
        <Line
          key={`${key}-a`}
          points={points}
          stroke={b.color}
          strokeWidth={thin}
          listening={false}
        />,
        <Line
          key={`${key}-b`}
          points={points.map((v, i) => (i % 2 === 0 ? v + sx : v + sy))}
          stroke={b.color}
          strokeWidth={thin}
          listening={false}
        />
      );
    } else {
      lines.push(
        <Line
          key={key}
          points={points}
          stroke={b.color}
          strokeWidth={b.weight}
          dash={dash}
          listening={false}
          lineCap="butt"
        />
      );
    }
  }

  if (b.sides.top) addSide("bt", [0, 0, w, 0], { x: 0, y: 1 });
  if (b.sides.right) addSide("br", [w, 0, w, h], { x: -1, y: 0 });
  if (b.sides.bottom) addSide("bb", [0, h, w, h], { x: 0, y: -1 });
  if (b.sides.left) addSide("bl", [0, 0, 0, h], { x: 1, y: 0 });

  return <>{lines}</>;
}

function GridLayer({
  width,
  height,
  pan,
  zoom,
  color,
  mode,
  gap,
}: {
  width: number;
  height: number;
  pan: { x: number; y: number };
  zoom: number;
  color: string;
  mode: "plain" | "dots" | "lines";
  gap: number;
}) {
  if (mode === "plain") return null;
  const step = gap * zoom;
  if (step < 8) return null;
  const startX = ((pan.x % step) + step) % step;
  const startY = ((pan.y % step) + step) % step;

  if (mode === "lines") {
    const lines: JSX.Element[] = [];
    for (let x = startX; x < width; x += step) {
      lines.push(
        <Line
          key={`vx-${x}`}
          points={[x, 0, x, height]}
          stroke={color}
          strokeWidth={1}
          listening={false}
        />
      );
    }
    for (let y = startY; y < height; y += step) {
      lines.push(
        <Line
          key={`hy-${y}`}
          points={[0, y, width, y]}
          stroke={color}
          strokeWidth={1}
          listening={false}
        />
      );
    }
    return <>{lines}</>;
  }

  // dots
  const dots: JSX.Element[] = [];
  for (let x = startX; x < width; x += step) {
    for (let y = startY; y < height; y += step) {
      dots.push(
        <Rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={1.5}
          height={1.5}
          fill={color}
          listening={false}
        />
      );
    }
  }
  return <>{dots}</>;
}

function ShapeNode({
  shape,
  selected,
  onSelect,
  onChange,
  draggable,
}: {
  shape: Shape;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Shape>) => void;
  draggable: boolean;
}) {
  const accent =
    typeof window !== "undefined"
      ? getComputedStyle(document.documentElement)
          .getPropertyValue("--accent")
          .trim() || "#0d9488"
      : "#0d9488";
  const stroke = selected ? accent : undefined;
  const strokeWidth = selected ? 2 : 0;

  if (shape.type === "rect") {
    return (
      <Rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill={shape.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        cornerRadius={2}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() } as any)}
      />
    );
  }
  if (shape.type === "pen") {
    return (
      <Line
        points={shape.points}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        tension={0.5}
        lineCap="round"
        lineJoin="round"
        onClick={onSelect}
        onTap={onSelect}
      />
    );
  }
  if (shape.type === "line") {
    return (
      <Line
        points={shape.points}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        lineCap="round"
        onClick={onSelect}
        onTap={onSelect}
      />
    );
  }
  if (shape.type === "sticky") {
    return (
      <Group
        x={shape.x}
        y={shape.y}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() } as any)}
      >
        <Rect
          width={shape.width}
          height={shape.height}
          fill={shape.fill}
          stroke={stroke ?? "#e0c060"}
          strokeWidth={selected ? 2 : 1}
          cornerRadius={4}
          shadowColor="rgba(0,0,0,0.25)"
          shadowBlur={6}
          shadowOffset={{ x: 0, y: 2 }}
        />
        <Text
          text={shape.text}
          x={10}
          y={10}
          width={shape.width - 20}
          height={shape.height - 20}
          fontSize={16}
          fill="#1c1e25"
        />
      </Group>
    );
  }
  if (shape.type === "text") {
    return (
      <Text
        x={shape.x}
        y={shape.y}
        text={shape.text}
        fontSize={shape.fontSize}
        fill={shape.fill}
        fontStyle="500"
        stroke={stroke}
        strokeWidth={selected ? 0.5 : 0}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() } as any)}
      />
    );
  }
  if (shape.type === "image") {
    return (
      <UrlImage
        shape={shape}
        selected={selected}
        onSelect={onSelect}
        onChange={onChange}
        draggable={draggable}
      />
    );
  }
  return null;
}

function UrlImage({
  shape,
  selected,
  onSelect,
  onChange,
  draggable,
}: {
  shape: any;
  selected: boolean;
  onSelect: () => void;
  onChange: (p: any) => void;
  draggable: boolean;
}) {
  const [img] = useImage(shape.src);
  const accent =
    typeof window !== "undefined"
      ? getComputedStyle(document.documentElement)
          .getPropertyValue("--accent")
          .trim() || "#0d9488"
      : "#0d9488";
  return (
    <KImage
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      image={img}
      stroke={selected ? accent : undefined}
      strokeWidth={selected ? 2 : 0}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
    />
  );
}

function hitTest(sh: Shape, x: number, y: number): boolean {
  if (sh.type === "rect" || sh.type === "sticky" || sh.type === "image") {
    const w = (sh as any).width;
    const h = (sh as any).height;
    return x >= sh.x && x <= sh.x + w && y >= sh.y && y <= sh.y + h;
  }
  if (sh.type === "text") {
    const w = (sh.text.length * (sh as any).fontSize) / 2;
    const h = (sh as any).fontSize * 1.2;
    return x >= sh.x && x <= sh.x + w && y >= sh.y && y <= sh.y + h;
  }
  if (sh.type === "line" || sh.type === "pen") {
    const pts = (sh as any).points as number[];
    for (let i = 0; i < pts.length - 2; i += 2) {
      const dx = pts[i + 2] - pts[i];
      const dy = pts[i + 3] - pts[i + 1];
      const t = Math.max(
        0,
        Math.min(1, ((x - pts[i]) * dx + (y - pts[i + 1]) * dy) / (dx * dx + dy * dy || 1))
      );
      const cx = pts[i] + t * dx;
      const cy = pts[i + 1] + t * dy;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist < 6) return true;
    }
  }
  return false;
}
