// Placeholder settings for the test version. Change these once the real printer,
// pricing and ordering are decided (see .notes/open-items.md in the project folder).
export const BUILD_VOLUME = { x: 256, y: 256, z: 256, label: "Bambu Lab P1/X1 size (placeholder)" };

// Same formula as the Express 3D chime designer: bounding-box volume in cubic inches.
export const PRICING = { base: 16.16, multiplier: 1.185, exponent: 0.5753 };

export const MIN_FEATURE_MM = 1.2;

export const COLORS = [
  { label: "Black", value: "#1b1c1e" },
  { label: "White", value: "#e9e7e1" },
  { label: "Gray", value: "#8b8f94" },
  { label: "Red", value: "#c8362d" },
  { label: "Orange", value: "#f0742b" },
  { label: "Yellow", value: "#f2c230" },
  { label: "Green", value: "#2f8f5b" },
  { label: "Blue", value: "#2f5fb3" },
  { label: "Purple", value: "#6c4bb4" },
  { label: "Gold", value: "#c9a033" },
];

export const FONTS = [
  { family: "Archivo Black", file: "/fonts/archivo-black.woff" },
  { family: "Space Mono", file: "/fonts/space-mono-bold.woff" },
  { family: "Pacifico", file: "/fonts/pacifico.woff" },
];

export function estimatePrice(sizeMm) {
  if (!sizeMm) return 0;
  const cubicIn = (sizeMm[0] / 25.4) * (sizeMm[1] / 25.4) * (sizeMm[2] / 25.4);
  return PRICING.base + PRICING.multiplier * Math.pow(cubicIn, PRICING.exponent);
}
