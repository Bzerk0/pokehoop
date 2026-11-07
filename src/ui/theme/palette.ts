// The one palette (32 colours). src/index.css mirrors it in @theme so Tailwind classes use the same names
// (bg-night, text-gold, …); palette.test.ts fails if the two drift apart.
export const PALETTE = {
  black: "#0b0b14",
  night: "#1a1b2e",
  navy: "#24305e",
  slate: "#3b4570",
  steel: "#5d6b98",
  fog: "#94a0c4",
  cloud: "#c9d1e8",
  white: "#f4f4f0",
  maroon: "#5c1a2b",
  red: "#c4303a",
  orange: "#e8702a",
  amber: "#f4a83a",
  gold: "#f8d84a",
  cream: "#f8eec0",
  brown: "#7a4a2a",
  tan: "#c08a50",
  wood: "#d8a060",
  olive: "#8a8a3a",
  forest: "#1f5a3a",
  green: "#3fa34d",
  lime: "#9ad84a",
  mint: "#b8f0c0",
  ocean: "#1f4fa0",
  blue: "#3a7ae0",
  sky: "#6ab8f0",
  ice: "#b0e8f8",
  teal: "#2a9a9a",
  plum: "#4a2a6a",
  purple: "#8048c0",
  lavender: "#b890e8",
  magenta: "#b0337f",
  pink: "#f08ab8",
} as const;

export type PaletteName = keyof typeof PALETTE;

export const TYPE_COLOR: Record<string, PaletteName> = {
  normal: "tan",
  fire: "orange",
  water: "blue",
  grass: "green",
  electric: "gold",
  ice: "ice",
  fighting: "red",
  poison: "purple",
  ground: "wood",
  flying: "sky",
  psychic: "magenta",
  bug: "lime",
  rock: "olive",
  ghost: "plum",
  dragon: "ocean",
  dark: "brown",
  steel: "steel",
  fairy: "pink",
};

/** relative luminance (WCAG) of a palette colour */
function luminance(name: PaletteName) {
  const hex = PALETTE[name];
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: PaletteName, b: PaletteName) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** black or white, whichever has more contrast on this palette colour */
export const inkOn = (name: PaletteName): PaletteName => (contrast(name, "black") >= contrast(name, "white") ? "black" : "white");

export const typeColor = (type: string) => PALETTE[TYPE_COLOR[type] ?? "fog"];
export const typeInk = (type: string) => PALETTE[inkOn(TYPE_COLOR[type] ?? "fog")];
