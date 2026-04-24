import type { BulletStyle, ListStyle, NumberStyle } from "../types";

const BULLET_GLYPH: Record<BulletStyle, string> = {
  disc: "\u2022",
  circle: "\u25CB",
  square: "\u25AA",
  dash: "\u2014",
  arrow: "\u203A",
};

export const BULLET_CASCADE: BulletStyle[] = [
  "disc",
  "circle",
  "square",
  "dash",
  "arrow",
];

export const NUMBER_CASCADE: NumberStyle[] = [
  "decimal",
  "alpha-lower",
  "roman-lower",
  "decimal-paren",
  "alpha-upper",
];

export const BULLET_OPTIONS: { id: BulletStyle; label: string; glyph: string }[] = [
  { id: "disc", label: "Disc", glyph: BULLET_GLYPH.disc },
  { id: "circle", label: "Circle", glyph: BULLET_GLYPH.circle },
  { id: "square", label: "Square", glyph: BULLET_GLYPH.square },
  { id: "dash", label: "Dash", glyph: BULLET_GLYPH.dash },
  { id: "arrow", label: "Arrow", glyph: BULLET_GLYPH.arrow },
];

export const NUMBER_OPTIONS: { id: NumberStyle; label: string; sample: string }[] = [
  { id: "decimal", label: "1, 2, 3", sample: "1." },
  { id: "decimal-paren", label: "1), 2), 3)", sample: "1)" },
  { id: "alpha-lower", label: "a, b, c", sample: "a." },
  { id: "alpha-upper", label: "A, B, C", sample: "A." },
  { id: "roman-lower", label: "i, ii, iii", sample: "i." },
];

function toAlpha(n: number): string {
  // 1 → A, 26 → Z, 27 → AA
  let s = "";
  let v = Math.max(1, Math.floor(n));
  while (v > 0) {
    const r = (v - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    v = Math.floor((v - 1) / 26);
  }
  return s;
}

function toRoman(n: number): string {
  const m: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let v = Math.max(1, Math.floor(n));
  let s = "";
  for (const [val, sym] of m) {
    while (v >= val) {
      s += sym;
      v -= val;
    }
  }
  return s;
}

export function bulletGlyphFor(indent: number, base?: BulletStyle): string {
  const baseIdx = base ? Math.max(0, BULLET_CASCADE.indexOf(base)) : 0;
  const i = ((baseIdx + Math.max(0, indent)) % BULLET_CASCADE.length + BULLET_CASCADE.length) % BULLET_CASCADE.length;
  return BULLET_GLYPH[BULLET_CASCADE[i]];
}

export function numberLabelFor(n: number, indent: number, base?: NumberStyle): string {
  const baseIdx = base ? Math.max(0, NUMBER_CASCADE.indexOf(base)) : 0;
  const i = ((baseIdx + Math.max(0, indent)) % NUMBER_CASCADE.length + NUMBER_CASCADE.length) % NUMBER_CASCADE.length;
  const style = NUMBER_CASCADE[i];
  switch (style) {
    case "decimal":       return `${n}.`;
    case "decimal-paren": return `${n})`;
    case "alpha-lower":   return `${toAlpha(n).toLowerCase()}.`;
    case "alpha-upper":   return `${toAlpha(n).toUpperCase()}.`;
    case "roman-lower":   return `${toRoman(n).toLowerCase()}.`;
  }
}

export function listPrefixFor(
  oneBasedIndex: number,
  indent: number,
  bullets: ListStyle,
  bulletStyle?: BulletStyle,
  numberStyle?: NumberStyle,
): string {
  if (bullets === "bulleted") return bulletGlyphFor(indent, bulletStyle);
  if (bullets === "numbered") return numberLabelFor(oneBasedIndex, indent, numberStyle);
  return "";
}

/** Prefix each non-empty line of `text` with the appropriate bullet/number
 *  glyph for the active list style. Empty lines are passed through unchanged
 *  (and don't advance the numeric counter). Used by the Konva render. */
export function formatListLines(
  text: string,
  bullets: ListStyle,
  indent: number,
  bulletStyle?: BulletStyle,
  numberStyle?: NumberStyle,
): string {
  if (bullets === "none") return text;
  const lines = text.split("\n");
  let n = 0;
  return lines
    .map((l) => {
      if (!l.length) return l;
      n += 1;
      return `${listPrefixFor(n, indent, bullets, bulletStyle, numberStyle)}  ${l}`;
    })
    .join("\n");
}
