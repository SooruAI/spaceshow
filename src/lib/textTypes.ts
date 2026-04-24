export type TextType = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "body";

export interface TextTypePreset {
  id: TextType;
  label: string;
  shortLabel: string;
  fontSize: number;
  bold: boolean;
}

export const TEXT_TYPE_PRESETS: ReadonlyArray<TextTypePreset> = [
  { id: "h1",   label: "Heading 1", shortLabel: "H1",   fontSize: 32, bold: true  },
  { id: "h2",   label: "Heading 2", shortLabel: "H2",   fontSize: 26, bold: true  },
  { id: "h3",   label: "Heading 3", shortLabel: "H3",   fontSize: 22, bold: true  },
  { id: "h4",   label: "Heading 4", shortLabel: "H4",   fontSize: 18, bold: true  },
  { id: "h5",   label: "Heading 5", shortLabel: "H5",   fontSize: 16, bold: true  },
  { id: "h6",   label: "Heading 6", shortLabel: "H6",   fontSize: 14, bold: true  },
  { id: "body", label: "Body",      shortLabel: "Body", fontSize: 14, bold: false },
];

export const DEFAULT_TEXT_TYPE: TextType = "body";

/** Infer which preset (if any) matches a given size + weight. Returns null
 *  when the user has hand-tweaked size/bold off-preset — UI shows "Custom". */
export function inferTextType(fontSize: number, bold: boolean): TextType | null {
  const m = TEXT_TYPE_PRESETS.find((p) => p.fontSize === fontSize && p.bold === bold);
  return m ? m.id : null;
}

export function getTextTypePreset(id: TextType): TextTypePreset {
  return TEXT_TYPE_PRESETS.find((p) => p.id === id)!;
}
