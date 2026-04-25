// ─────────────────────────────────────────────────────────────────────────────
// RichTextRender.tsx — Konva renderer for TextContent.
//
// Two execution paths sharing the same JSX entry point:
//
//   FAST PATH (no doc, or doc is trivial)
//     Renders a single <Text> Konva node using the flat fields verbatim. This
//     is BYTE-IDENTICAL to the renderer that lived inline in Canvas.tsx /
//     PresenterShape.tsx before rich text — about ~90% of real content goes
//     through this path. We don't pay any layout cost for the common case.
//
//   MULTI-RUN PATH (doc with inline marks, mixed paragraphs, lists, alignment)
//     Walks `text.doc` via `layoutDoc` (textLayout.ts) into per-line, per-run
//     positions and emits one <Text> per run + an optional <Rect> behind for
//     per-run highlight. The CSS font string we measure with is the same one
//     Konva renders with, so layout drift between edit-mode preview and the
//     final canvas render is byte-equivalent.
//
// Both paths render INSIDE the parent shape's coordinate frame: the caller
// passes box bounds (x, y, width, height) and we lay text out at the
// canonical 6px inset, leaving the parent's bgColor rect to the caller (it's
// a per-element fill, not a per-run highlight).
//
// Used by Canvas.tsx (UnifiedShapeNode + sticky body) and PresenterShape.tsx
// — they delegate so behaviour stays in lockstep across editor + presenter.
// ─────────────────────────────────────────────────────────────────────────────

import { Group, Rect, Text } from "react-konva";
import type { TextContent } from "../types";
import { docIsTrivial, hasDocContent } from "../lib/tiptapDoc";
import {
  cssFontFor,
  defaultsFromTextContent,
  indentPx,
  layoutDoc,
  type LaidOutLine,
  type LaidOutParagraph,
} from "../lib/textLayout";
import { formatListLines, listPrefixFor } from "../lib/listFormat";

const PAD = 6;

export type RichTextRenderProps = {
  /** Top-left x of the parent shape's bounding box (no padding applied). */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  text: TextContent;
  /** When true, suppress the renderer entirely (used while the edit overlay
   *  is active for this shape). */
  hidden?: boolean;
};

export function RichTextRender({
  x,
  y,
  width,
  height,
  rotation = 0,
  text,
  hidden = false,
}: RichTextRenderProps) {
  if (hidden) return null;

  const useDoc = !!text.doc && hasDocContent(text.doc);
  const trivial = !useDoc || docIsTrivial(text.doc);

  // ── Fast path: single styled Text matching the legacy render exactly ────
  if (trivial) {
    if (!text.text || text.text.length === 0) return null;
    const indent = (text.indent ?? 0) * 16;
    return (
      <Text
        x={x + PAD + indent}
        y={y + PAD}
        width={Math.max(1, width - PAD * 2 - indent)}
        height={Math.max(1, height - PAD * 2)}
        rotation={rotation}
        text={formatListLines(
          text.text,
          text.bullets,
          text.indent ?? 0,
          text.bulletStyle,
          text.numberStyle,
        )}
        fontFamily={text.font}
        fontSize={text.fontSize}
        fontStyle={fontStyleFor(text.bold, text.italic)}
        textDecoration={textDecorationFor(text.underline, text.strike ?? false)}
        align={text.align}
        verticalAlign={text.verticalAlign ?? "top"}
        fill={text.color}
        listening={false}
      />
    );
  }

  // ── Multi-run path: lay out the doc and emit per-run nodes ──────────────
  const innerW = Math.max(1, width - PAD * 2);
  const innerH = Math.max(1, height - PAD * 2);
  const defaults = defaultsFromTextContent(text);
  const layout = layoutDoc(text.doc!, innerW, defaults);

  // Vertical alignment: shift the entire block by the box's leftover space.
  const va = text.verticalAlign ?? "top";
  let blockOffsetY = 0;
  if (layout.totalHeight < innerH) {
    if (va === "middle") blockOffsetY = (innerH - layout.totalHeight) / 2;
    else if (va === "bottom") blockOffsetY = innerH - layout.totalHeight;
  }

  return (
    <Group
      x={x + PAD}
      y={y + PAD + blockOffsetY}
      rotation={rotation}
      listening={false}
      clipFunc={(ctx) => {
        // Clip to the box so overflow doesn't leak outside the parent shape.
        ctx.beginPath();
        ctx.rect(-PAD, -PAD, width, height);
        ctx.closePath();
      }}
    >
      {layout.paragraphs.map((p, pi) => (
        <ParagraphNode
          key={pi}
          paragraph={p}
          boxWidth={innerW}
          listIndexBase={1}
          listBulletStyle={text.bulletStyle}
          listNumberStyle={text.numberStyle}
        />
      ))}
    </Group>
  );
}

function ParagraphNode({
  paragraph,
  boxWidth,
  listBulletStyle,
  listNumberStyle,
}: {
  paragraph: LaidOutParagraph;
  boxWidth: number;
  listIndexBase: number;
  listBulletStyle?: TextContent["bulletStyle"];
  listNumberStyle?: TextContent["numberStyle"];
}) {
  const gutter = indentPx(paragraph.attrs.indent, paragraph.attrs.listKind);
  return (
    <Group y={paragraph.y} listening={false}>
      {/* Per-paragraph list prefix (bullet glyph or number) on the first line. */}
      {paragraph.attrs.listKind && paragraph.lines[0] && (
        <ListPrefix
          line={paragraph.lines[0]}
          listKind={paragraph.attrs.listKind}
          listIndex={paragraph.attrs.listIndex ?? 1}
          indent={paragraph.attrs.indent}
          gutter={gutter}
          bulletStyle={listBulletStyle}
          numberStyle={listNumberStyle}
        />
      )}
      {paragraph.lines.map((line, li) => (
        <LineNode
          key={li}
          line={line}
          align={paragraph.attrs.align}
          gutter={gutter}
          boxWidth={boxWidth}
        />
      ))}
    </Group>
  );
}

function ListPrefix({
  line,
  listKind,
  listIndex,
  indent,
  gutter,
  bulletStyle,
  numberStyle,
}: {
  line: LaidOutLine;
  listKind: "bullet" | "number";
  listIndex: number;
  indent: number;
  gutter: number;
  bulletStyle?: TextContent["bulletStyle"];
  numberStyle?: TextContent["numberStyle"];
}) {
  const prefix = listPrefixFor(
    listIndex,
    indent,
    listKind === "bullet" ? "bulleted" : "numbered",
    bulletStyle,
    numberStyle,
  );
  if (!prefix) return null;
  // Use the first run's typography so the bullet matches the paragraph style.
  const firstRun = line.runs[0];
  const fontFamily = firstRun?.fontFamily ?? "sans-serif";
  const fontSize = firstRun?.fontSize ?? 14;
  const color = firstRun?.color ?? "#000";
  const bold = firstRun?.bold ?? false;
  const italic = firstRun?.italic ?? false;
  return (
    <Text
      x={gutter - 18}
      y={line.y}
      text={prefix}
      fontFamily={fontFamily}
      fontSize={fontSize}
      fontStyle={fontStyleFor(bold, italic)}
      fill={color}
      listening={false}
    />
  );
}

function LineNode({
  line,
  align,
  gutter,
  boxWidth,
}: {
  line: LaidOutLine;
  align: "left" | "center" | "right" | "justify";
  gutter: number;
  boxWidth: number;
}) {
  const lineSpace = Math.max(0, boxWidth - gutter);
  let lineX = gutter;
  if (align === "center") {
    lineX = gutter + (lineSpace - line.width) / 2;
  } else if (align === "right") {
    lineX = gutter + (lineSpace - line.width);
  }
  // Justify: spread inter-word gaps. Skip the last line of a paragraph (no
  // way to know "last" inside this component without more plumbing — for v1
  // we apply justify uniformly which is the common newspaper-style behaviour
  // that users expect).
  let extraGap = 0;
  if (align === "justify" && line.runs.length > 1 && line.width < lineSpace) {
    const gaps = line.runs.length - 1;
    if (gaps > 0) extraGap = (lineSpace - line.width) / gaps;
  }

  return (
    <Group y={line.y} listening={false}>
      {/* Line-level highlight pass: per-run rects at line height. v1 keeps
          this simple; cap-height-aware highlights are deferred to v1.1. */}
      {line.runs.map((r, i) =>
        r.bgColor ? (
          <Rect
            key={`bg${i}`}
            x={lineX + r.x + i * extraGap}
            y={0}
            width={r.width}
            height={line.height}
            fill={r.bgColor}
            listening={false}
          />
        ) : null,
      )}
      {line.runs.map((r, i) => {
        // Konva positions text by its top edge with the size, so we can use
        // the run's own fontSize here. Vertical-center mixed-size runs by
        // shifting smaller runs down so their baselines align with the line
        // baseline.
        const dy = line.baseline - r.fontSize;
        return (
          <Text
            key={`r${i}`}
            x={lineX + r.x + i * extraGap}
            y={dy}
            text={r.text}
            fontFamily={r.fontFamily}
            fontSize={r.fontSize}
            fontStyle={fontStyleFor(r.bold, r.italic)}
            textDecoration={textDecorationFor(r.underline, r.strike)}
            fill={r.color}
            listening={false}
          />
        );
      })}
    </Group>
  );
}

function fontStyleFor(bold: boolean, italic: boolean): string {
  const parts: string[] = [];
  if (italic) parts.push("italic");
  if (bold) parts.push("bold");
  return parts.length ? parts.join(" ") : "normal";
}

function textDecorationFor(underline: boolean, strike: boolean): string {
  const parts: string[] = [];
  if (underline) parts.push("underline");
  if (strike) parts.push("line-through");
  return parts.join(" ");
}

// re-export cssFontFor at this seam so consumers that need it for measurement
// in non-render contexts can grab it from a single import path.
export { cssFontFor };
