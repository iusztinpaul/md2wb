// Code blocks -> syntax-highlighted PNG panels (line-number gutter, language
// footer, thin border, outer padding), laid out like nb2wb's code images.

import { type BundledLanguage, bundledLanguages, codeToTokens } from "shiki";
import type { CodeStyle } from "./targets.js";
import { FONTS, escapeXml, fontMetrics, hexToRgb, isDark, loadFont, shift, svgToPng, textWidth } from "./raster.js";

const PAD = 24; // inner padding around the code
const LINE_GAP = 4; // extra space between lines
const FOOTER_FONT_RATIO = 0.58;
const LINE_NUMBER_COLOR = "#6e6e6e";

// Shiki handles these plain-text names without a grammar.
const PLAIN_LANGS = new Set(["text", "txt", "plain", "plaintext"]);

export async function renderCode(source: string, lang: string, style: CodeStyle): Promise<Buffer> {
  const known = PLAIN_LANGS.has(lang) || Object.hasOwn(bundledLanguages, lang);
  const { tokens, bg = "#272822" } = await codeToTokens(source.replace(/\t/g, "    "), {
    lang: (known ? lang : "text") as BundledLanguage,
    theme: style.theme,
  });
  const lines = tokens.length ? tokens : [[]];

  const font = loadFont(FONTS.mono);
  const size = style.fontSize;
  const { ascent, descent } = fontMetrics(font, size);
  const lineHeight = Math.round(ascent + descent) + LINE_GAP;

  const gutterWidth = Math.round(textWidth(font, "0".repeat(String(lines.length).length + 1), size)) + PAD;
  const contentWidth = Math.max(
    ...lines.map((line) => textWidth(font, line.map((t) => t.content).join(""), size)),
  );
  const panelWidth = Math.max(Math.ceil(contentWidth) + gutterWidth + 2 * PAD, 120, style.imageWidth);
  const bodyHeight = Math.max(lineHeight * lines.length + 2 * PAD, lineHeight + PAD);

  const footerSize = Math.max(Math.floor(size * FOOTER_FONT_RATIO), 12);
  const footer = fontMetrics(font, footerSize);
  const footerLineHeight = Math.round(footer.ascent + footer.descent);
  const footerHeight = footerLineHeight + PAD;
  const panelHeight = bodyHeight + 1 + footerHeight;

  const rgb = hexToRgb(bg);
  const dark = isDark(rgb);
  const width = panelWidth + 2 * style.paddingX;
  const height = panelHeight + 2 * style.paddingY;

  const codeLines = lines.map((line, i) => {
    const y = PAD + i * lineHeight + ascent;
    const number = `<text x="${gutterWidth - 4}" y="${y}" text-anchor="end" fill="${LINE_NUMBER_COLOR}">${i + 1}</text>`;
    const spans = line
      .filter((token) => token.content)
      .map((token) => `<tspan fill="${token.color ?? "#f8f8f2"}">${escapeXml(token.content)}</tspan>`)
      .join("");
    return `${number}<text x="${gutterWidth + PAD}" y="${y}">${spans}</text>`;
  });
  const label = lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : "";
  const footerY = bodyHeight + 1 + (footerHeight - footerLineHeight) / 2 + footer.ascent;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${width}" height="${height}">
<rect width="${width}" height="${height}" fill="${shift(rgb, dark ? 25 : 20)}"/>
<g transform="translate(${style.paddingX} ${style.paddingY})" font-family="DejaVu Sans Mono" font-size="${size}">
<rect width="${panelWidth}" height="${bodyHeight}" fill="${bg}"/>
<rect width="${gutterWidth}" height="${bodyHeight}" fill="${shift(rgb, -18)}"/>
<rect x="${gutterWidth}" width="1" height="${bodyHeight}" fill="${shift(rgb, -30)}"/>
${codeLines.join("\n")}
<rect y="${bodyHeight}" width="${panelWidth}" height="${footerHeight + 1}" fill="${shift(rgb, -12)}"/>
<rect y="${bodyHeight}" width="${panelWidth}" height="1" fill="${shift(rgb, -25)}"/>
<text x="${panelWidth - PAD}" y="${footerY}" text-anchor="end" font-size="${footerSize}" fill="${shift(rgb, dark ? 50 : -50)}">${escapeXml(label)}</text>
<rect x="0.5" y="0.5" width="${panelWidth - 1}" height="${panelHeight - 1}" fill="none" stroke="${shift(rgb, dark ? 40 : -40)}"/>
</g>
</svg>`;
  return svgToPng(svg);
}
