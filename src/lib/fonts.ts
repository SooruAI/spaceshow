export type FontCategory =
  | "System"
  | "Clean Sans-Serif"
  | "Traditional Serif"
  | "Slab Serif"
  | "Monospace"
  | "Handwriting"
  | "Architectural"
  | "Display"
  | "Stencil";

export interface TextFont {
  label: string;
  value: string;
  category: FontCategory;
}

// Display order for the picker. Categories with a strong design identity surface
// near the top; less-used groups sit at the bottom.
export const FONT_CATEGORIES: FontCategory[] = [
  "System",
  "Clean Sans-Serif",
  "Traditional Serif",
  "Slab Serif",
  "Monospace",
  "Handwriting",
  "Architectural",
  "Display",
  "Stencil",
];

export const TEXT_FONTS: TextFont[] = [
  // System — locally available, no Google Fonts dependency.
  { label: "Calibri",         value: 'Calibri, Carlito, Arial, sans-serif',          category: "System" },
  { label: "Arial",           value: 'Arial, Helvetica, sans-serif',                 category: "System" },
  { label: "Segoe UI",        value: '"Segoe UI", system-ui, sans-serif',            category: "System" },
  { label: "Helvetica",       value: 'Helvetica, Arial, sans-serif',                 category: "System" },
  { label: "Verdana",         value: 'Verdana, Geneva, sans-serif',                  category: "System" },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif',              category: "System" },
  { label: "Century Gothic",  value: '"Century Gothic", "Trebuchet MS", sans-serif', category: "System" },
  { label: "Consolas",        value: 'Consolas, "Courier New", monospace',           category: "System" },

  // Clean Sans-Serif — workhorse UI/body faces.
  { label: "Inter",              value: 'Inter, "Segoe UI", Arial, sans-serif',                category: "Clean Sans-Serif" },
  { label: "Roboto",             value: 'Roboto, "Segoe UI", Arial, sans-serif',               category: "Clean Sans-Serif" },
  { label: "Open Sans",          value: '"Open Sans", "Segoe UI", Arial, sans-serif',          category: "Clean Sans-Serif" },
  { label: "Lato",               value: 'Lato, "Segoe UI", Arial, sans-serif',                 category: "Clean Sans-Serif" },
  { label: "Montserrat",         value: 'Montserrat, "Segoe UI", Arial, sans-serif',           category: "Clean Sans-Serif" },
  { label: "Poppins",            value: 'Poppins, "Segoe UI", Arial, sans-serif',              category: "Clean Sans-Serif" },
  { label: "Nunito",             value: 'Nunito, "Segoe UI", Arial, sans-serif',               category: "Clean Sans-Serif" },
  { label: "Nunito Sans",        value: '"Nunito Sans", "Segoe UI", Arial, sans-serif',        category: "Clean Sans-Serif" },
  { label: "Source Sans 3",      value: '"Source Sans 3", "Segoe UI", Arial, sans-serif',      category: "Clean Sans-Serif" },
  { label: "Work Sans",          value: '"Work Sans", "Segoe UI", Arial, sans-serif',          category: "Clean Sans-Serif" },
  { label: "DM Sans",            value: '"DM Sans", "Segoe UI", Arial, sans-serif',            category: "Clean Sans-Serif" },
  { label: "Manrope",            value: 'Manrope, "Segoe UI", Arial, sans-serif',              category: "Clean Sans-Serif" },
  { label: "Plus Jakarta Sans",  value: '"Plus Jakarta Sans", "Segoe UI", Arial, sans-serif',  category: "Clean Sans-Serif" },
  { label: "Outfit",             value: 'Outfit, "Segoe UI", Arial, sans-serif',               category: "Clean Sans-Serif" },
  { label: "Figtree",            value: 'Figtree, "Segoe UI", Arial, sans-serif',              category: "Clean Sans-Serif" },
  { label: "Mulish",             value: 'Mulish, "Segoe UI", Arial, sans-serif',               category: "Clean Sans-Serif" },
  { label: "Karla",              value: 'Karla, "Segoe UI", Arial, sans-serif',                category: "Clean Sans-Serif" },
  { label: "Rubik",              value: 'Rubik, "Segoe UI", Arial, sans-serif',                category: "Clean Sans-Serif" },
  { label: "IBM Plex Sans",      value: '"IBM Plex Sans", "Segoe UI", Arial, sans-serif',      category: "Clean Sans-Serif" },
  { label: "Quicksand",          value: 'Quicksand, "Segoe UI", Arial, sans-serif',            category: "Clean Sans-Serif" },
  { label: "Barlow",             value: 'Barlow, "Segoe UI", Arial, sans-serif',               category: "Clean Sans-Serif" },
  { label: "Heebo",              value: 'Heebo, "Segoe UI", Arial, sans-serif',                category: "Clean Sans-Serif" },
  { label: "PT Sans",            value: '"PT Sans", "Segoe UI", Arial, sans-serif',            category: "Clean Sans-Serif" },

  // Traditional Serif.
  { label: "Merriweather",       value: 'Merriweather, Georgia, serif',                  category: "Traditional Serif" },
  { label: "Lora",               value: 'Lora, Georgia, serif',                          category: "Traditional Serif" },
  { label: "Playfair Display",   value: '"Playfair Display", Georgia, serif',            category: "Traditional Serif" },
  { label: "PT Serif",           value: '"PT Serif", Georgia, serif',                    category: "Traditional Serif" },
  { label: "Source Serif 4",     value: '"Source Serif 4", Georgia, serif',              category: "Traditional Serif" },
  { label: "Crimson Text",       value: '"Crimson Text", Georgia, serif',                category: "Traditional Serif" },
  { label: "EB Garamond",        value: '"EB Garamond", Garamond, Georgia, serif',       category: "Traditional Serif" },
  { label: "Cormorant Garamond", value: '"Cormorant Garamond", Garamond, Georgia, serif', category: "Traditional Serif" },
  { label: "Libre Baskerville",  value: '"Libre Baskerville", Georgia, serif',           category: "Traditional Serif" },
  { label: "Bitter",             value: 'Bitter, Georgia, serif',                        category: "Traditional Serif" },
  { label: "Spectral",           value: 'Spectral, Georgia, serif',                      category: "Traditional Serif" },
  { label: "Noto Serif",         value: '"Noto Serif", Georgia, serif',                  category: "Traditional Serif" },

  // Slab Serif.
  { label: "Roboto Slab",   value: '"Roboto Slab", "Roboto", Georgia, serif',     category: "Slab Serif" },
  { label: "Arvo",          value: 'Arvo, "Roboto Slab", Georgia, serif',         category: "Slab Serif" },
  { label: "Zilla Slab",    value: '"Zilla Slab", "Roboto Slab", Georgia, serif', category: "Slab Serif" },
  { label: "Alfa Slab One", value: '"Alfa Slab One", "Roboto Slab", serif',       category: "Slab Serif" },
  { label: "Bree Serif",    value: '"Bree Serif", "Roboto Slab", serif',          category: "Slab Serif" },
  { label: "Bevan",         value: 'Bevan, "Roboto Slab", serif',                 category: "Slab Serif" },
  { label: "Patua One",     value: '"Patua One", "Roboto Slab", serif',           category: "Slab Serif" },
  { label: "Josefin Slab",  value: '"Josefin Slab", "Roboto Slab", serif',        category: "Slab Serif" },

  // Monospace.
  { label: "JetBrains Mono",   value: '"JetBrains Mono", Consolas, "Courier New", monospace',   category: "Monospace" },
  { label: "Fira Code",        value: '"Fira Code", Consolas, "Courier New", monospace',        category: "Monospace" },
  { label: "Source Code Pro",  value: '"Source Code Pro", Consolas, "Courier New", monospace',  category: "Monospace" },
  { label: "Roboto Mono",      value: '"Roboto Mono", Consolas, "Courier New", monospace',      category: "Monospace" },
  { label: "IBM Plex Mono",    value: '"IBM Plex Mono", Consolas, "Courier New", monospace',    category: "Monospace" },
  { label: "Inconsolata",      value: 'Inconsolata, Consolas, "Courier New", monospace',        category: "Monospace" },
  { label: "Space Mono",       value: '"Space Mono", Consolas, "Courier New", monospace',       category: "Monospace" },
  { label: "Ubuntu Mono",      value: '"Ubuntu Mono", Consolas, "Courier New", monospace',      category: "Monospace" },

  // Handwriting / Script.
  { label: "SpaceScript",         value: '"Caveat", "Dancing Script", cursive',                category: "Handwriting" },
  { label: "Indie Flower",        value: '"Indie Flower", cursive',                            category: "Handwriting" },
  { label: "Dancing Script",      value: '"Dancing Script", cursive',                          category: "Handwriting" },
  { label: "Pacifico",            value: 'Pacifico, "Dancing Script", cursive',                category: "Handwriting" },
  { label: "Sacramento",          value: 'Sacramento, "Dancing Script", cursive',              category: "Handwriting" },
  { label: "Great Vibes",         value: '"Great Vibes", "Dancing Script", cursive',           category: "Handwriting" },
  { label: "Satisfy",             value: 'Satisfy, "Dancing Script", cursive',                 category: "Handwriting" },
  { label: "Kalam",               value: 'Kalam, "Indie Flower", cursive',                     category: "Handwriting" },
  { label: "Shadows Into Light",  value: '"Shadows Into Light", "Indie Flower", cursive',      category: "Handwriting" },
  { label: "Patrick Hand",        value: '"Patrick Hand", "Indie Flower", cursive',            category: "Handwriting" },
  { label: "Permanent Marker",    value: '"Permanent Marker", "Indie Flower", cursive',        category: "Handwriting" },
  { label: "Reenie Beanie",       value: '"Reenie Beanie", "Indie Flower", cursive',           category: "Handwriting" },
  { label: "Homemade Apple",      value: '"Homemade Apple", "Indie Flower", cursive',          category: "Handwriting" },
  { label: "Gloria Hallelujah",   value: '"Gloria Hallelujah", "Indie Flower", cursive',       category: "Handwriting" },
  { label: "Amatic SC",           value: '"Amatic SC", "Indie Flower", cursive',               category: "Handwriting" },
  { label: "Caveat",              value: 'Caveat, "Dancing Script", cursive',                  category: "Handwriting" },

  // Architectural / drafting.
  { label: "Architects Daughter", value: '"Architects Daughter", "Indie Flower", cursive',     category: "Architectural" },
  { label: "Special Elite",       value: '"Special Elite", "Courier New", monospace',          category: "Architectural" },
  { label: "Megrim",              value: 'Megrim, "Architects Daughter", sans-serif',          category: "Architectural" },
  { label: "Cutive Mono",         value: '"Cutive Mono", "Courier New", monospace',            category: "Architectural" },
  { label: "Major Mono Display",  value: '"Major Mono Display", "Courier New", monospace',     category: "Architectural" },
  { label: "Audiowide",           value: 'Audiowide, "Segoe UI", sans-serif',                  category: "Architectural" },

  // Display — high-impact, headline use.
  { label: "Bungee",         value: 'Bungee, Impact, sans-serif',              category: "Display" },
  { label: "Lobster",        value: 'Lobster, "Dancing Script", cursive',      category: "Display" },
  { label: "Righteous",      value: 'Righteous, Impact, sans-serif',           category: "Display" },
  { label: "Anton",          value: 'Anton, Impact, sans-serif',               category: "Display" },
  { label: "Bowlby One",     value: '"Bowlby One", Impact, sans-serif',        category: "Display" },
  { label: "Comfortaa",      value: 'Comfortaa, "Segoe UI", sans-serif',       category: "Display" },
  { label: "Russo One",      value: '"Russo One", Impact, sans-serif',         category: "Display" },
  { label: "Press Start 2P", value: '"Press Start 2P", "Courier New", monospace', category: "Display" },
  { label: "Monoton",        value: 'Monoton, Impact, sans-serif',             category: "Display" },
  { label: "Abril Fatface",  value: '"Abril Fatface", Georgia, serif',         category: "Display" },
  { label: "Bangers",        value: 'Bangers, Impact, sans-serif',             category: "Display" },
  { label: "Fredoka",        value: 'Fredoka, "Segoe UI", sans-serif',         category: "Display" },

  // Stencil.
  { label: "Stardos Stencil",   value: '"Stardos Stencil", Impact, sans-serif',  category: "Stencil" },
  { label: "Allerta Stencil",   value: '"Allerta Stencil", Impact, sans-serif',  category: "Stencil" },
  { label: "Saira Stencil One", value: '"Saira Stencil One", Impact, sans-serif', category: "Stencil" },
  { label: "Black Ops One",     value: '"Black Ops One", Impact, sans-serif',    category: "Stencil" },
];

export const DEFAULT_TEXT_FONT = TEXT_FONTS[0].value;

export const TEXT_COLOR_SWATCHES: { label: string; value: string }[] = [
  { label: "Black",  value: "#000000" },
  { label: "Red",    value: "#ef4444" },
  { label: "Green",  value: "#22c55e" },
  { label: "Blue",   value: "#3b82f6" },
  { label: "Orange", value: "#f97316" },
  { label: "Purple", value: "#a855f7" },
];
