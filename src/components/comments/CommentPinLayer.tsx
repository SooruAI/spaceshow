import { Circle, Group } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useStore } from "../../store";
import type { Thread } from "../../types";

interface Props {
  zoom: number;
}

/**
 * Renders thread pins inside the Canvas world <Group>.
 *
 * Per-sheet threads are nested inside that sheet's rotation group so they
 * pan + zoom + rotate with the sheet for free (mirrors the per-sheet shape
 * layer). Board-level threads render in a sibling group at world origin.
 * All size/stroke values are divided by `zoom` so pins keep constant
 * screen-size as the user zooms.
 */
export function CommentPinLayer({ zoom }: Props) {
  const threads = useStore((s) => s.threads);
  const sheets = useStore((s) => s.sheets);

  const bySheet = new Map<string, Thread[]>();
  const board: Thread[] = [];
  for (const t of threads) {
    if (t.canvasId === "board") {
      board.push(t);
    } else {
      const list = bySheet.get(t.canvasId) ?? [];
      list.push(t);
      bySheet.set(t.canvasId, list);
    }
  }

  return (
    <>
      {sheets.map((s) => {
        const list = bySheet.get(s.id);
        if (!list || list.length === 0) return null;
        const rotation = s.rotation ?? 0;
        const cx = s.x + s.width / 2;
        const cy = s.y + s.height / 2;
        return (
          <Group
            key={`pins-${s.id}`}
            x={cx}
            y={cy}
            offsetX={s.width / 2}
            offsetY={s.height / 2}
            rotation={rotation}
            listening
          >
            {list.map((t) => (
              <Pin key={t.id} thread={t} zoom={zoom} />
            ))}
          </Group>
        );
      })}
      {board.map((t) => (
        <Pin key={t.id} thread={t} zoom={zoom} />
      ))}
    </>
  );
}

function Pin({ thread, zoom }: { thread: Thread; zoom: number }) {
  // Equality selectors: each pin only re-renders when its own active/hover
  // boolean flips — not on every hover change across the whole board.
  const isActive = useStore((s) => s.activeThreadId === thread.id);
  const isHover = useStore((s) => s.hoverThreadId === thread.id);
  const setActiveThread = useStore((s) => s.setActiveThread);
  const setHoverThreadId = useStore((s) => s.setHoverThreadId);
  const moveThread = useStore((s) => s.moveThread);
  const resolved = thread.status === "resolved";

  const r = 11 / zoom;
  const inner = 3 / zoom;
  const stroke = (isActive || isHover) ? 2 / zoom : 0;
  const fill = resolved ? "#6b7280" : "#6366f1";
  const opacity = resolved ? 0.35 : 1;

  function onClick(e: KonvaEventObject<MouseEvent | TouchEvent>) {
    e.cancelBubble = true;
    // Pin layer is now mounted only when the comments rail is open
    // (gated in Canvas.tsx by `showComments`), so we don't need to
    // open the rail here. Just set the active thread — the
    // ThreadPopover anchored to this pin mounts via its own gate.
    // Konva suppresses click after a successful drag, so this fires
    // only on a tap-without-movement and never on a drag release.
    setActiveThread(thread.id);
  }

  function setStageCursor(e: KonvaEventObject<unknown>, cursor: string) {
    const stage = e.target.getStage();
    if (stage) stage.container().style.cursor = cursor;
  }

  function onDragStart(e: KonvaEventObject<DragEvent>) {
    e.cancelBubble = true;
    setStageCursor(e, "grabbing");
  }

  function onDragMove(e: KonvaEventObject<DragEvent>) {
    // Live-commit only when this pin's popover is open — the popover is
    // the only consumer that needs to follow the pin during the drag,
    // and a 60Hz store update would re-render the whole thread list /
    // pin layer for nothing when no popover is anchored here.
    // Pinless drags still commit a single time on dragend.
    if (!isActive) return;
    moveThread(thread.id, { x: e.target.x(), y: e.target.y() });
  }

  function onDragEnd(e: KonvaEventObject<DragEvent>) {
    moveThread(thread.id, { x: e.target.x(), y: e.target.y() });
    // If the pointer is still over the pin (typical case — user dropped
    // it and is hovering), restore the grab cursor; otherwise clear.
    setStageCursor(e, isHover ? "grab" : "");
  }

  function onMouseEnter(e: KonvaEventObject<MouseEvent>) {
    setHoverThreadId(thread.id);
    setStageCursor(e, "grab");
  }

  function onMouseLeave(e: KonvaEventObject<MouseEvent>) {
    setHoverThreadId(null);
    setStageCursor(e, "");
  }

  return (
    <Group
      x={thread.coordinates.x}
      y={thread.coordinates.y}
      opacity={opacity}
      draggable
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onClick={onClick as (e: KonvaEventObject<MouseEvent>) => void}
      onTap={onClick as (e: KonvaEventObject<TouchEvent>) => void}
    >
      <Circle
        radius={r}
        fill={fill}
        stroke={stroke > 0 ? "#ffffff" : undefined}
        strokeWidth={stroke}
        hitStrokeWidth={12 / zoom}
        shadowColor="rgba(0,0,0,0.4)"
        shadowBlur={6 / zoom}
        shadowOffset={{ x: 0, y: 1 / zoom }}
      />
      <Circle radius={inner} fill="#ffffff" listening={false} />
    </Group>
  );
}
