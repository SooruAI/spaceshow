// ─────────────────────────────────────────────────────────────────────────────
// textLayout.ts — rich-text layout for the Konva renderer.
//
// Walks a Tiptap doc → list of laid-out lines, where each line carries N runs
// with their final x-offsets. The renderer (RichTextRender.tsx) consumes the
// output and emits one Konva.Text per run. Measurement uses a single offscreen
// canvas with the same CSS font string we hand to Konva (`cssFontFor`), so
// edit-mode-vs-Konva-render drift is byte-equivalent — a font_string is the
// only safe interop seam between layout math and Konva's internal measurer.
//
// Two fast paths to keep this cheap:
//   1. Layout cache keyed on (docRevision, boxWidth, defaultsHash). Bumping
//      `docRevision` is the responsibility of the writer (applyDoc); on every
//      doc change the cache miss is one-shot, then subsequent re-renders read
//      from cache.
//   2. Font-load fast-path. Before measuring a run, `document.fonts.check()`
//      tells us if the file is loaded. If yes → measure synchronously. If no
//      → measure with the fallback (so we never block paint), kick off a real
//      load, and bump a global revision counter on resolve so the next render
//      misses the cache and re-measures with the now-loaded font.
//
// CJK / non-Latin word breaking is not handled — greedy split-on-whitespace
// covers ~99% of real input. Documented limitation.
// ─────────────────────────────────────────────────────────────────────────────

import type { TextContent, TipTapDoc } from "../types";

// Match Konva's default line-height so single-Text fast-path and multi-run
// path agree. Konva uses 1.0 by default; SpaceShow's existing render passes
// no override, so lineHeight = fontSize. We bump to 1.2 in the multi-run
// path because mixed-size lines look cramped at 1.0.
export const LINE_HEIGHT_MULT = 1.2;

// ── Run + Line shapes ───────────────────────────────────────────────────────

export type Run = {
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  bgColor?: string;
};

export type ParagraphAttrs = {
  align: "left" | "center" | "right" | "justify";
  /** "bullet" | "number" | undefined */
  listKind?: "bullet" | "number";
  /** 1-based position within the parent list (for numbered lists). */
  listIndex?: number;
  /** 0..N indent levels. */
  indent: number;
  /** When true the paragraph is a heading — heading style applied unless
   *  individual runs override. */
  heading?: 1 | 2 | 3;
};

export type LaidOutRun = Run & {
  x: number;        // x offset within line
  width: number;    // measured advance width
};

export type LaidOutLine = {
  /** y offset of the line's TOP relative to the paragraph block top. */
  y: number;
  height: number;   // line height (max fontSize × LINE_HEIGHT_MULT)
  baseline: number; // y of the baseline within the line, for vertical alignment of mixed-size runs
  width: number;    // measured line width (sum of run widths)
  runs: LaidOutRun[];
  paragraphAlign: "left" | "center" | "right" | "justify";
};

export type LaidOutParagraph = {
  attrs: ParagraphAttrs;
  lines: LaidOutLine[];
  /** Cumulative y offset relative to the doc block top. */
  y: number;
  height: number;
};

export type Layout = {
  paragraphs: LaidOutParagraph[];
  totalHeight: number;
};

export type LayoutDefaults = {
  font: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  bgColor?: string;
};

// ── CSS font string ─────────────────────────────────────────────────────────

/** Build the CSS font string used both for Canvas measureText AND Konva's
 *  fontFamily prop. Keeping these identical is what eliminates layout drift
 *  between edit-mode preview and final Konva render. */
export function cssFontFor(run: Pick<Run, "fontFamily" | "fontSize" | "bold" | "italic">): string {
  const style = run.italic ? "italic " : "";
  const weight = run.bold ? "bold " : "";
  return `${style}${weight}${run.fontSize}px ${run.fontFamily}`;
}

// ── Measurement (offscreen canvas + cache) ──────────────────────────────────

let _measureCtx: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (_measureCtx) return _measureCtx;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("textLayout: 2d context unavailable");
  _measureCtx = ctx;
  return ctx;
}

/** Bumped whenever a font load resolves so previously-cached layouts miss and
 *  re-measure with the freshly-loaded font. Components that use the layout
 *  cache should subscribe (or accept that their next render re-runs). */
let _fontLoadRevision = 0;
const _fontLoadInflight = new Map<string, Promise<void>>();

export function getFontLoadRevision(): number {
  return _fontLoadRevision;
}

function ensureFontLoaded(font: string): boolean {
  // Synchronous check — true if the browser already has the file.
  if (typeof document === "undefined" || !document.fonts) return true;
  if (document.fonts.check(font)) return true;
  if (!_fontLoadInflight.has(font)) {
    const p = document.fonts.load(font).then(() => {
      _fontLoadRevision += 1;
      _fontLoadInflight.delete(font);
    }).catch(() => {
      _fontLoadInflight.delete(font);
    });
    _fontLoadInflight.set(font, p as unknown as Promise<void>);
  }
  return false;
}

const _measureCache = new Map<string, number>();

/** Measure the advance width of `text` rendered with `run`'s font. Cached by
 *  (font, text) — most layouts hit the cache after first paint. */
export function measureRunText(
  text: string,
  run: Pick<Run, "fontFamily" | "fontSize" | "bold" | "italic">,
): number {
  if (text.length === 0) return 0;
  const font = cssFontFor(run);
  const cacheKey = `${font}\u0000${text}`;
  const hit = _measureCache.get(cacheKey);
  if (hit !== undefined) return hit;
  // Kick the loader; if not loaded yet we still measure with whatever is
  // currently set (browser fallback) so paint doesn't block.
  ensureFontLoaded(font);
  const ctx = measureCtx();
  ctx.font = font;
  const w = ctx.measureText(text).width;
  _measureCache.set(cacheKey, w);
  return w;
}

// ── Doc walking + run extraction ────────────────────────────────────────────

type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
  content?: Node[];
};

type ParaInput = {
  attrs: ParagraphAttrs;
  runs: Run[];
};

function paragraphsFromDoc(doc: TipTapDoc | undefined, defaults: LayoutDefaults): ParaInput[] {
  if (!doc) return [];
  const d = doc as { content?: Node[] };
  if (!d.content) return [];
  const out: ParaInput[] = [];
  walkBlocks(d.content, undefined, undefined, defaults, out);
  return out;
}

function walkBlocks(
  nodes: Node[],
  listKind: "bullet" | "number" | undefined,
  listIndentBase: number | undefined,
  defaults: LayoutDefaults,
  out: ParaInput[],
): void {
  let listIdx = 0;
  for (const n of nodes) {
    if (n.type === "paragraph" || n.type === "heading") {
      const align = readAlign(n);
      const heading = n.type === "heading" ? readHeadingLevel(n) : undefined;
      const indent = listIndentBase ?? 0;
      if (listKind) listIdx += 1;
      out.push({
        attrs: {
          align,
          listKind,
          listIndex: listKind ? listIdx : undefined,
          indent,
          heading,
        },
        runs: runsFromBlock(n, defaults, heading),
      });
    } else if (n.type === "bulletList" || n.type === "orderedList") {
      const kind = n.type === "bulletList" ? "bullet" : "number";
      const newIndent = (listIndentBase ?? -1) + 1;
      walkBlocks(n.content ?? [], kind, newIndent, defaults, out);
    } else if (n.type === "listItem") {
      walkBlocks(n.content ?? [], listKind, listIndentBase, defaults, out);
    } else if (n.content) {
      walkBlocks(n.content, listKind, listIndentBase, defaults, out);
    }
  }
}

function readAlign(n: Node): "left" | "center" | "right" | "justify" {
  const a = n.attrs && (n.attrs.textAlign as string | undefined);
  if (a === "left" || a === "center" || a === "right" || a === "justify") return a;
  return "left";
}

function readHeadingLevel(n: Node): 1 | 2 | 3 | undefined {
  const lvl = n.attrs && (n.attrs.level as number | undefined);
  if (lvl === 1 || lvl === 2 || lvl === 3) return lvl;
  return 1;
}

const HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 24, 2: 20, 3: 18 };

function runsFromBlock(block: Node, defaults: LayoutDefaults, heading: 1 | 2 | 3 | undefined): Run[] {
  const out: Run[] = [];
  const inline = block.content ?? [];
  for (const c of inline) {
    if (c.type === "text" && typeof c.text === "string") {
      out.push(buildRun(c, defaults, heading));
    } else if (c.type === "hardBreak") {
      out.push({
        text: "\n",
        fontFamily: defaults.font,
        fontSize: defaults.fontSize,
        color: defaults.color,
        bold: defaults.bold,
        italic: defaults.italic,
        underline: defaults.underline,
        strike: defaults.strike,
      });
    }
  }
  return out;
}

function buildRun(node: Node, defaults: LayoutDefaults, heading: 1 | 2 | 3 | undefined): Run {
  const headingDefaults =
    heading !== undefined
      ? { fontSize: HEADING_SIZE[heading], bold: true }
      : { fontSize: defaults.fontSize, bold: defaults.bold };
  const r: Run = {
    text: node.text ?? "",
    fontFamily: defaults.font,
    fontSize: headingDefaults.fontSize,
    color: defaults.color,
    bold: headingDefaults.bold,
    italic: defaults.italic,
    underline: defaults.underline,
    strike: defaults.strike,
    bgColor: defaults.bgColor,
  };
  for (const m of node.marks ?? []) {
    if (m.type === "bold") r.bold = true;
    else if (m.type === "italic") r.italic = true;
    else if (m.type === "underline") r.underline = true;
    else if (m.type === "strike") r.strike = true;
    else if (m.type === "textStyle") {
      const a = m.attrs ?? {};
      if (typeof a.color === "string") r.color = a.color;
      if (typeof a.fontFamily === "string") r.fontFamily = a.fontFamily;
      if (typeof a.fontSize === "number") r.fontSize = a.fontSize;
      else if (typeof a.fontSize === "string") {
        const px = parseFloat(a.fontSize);
        if (Number.isFinite(px)) r.fontSize = px;
      }
    } else if (m.type === "highlight") {
      const a = m.attrs ?? {};
      if (typeof a.color === "string") r.bgColor = a.color;
    }
  }
  return r;
}

// ── Greedy line break ───────────────────────────────────────────────────────

function breakParagraph(runs: Run[], maxWidth: number): { lines: LaidOutLine[]; height: number } {
  const lines: LaidOutLine[] = [];

  if (runs.length === 0) {
    const fontSize = 14;
    const h = fontSize * LINE_HEIGHT_MULT;
    return {
      lines: [
        {
          y: 0,
          height: h,
          baseline: fontSize,
          width: 0,
          runs: [],
          paragraphAlign: "left",
        },
      ],
      height: h,
    };
  }

  // Tokenise runs into <run, token> pairs where each token is either
  // whitespace or a non-whitespace word. We need this granularity to break
  // at whitespace boundaries while preserving each run's style.
  type Tok = { run: Run; text: string; isSpace: boolean; width: number };
  const tokens: Tok[] = [];
  for (const run of runs) {
    if (run.text.length === 0) continue;
    if (run.text === "\n") {
      tokens.push({ run, text: "\n", isSpace: false, width: 0 });
      continue;
    }
    // Split on whitespace, keeping the whitespace tokens separate.
    const parts = run.text.split(/(\s+)/).filter((p) => p.length > 0);
    for (const p of parts) {
      const isSpace = /^\s+$/.test(p);
      tokens.push({ run, text: p, isSpace, width: measureRunText(p, run) });
    }
  }

  let currentLine: Array<{ run: Run; text: string; width: number }> = [];
  let currentWidth = 0;

  function flushLine() {
    // Coalesce adjacent same-style fragments back into one run for fewer Konva
    // nodes per line.
    const coalesced: LaidOutRun[] = [];
    let x = 0;
    let maxFs = 14;
    for (const tok of currentLine) {
      const last = coalesced[coalesced.length - 1];
      if (last && sameStyle(last, tok.run)) {
        last.text += tok.text;
        last.width += tok.width;
      } else {
        coalesced.push({
          ...tok.run,
          text: tok.text,
          x,
          width: tok.width,
        });
      }
      x += tok.width;
      if (tok.run.fontSize > maxFs) maxFs = tok.run.fontSize;
    }
    // Re-flow x positions in case coalesce changed widths via float rounding.
    let cx = 0;
    for (const r of coalesced) {
      r.x = cx;
      cx += r.width;
    }
    const height = maxFs * LINE_HEIGHT_MULT;
    const baseline = maxFs;
    lines.push({
      y: 0, // patched below
      height,
      baseline,
      width: cx,
      runs: coalesced,
      paragraphAlign: "left",
    });
    currentLine = [];
    currentWidth = 0;
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // Hard break.
    if (tok.text === "\n") {
      flushLine();
      continue;
    }

    // Skip leading whitespace at start of line.
    if (currentLine.length === 0 && tok.isSpace) continue;

    // Fits on current line.
    if (currentWidth + tok.width <= maxWidth || currentLine.length === 0) {
      currentLine.push({ run: tok.run, text: tok.text, width: tok.width });
      currentWidth += tok.width;
      continue;
    }

    // Doesn't fit — break before this token. Trim trailing whitespace on the
    // closing line.
    while (
      currentLine.length > 0 &&
      /^\s+$/.test(currentLine[currentLine.length - 1].text)
    ) {
      const last = currentLine.pop()!;
      currentWidth -= last.width;
    }
    flushLine();

    // Skip the whitespace token we just broke at.
    if (tok.isSpace) continue;
    currentLine.push({ run: tok.run, text: tok.text, width: tok.width });
    currentWidth += tok.width;
  }

  if (currentLine.length > 0) flushLine();

  // If we ended with zero lines (e.g. paragraph was all-whitespace), emit an
  // empty line so blank paragraphs still take vertical space.
  if (lines.length === 0) {
    const fontSize = runs[0]?.fontSize ?? 14;
    lines.push({
      y: 0,
      height: fontSize * LINE_HEIGHT_MULT,
      baseline: fontSize,
      width: 0,
      runs: [],
      paragraphAlign: "left",
    });
  }

  // Patch line y values + total height.
  let y = 0;
  for (const l of lines) {
    l.y = y;
    y += l.height;
  }
  return { lines, height: y };
}

function sameStyle(a: Run, b: Run): boolean {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strike === b.strike &&
    a.bgColor === b.bgColor
  );
}

// ── Top-level layout entrypoint with cache ──────────────────────────────────

const _layoutCache = new Map<string, Layout>();

function defaultsHash(d: LayoutDefaults): string {
  return [
    d.font,
    d.fontSize,
    d.color,
    d.bold ? 1 : 0,
    d.italic ? 1 : 0,
    d.underline ? 1 : 0,
    d.strike ? 1 : 0,
    d.bgColor ?? "",
  ].join("|");
}

/** Lay out a doc into lines/runs ready for the Konva renderer. Caching key
 *  is (docRef, boxWidth, defaults, fontLoadRevision). The doc itself is used
 *  by reference because callers (Zustand store) replace it on every write,
 *  giving us free invalidation. */
export function layoutDoc(
  doc: TipTapDoc,
  boxWidth: number,
  defaults: LayoutDefaults,
): Layout {
  const key = `${docKey(doc)}|${boxWidth.toFixed(2)}|${defaultsHash(defaults)}|${_fontLoadRevision}`;
  const hit = _layoutCache.get(key);
  if (hit) return hit;

  const paras = paragraphsFromDoc(doc, defaults);
  const out: LaidOutParagraph[] = [];
  let y = 0;
  for (const p of paras) {
    const { lines, height } = breakParagraph(p.runs, boxWidth - indentPx(p.attrs.indent, p.attrs.listKind));
    for (const l of lines) l.paragraphAlign = p.attrs.align;
    out.push({ attrs: p.attrs, lines, y, height });
    y += height;
  }
  const result: Layout = { paragraphs: out, totalHeight: y };

  // Bound cache to avoid unbounded growth on long sessions.
  if (_layoutCache.size > 256) _layoutCache.clear();
  _layoutCache.set(key, result);
  return result;
}

const _docKeys = new WeakMap<object, string>();
let _docKeyCounter = 0;
function docKey(doc: TipTapDoc): string {
  const o = doc as unknown as object;
  let k = _docKeys.get(o);
  if (!k) {
    _docKeyCounter += 1;
    k = `d${_docKeyCounter}`;
    _docKeys.set(o, k);
  }
  return k;
}

/** Indent gutter in pixels. List items get extra room for their bullet glyph. */
export function indentPx(indent: number, listKind?: "bullet" | "number"): number {
  const base = Math.max(0, indent) * 24;
  return base + (listKind ? 24 : 0);
}

/** Pull `LayoutDefaults` from a `TextContent`'s flat snapshot. Used by the
 *  Konva renderer when invoking `layoutDoc`. */
export function defaultsFromTextContent(t: TextContent): LayoutDefaults {
  return {
    font: t.font,
    fontSize: t.fontSize,
    color: t.color,
    bold: t.bold,
    italic: t.italic,
    underline: t.underline,
    strike: t.strike ?? false,
    bgColor: t.bgColor,
  };
}
