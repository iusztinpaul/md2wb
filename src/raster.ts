// Shared helpers for the generated images: bundled fonts, text measurement,
// SVG -> PNG rasterization and small color utilities.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import opentype, { type Font } from "opentype.js";

const require = createRequire(import.meta.url);

// Fonts ship with the dejavu-fonts-ttf package, so rendering never depends on
// what happens to be installed on the machine.
export const FONTS = {
  sans: require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"),
  sansBold: require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"),
  serif: require.resolve("dejavu-fonts-ttf/ttf/DejaVuSerif.ttf"),
  mono: require.resolve("dejavu-fonts-ttf/ttf/DejaVuSansMono.ttf"),
} as const;

const parsedFonts = new Map<string, Font>();

export function loadFont(file: string): Font {
  let font = parsedFonts.get(file);
  if (!font) {
    const data = readFileSync(file);
    font = opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    parsedFonts.set(file, font);
  }
  return font;
}

export interface TextMetrics {
  ascent: number;
  descent: number;
}

export function fontMetrics(font: Font, size: number): TextMetrics {
  return {
    ascent: (font.ascender / font.unitsPerEm) * size,
    descent: (-font.descender / font.unitsPerEm) * size,
  };
}

/** Sum of glyph advances (no shaping), a close upper bound of the rendered width. */
export function textWidth(font: Font, text: string, size: number): number {
  let units = 0;
  for (const ch of text) units += font.charToGlyph(ch).advanceWidth ?? 0;
  return (units / font.unitsPerEm) * size;
}

export function svgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: Object.values(FONTS),
      defaultFontFamily: "DejaVu Sans",
    },
  });
  return resvg.render().asPng();
}

export function pngDataUri(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(h)) return [200, 200, 200];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Brighten (positive) or darken (negative) every channel by a fixed amount. */
export function shift(rgb: Rgb, amount: number): string {
  return rgbToHex(rgb.map((c) => Math.max(0, Math.min(255, c + amount))) as Rgb);
}

export function isDark([r, g, b]: Rgb): boolean {
  return (r + g + b) / 3 < 128;
}
