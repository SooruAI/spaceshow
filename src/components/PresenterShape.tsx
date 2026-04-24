import { useEffect, useRef } from "react";
import {
  Rect,
  Text,
  Line,
  Group,
  Circle,
  Ellipse,
  RegularPolygon,
  Star as KStar,
  Path as KPath,
  Image as KImage,
} from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import { KIND_RENDERER, shapePathFor } from "../lib/shapePaths";
import { formatListLines } from "../lib/listFormat";
import type {
  EraseMark,
  ImageShape,
  LineStyle,
  PenShape,
  Shape,
  ShapeShape,
} from "../types";

/**
 * Read-only renderer for every supported Shape variant. Mirrors the visual
 * behavior of Canvas.tsx's `ShapeNode` family (ShapeNode / UnifiedShapeNode /
 * PenShapeNode / UrlImage) but strips every piece of interactivity —
 * no drag handlers, no double-click, no selection ring. Used by:
 *   (a) PresenterView's fullscreen Konva stage
 *   (b) SheetSelectionModal's mini-thumbnails
 *
 * Because the presenter renders inside a <Group scaleX={fit} scaleY={fit}>
 * already, stored strokeWidths in "world" units scale naturally. Legacy
 * screen-px strokes are pre-divided by `zoom` — which is always 1 inside
 * presentation — so they render at their stored pixel size. This matches
 * how the editor treats strokes at zoom=1.
 */
export function PresenterShape({ shape }: { shape: Shape }) {
  if (!shape.visible) return null;

  if (shape.type === "rect") {
    return (
      <Rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill={shape.fill}
        cornerRadius={2}
        listening={false}
      />
    );
  }
  if (shape.type === "shape") {
    return <UnifiedPresenterShape shape={shape} />;
  }
  if (shape.type === "pen") {
    return <PresenterPenShape shape={shape} />;
  }
  if (shape.type === "line") {
    const strokeWidth =
      shape.strokeWidthUnit === "world"
        ? (shape.strokeWidth ?? 1)
        : (shape.strokeWidth ?? 1);
    return (
      <Line
        points={shape.points}
        stroke={shape.stroke}
        strokeWidth={strokeWidth}
        opacity={shape.opacity ?? 1}
        lineCap="round"
        listening={false}
      />
    );
  }
  if (shape.type === "sticky") {
    return (
      <Group x={shape.x} y={shape.y} listening={false}>
        <Rect
          width={shape.width}
          height={shape.height}
          fill={shape.fill}
          stroke="#e0c060"
          strokeWidth={1}
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
  if (shape.type === "image") {
    return <PresenterImageShape shape={shape} />;
  }
  return null;
}

/** Dash pattern for shape/sheet borders — mirrors Canvas.tsx's dashFor. */
function dashFor(style: LineStyle, weight: number): number[] | undefined {
  if (style === "solid" || style === "double") return undefined;
  if (style === "dotted") return [1, Math.max(2, weight * 1.5)];
  if (style === "dashed")
    return [Math.max(4, weight * 3), Math.max(3, weight * 2)];
  return undefined;
}

function fontStyleFor(bold: boolean, italic: boolean): string {
  const parts: string[] = [];
  if (italic) parts.push("italic");
  if (bold) parts.push("bold");
  return parts.join(" ") || "normal";
}

/**
 * Presenter version of UnifiedShapeNode. Same dispatch logic through
 * KIND_RENDERER; same style props; same in-shape text overlay via
 * formatListLines. Strips all interactive handlers.
 */
function UnifiedPresenterShape({ shape }: { shape: ShapeShape }) {
  const [fillImg] = useImage(shape.style.imageFill?.src ?? "");
  const renderer = KIND_RENDERER[shape.kind];
  const w = Math.max(1, shape.width);
  const h = Math.max(1, shape.height);
  const style = shape.style;

  const borderStroke = style.borderEnabled ? style.borderColor : undefined;
  const borderWidth = style.borderEnabled ? style.borderWeight : 0;
  const dash = style.borderEnabled
    ? dashFor(style.borderStyle, style.borderWeight)
    : undefined;

  const fillProps: Record<string, unknown> = {};
  if (style.imageFill?.src && fillImg) {
    fillProps.fillPatternImage = fillImg;
    const iw = fillImg.naturalWidth || fillImg.width || 1;
    const ih = fillImg.naturalHeight || fillImg.height || 1;
    if (style.imageFill.crop) {
      const c = style.imageFill.crop;
      const sx = w / Math.max(1, c.w);
      const sy = h / Math.max(1, c.h);
      fillProps.fillPatternScale = { x: sx, y: sy };
      fillProps.fillPatternOffset = { x: c.x, y: c.y };
    } else {
      const fit = style.imageFill.fit;
      const scale =
        fit === "contain"
          ? Math.min(w / iw, h / ih)
          : Math.max(w / iw, h / ih);
      fillProps.fillPatternScale = { x: scale, y: scale };
      fillProps.fillPatternOffset = {
        x: iw / 2 - w / (2 * scale),
        y: ih / 2 - h / (2 * scale),
      };
    }
  } else {
    fillProps.fill = style.fillColor;
  }

  const commonProps = {
    ...fillProps,
    opacity: style.fillOpacity,
    stroke: borderStroke,
    strokeWidth: borderWidth,
    dash,
    rotation: shape.rotation ?? 0,
    listening: false,
  };

  const node =
    renderer === "rect" ? (
      <Rect
        {...commonProps}
        x={shape.x}
        y={shape.y}
        width={w}
        height={h}
        cornerRadius={style.cornerRadius}
      />
    ) : renderer === "ellipse" ? (
      <Ellipse
        {...commonProps}
        x={shape.x + w / 2}
        y={shape.y + h / 2}
        radiusX={w / 2}
        radiusY={h / 2}
      />
    ) : renderer === "polygon" ? (
      <RegularPolygon
        {...commonProps}
        x={shape.x + w / 2}
        y={shape.y + h / 2}
        sides={
          shape.kind === "triangle"
            ? 3
            : Math.max(3, Math.min(12, shape.polygonSides ?? 6))
        }
        radius={Math.min(w, h) / 2}
      />
    ) : renderer === "star" ? (
      <KStar
        {...commonProps}
        x={shape.x + w / 2}
        y={shape.y + h / 2}
        numPoints={5}
        innerRadius={Math.min(w, h) / 4}
        outerRadius={Math.min(w, h) / 2}
      />
    ) : (
      <KPath
        {...commonProps}
        x={shape.x}
        y={shape.y}
        data={shapePathFor(shape.kind, w, h)}
      />
    );

  const text = shape.text;
  const showText = !!text && text.text.length > 0;
  const indentPx = (text?.indent ?? 0) * 16;
  const showBg = !!text && !!text.bgColor;
  return (
    <Group listening={false}>
      {node}
      {showBg && (
        <Rect
          x={shape.x}
          y={shape.y}
          width={w}
          height={h}
          rotation={shape.rotation ?? 0}
          fill={text!.bgColor}
          listening={false}
        />
      )}
      {showText && (
        <Text
          x={shape.x + 6 + indentPx}
          y={shape.y + 6}
          width={Math.max(1, w - 12 - indentPx)}
          height={h - 12}
          rotation={shape.rotation ?? 0}
          text={formatListLines(
            text!.text,
            text!.bullets,
            text!.indent ?? 0,
            text!.bulletStyle,
            text!.numberStyle
          )}
          fontFamily={text!.font}
          fontSize={text!.fontSize}
          fontStyle={fontStyleFor(text!.bold, text!.italic)}
          textDecoration={text!.underline ? "underline" : ""}
          align={text!.align}
          verticalAlign="middle"
          fill={text!.color}
          listening={false}
        />
      )}
    </Group>
  );
}

/**
 * Read-only pen renderer with erase-mark support via a cached Konva Group
 * (destination-out compositing). Mirrors Canvas.tsx's PenShapeNode but
 * without drag handlers.
 */
function PresenterPenShape({ shape }: { shape: PenShape }) {
  const groupRef = useRef<Konva.Group>(null);
  const marks: EraseMark[] = shape.eraseMarks ?? [];
  const hasMarks = marks.length > 0;
  // Presenter renders at zoom=1 inside its group; world-unit strokes render
  // directly, screen-px strokes also render at stored value.
  const strokeWidth = shape.strokeWidth ?? 1;

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    if (hasMarks) {
      try {
        g.cache({ pixelRatio: 2 });
      } catch {
        /* no-op */
      }
    } else {
      g.clearCache();
    }
    g.getLayer()?.batchDraw();
  }, [hasMarks, marks, shape.points, shape.strokeWidth, shape.stroke, shape.opacity]);

  return (
    <Group
      ref={groupRef}
      x={shape.x}
      y={shape.y}
      rotation={shape.rotation ?? 0}
      listening={false}
    >
      <Line
        points={shape.points}
        stroke={shape.stroke}
        strokeWidth={strokeWidth}
        opacity={shape.opacity ?? 1}
        tension={0.5}
        lineCap="round"
        lineJoin="round"
      />
      {marks.map((m, i) => (
        <Circle
          key={i}
          x={m.cx}
          y={m.cy}
          radius={m.r}
          fill="#000"
          globalCompositeOperation="destination-out"
          listening={false}
        />
      ))}
    </Group>
  );
}

/** Read-only image renderer. */
function PresenterImageShape({ shape }: { shape: ImageShape }) {
  const [img] = useImage(shape.src);
  return (
    <KImage
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      image={img}
      listening={false}
    />
  );
}
