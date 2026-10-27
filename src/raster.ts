// Shared helpers for the generated images: bundled fonts, text measurement,
// SVG -> PNG rasterization and XML escaping.

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
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "") // not allowed in XML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
