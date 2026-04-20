import { useStore } from "../store";

export const RULER_SIZE = 28;

interface Props {
  width: number;
  height: number;
  showH?: boolean;
  showV?: boolean;
}

export function Rulers({ width, height, showH = true, showV = true }: Props) {
  const leftOffset = showV ? RULER_SIZE : 0;
  const topOffset = showH ? RULER_SIZE : 0;
  const zoom = useStore((s) => s.zoom);
  const pan = useStore((s) => s.pan);

  // pick a step in world units that renders nicely
  const targetPx = 80;
  const rawStep = targetPx / zoom;
  const niceStep = niceNumber(rawStep);
  const step = niceStep * zoom;
  const subStep = step / 5;

  // horizontal ruler ticks
  const horizontalStartWorld = Math.floor(-pan.x / zoom / niceStep) * niceStep;
  const horizontalTicks: { x: number; label: number; major: boolean }[] = [];
  let i = 0;
  while (true) {
    const worldVal = horizontalStartWorld + i * (niceStep / 5);
    const screenX = worldVal * zoom + pan.x;
    if (screenX > width + step) break;
    if (screenX > -step) {
      horizontalTicks.push({
        x: screenX,
        label: worldVal,
        major: i % 5 === 0,
      });
    }
    i++;
    if (i > 5000) break;
  }

  const verticalStartWorld = Math.floor(-pan.y / zoom / niceStep) * niceStep;
  const verticalTicks: { y: number; label: number; major: boolean }[] = [];
  let j = 0;
  while (true) {
    const worldVal = verticalStartWorld + j * (niceStep / 5);
    const screenY = worldVal * zoom + pan.y;
    if (screenY > height + step) break;
    if (screenY > -step) {
      verticalTicks.push({
        y: screenY,
        label: worldVal,
        major: j % 5 === 0,
      });
    }
    j++;
    if (j > 5000) break;
  }

  return (
    <>
      {/* corner — only when both rulers shown */}
      {showH && showV && (
        <div
          className="absolute top-0 left-0 z-10 bg-ink-900 border-r border-b border-ink-700"
          style={{ width: RULER_SIZE, height: RULER_SIZE }}
        />
      )}
      {/* horizontal ruler */}
      {showH && (
      <div
        className="absolute top-0 z-10 bg-ink-900 border-b border-ink-700 overflow-hidden"
        style={{
          left: leftOffset,
          right: 0,
          height: RULER_SIZE,
        }}
      >
        <svg width="100%" height={RULER_SIZE} className="block">
          {horizontalTicks.map((t, k) => (
            <g key={k} transform={`translate(${t.x - RULER_SIZE},0)`}>
              <line
                x1={0}
                x2={0}
                y1={t.major ? 8 : 14}
                y2={RULER_SIZE}
                stroke={t.major ? "var(--text-secondary)" : "var(--text-muted)"}
                strokeWidth={1}
              />
              {t.major && (
                <text
                  x={3}
                  y={9}
                  fontSize={9}
                  fill="var(--text-secondary)"
                  fontFamily="ui-sans-serif, system-ui"
                >
                  {Math.round(t.label)}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      )}
      {/* vertical ruler */}
      {showV && (
      <div
        className="absolute left-0 z-10 bg-ink-900 border-r border-ink-700 overflow-hidden"
        style={{
          top: topOffset,
          bottom: 0,
          width: RULER_SIZE,
        }}
      >
        <svg width={RULER_SIZE} height="100%" className="block">
          {verticalTicks.map((t, k) => (
            <g key={k} transform={`translate(0,${t.y - RULER_SIZE})`}>
              <line
                x1={t.major ? 8 : 14}
                x2={RULER_SIZE}
                y1={0}
                y2={0}
                stroke={t.major ? "var(--text-secondary)" : "var(--text-muted)"}
                strokeWidth={1}
              />
              {t.major && (
                <text
                  x={RULER_SIZE - 4}
                  y={3}
                  fontSize={9}
                  fill="var(--text-secondary)"
                  fontFamily="ui-sans-serif, system-ui"
                  textAnchor="end"
                  dominantBaseline="hanging"
                >
                  {Math.round(t.label)}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      )}
    </>
  );
}

export const RULER_OFFSET = RULER_SIZE;

function niceNumber(x: number): number {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  let nice;
  if (f < 1.5) nice = 1;
  else if (f < 3.5) nice = 2;
  else if (f < 7.5) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}
