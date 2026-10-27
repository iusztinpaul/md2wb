// Tables -> PNG cards (header band, zebra rows, wrapped text, rounded corners,
// soft shadow). Neither Substack nor X Articles accepts pasted HTML tables.

import type { Font } from "opentype.js";
import type { TableStyle } from "./targets.js";
import { FONTS, escapeXml, fontMetrics, loadFont, svgToPng, textWidth } from "./raster.js";

export type Align = "left" | "center" | "right";

export interface TableCell {
  text: string;
  align: Align;
  header: boolean;
}

const COLORS = {
  text: "#1f2937",
  headerText: "#0f172a",
  background: "#ffffff",
  headerBackground: "#eef2ff",
  stripe: "#f8fafc",
  border: "#dbe4ee",
  canvas: "#ffffff",
  shadow: "#0f172a",
};
const BORDER = 1;
const LINE_GAP = 4;
const MIN_COL_WIDTH = 64;

interface CellFont {
  font: Font;
  size: number;
  ascent: number;
  lineHeight: number;
}

function cellFont(file: string, size: number): CellFont {
  const font = loadFont(file);
  const { ascent, descent } = fontMetrics(font, size);
  return { font, size, ascent, lineHeight: Math.round(ascent + descent) + LINE_GAP };
}

export function renderTable(rows: TableCell[][], style: TableStyle): Buffer {
  const cols = Math.max(...rows.map((row) => row.length));
  const body = cellFont(FONTS.sans, style.fontSize);
  const header = cellFont(FONTS.sansBold, Math.max(style.fontSize + 1, Math.floor(style.fontSize * 1.06)));
  const fontOf = (cell: TableCell) => (cell.header ? header : body);
  const padX = style.cellPaddingX;
  const padY = style.cellPaddingY;

  // Natural column widths, then stretched or squeezed to fill the canvas.
  const minCol = MIN_COL_WIDTH + 2 * padX;
  const natural: number[] = Array(cols).fill(minCol);
  for (const row of rows) {
    row.forEach((cell, i) => {
      const { font, size } = fontOf(cell);
      const widest = Math.max(...cell.text.split("\n").map((line) => textWidth(font, line, size)));
      natural[i] = Math.max(natural[i]!, Math.ceil(widest) + 2 * padX);
    });
  }
  const shadowExtent = style.shadowAlpha > 0 ? style.shadowBlur + Math.abs(style.shadowOffsetY) : 0;
  const margin = style.outerPadding + shadowExtent;
  const target = Math.max(style.imageWidth - 2 * margin - (cols + 1) * BORDER, cols * minCol);
  const widths = fitWidths(natural, target, minCol);

  const layout = rows.map((row) =>
    widths.map((width, i) => {
      const cell = row[i] ?? { text: "", align: "left" as Align, header: row.some((c) => c.header) };
      const font = fontOf(cell);
      return { cell, font, lines: wrapText(cell.text, width - 2 * padX, font) };
    }),
  );
  const heights = layout.map((row) =>
    Math.max(...row.map(({ font, lines }) => Math.max(font.lineHeight, lines.length * font.lineHeight) + 2 * padY)),
  );

  const tableWidth = widths.reduce((a, b) => a + b, 0) + (cols + 1) * BORDER;
  const tableHeight = heights.reduce((a, b) => a + b, 0) + (rows.length + 1) * BORDER;
  const canvasWidth = Math.max(style.imageWidth, tableWidth + 2 * margin);
  const canvasHeight = tableHeight + 2 * margin;
  const tx = Math.floor((canvasWidth - tableWidth) / 2);
  const ty = Math.floor((canvasHeight - tableHeight) / 2);

  const parts: string[] = [];
  let y = ty + BORDER;
  let bodyRow = 0;
  layout.forEach((row, r) => {
    const isHeaderRow = row.some(({ cell }) => cell.header);
    const height = heights[r]!;
    let x = tx + BORDER;
    row.forEach(({ cell, font, lines }, c) => {
      const width = widths[c]!;
      const fill = cell.header ? COLORS.headerBackground : bodyRow % 2 === 1 ? COLORS.stripe : COLORS.background;
      parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`);

      const anchor = cell.align === "center" ? "middle" : cell.align === "right" ? "end" : "start";
      const textX = cell.align === "center" ? x + width / 2 : cell.align === "right" ? x + width - padX : x + padX;
      const top = y + Math.max((height - lines.length * font.lineHeight) / 2, 0);
      const attrs = `font-size="${font.size}"${cell.header ? ' font-weight="bold"' : ""} fill="${cell.header ? COLORS.headerText : COLORS.text}" text-anchor="${anchor}"`;
      lines.forEach((line, i) => {
        if (line) {
          parts.push(`<text x="${textX}" y="${top + i * font.lineHeight + font.ascent}" ${attrs}>${escapeXml(line)}</text>`);
        }
      });
      x += width + BORDER;
    });
    if (!isHeaderRow) bodyRow++;
    y += height + BORDER;
  });

  const radius = style.borderRadius;
  const box = `x="${tx}" y="${ty}" width="${tableWidth}" height="${tableHeight}" rx="${radius}"`;
  const shadow =
    style.shadowAlpha > 0
      ? `<filter id="blur" filterUnits="userSpaceOnUse" x="0" y="0" width="${canvasWidth}" height="${canvasHeight}"><feGaussianBlur stdDeviation="${style.shadowBlur / 2}"/></filter>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${canvasWidth}" height="${canvasHeight}" font-family="DejaVu Sans">
<defs>${shadow}<clipPath id="card"><rect ${box}/></clipPath></defs>
<rect width="${canvasWidth}" height="${canvasHeight}" fill="${COLORS.canvas}"/>
${shadow ? `<rect x="${tx}" y="${ty + style.shadowOffsetY}" width="${tableWidth}" height="${tableHeight}" rx="${radius}" fill="${COLORS.shadow}" fill-opacity="${style.shadowAlpha / 255}" filter="url(#blur)"/>` : ""}
<g clip-path="url(#card)">
<rect ${box} fill="${COLORS.border}"/>
${parts.join("\n")}
</g>
</svg>`;
  return svgToPng(svg);
}

/**
 * Make column widths sum to `target`. Spare room is shared out evenly. When
 * the table is too wide, columns that fit within an equal share keep their
 * natural width and only the wider ones are capped (and then wrap), so short
 * headers never break mid-word.
 */
export function fitWidths(widths: number[], target: number, min: number): number[] {
  const total = widths.reduce((a, b) => a + b, 0);
  const fitted = [...widths];
  if (total > target) {
    const order = widths.map((_, i) => i).sort((a, b) => widths[a]! - widths[b]!);
    let remaining = target;
    order.forEach((col, k) => {
      const share = Math.max(min, Math.floor(remaining / (order.length - k)));
      fitted[col] = Math.min(widths[col]!, share);
      remaining -= fitted[col]!;
    });
  }
  // Hand out leftover pixels round-robin.
  let diff = target - fitted.reduce((a, b) => a + b, 0);
  for (let i = 0; diff > 0; i++, diff--) fitted[i % fitted.length]!++;
  return fitted;
}

function wrapText(text: string, maxWidth: number, { font, size }: CellFont): string[] {
  const fits = (s: string) => textWidth(font, s, size) <= maxWidth;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(" ").filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate)) {
        current = candidate;
      } else if (fits(word)) {
        if (current) lines.push(current);
        current = word;
      } else {
        // A single word wider than the column: break it by characters.
        if (current) lines.push(current);
        current = "";
        for (const ch of word) {
          if (current && !fits(current + ch)) {
            lines.push(current);
            current = ch;
          } else {
            current += ch;
          }
        }
      }
    }
    lines.push(current);
  }
  return lines;
}
