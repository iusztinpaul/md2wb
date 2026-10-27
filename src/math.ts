// Display math: source normalization, equation numbering, and MathJax
// rendering to PNG. MathJax runs in-process, so no TeX install is needed.

import MathJax, { type MathJaxInstance } from "mathjax";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { MathStyle } from "./targets.js";
import { svgToPng } from "./raster.js";

// TeX math cannot span a blank line, so neither can a match; this also stops
// a stray `\[` from swallowing everything up to a later `\]`.
const BODY = String.raw`(?:(?!\n[ \t]*\n)[\s\S])`;
const DISPLAY_RE = new RegExp(
  String.raw`\$\$${BODY}+?\$\$|\\\[${BODY}+?\\\]|\\begin\{(equation|align|gather|multline|eqnarray)(\*?)\}${BODY}*?\\end\{\1\2\}`,
  "g",
);
const DISPLAY_DOLLARS_RE = new RegExp(String.raw`\$\$(${BODY}+?)\$\$`, "g");
const LABEL_RE = /(?<!\\)\\label\{([^}]+)\}/g;
const EQREF_RE = /(?<!\\)\\eqref\{([^}]+)\}/g;
const PLACEHOLDER_RE = /\u0000(\d+)\u0000/g;

export interface PreparedMarkdown {
  markdown: string;
  /** Equation label -> number, in document order. */
  labels: Map<string, number>;
}

/**
 * Rewrite `\[...\]` and bare `\begin{equation|align|...}` blocks as `$$` math
 * (the only display syntax remark-math knows), number `\label`ed equations and
 * resolve `\eqref{...}` references to `(N)`. `\[...\]` counts as math only on
 * its own lines; inside a paragraph it is Markdown's escaped brackets. Dollar
 * signs that are prices rather than math get escaped.
 */
export function prepareMath(source: string): PreparedMarkdown {
  // Code (fenced, indented or inline) must never be touched by the rewrites
  // below; let the Markdown parser find it and swap it for placeholders.
  const stash: string[] = [];
  let text = "";
  let last = 0;
  visit(unified().use(remarkParse).parse(source), (node) => {
    if ((node.type === "code" || node.type === "inlineCode") && node.position) {
      const { start, end } = node.position;
      text += `${source.slice(last, start.offset)}\u0000${stash.push(source.slice(start.offset, end.offset)) - 1}\u0000`;
      last = end.offset!;
    }
  });
  text += source.slice(last);

  text = text.replace(DISPLAY_RE, (match, _env, _star, offset: number, whole: string) => {
    if (match.startsWith("$$")) return match;
    const bracket = match.startsWith("\\[");
    const body = bracket ? match.slice(2, -2) : match;
    const lineStart = whole.lastIndexOf("\n", offset - 1) + 1;
    const indent = whole.slice(lineStart, offset);
    const lineEnd = whole.indexOf("\n", offset + match.length);
    const rest = whole.slice(offset + match.length, lineEnd === -1 ? undefined : lineEnd);
    // On its own lines (only blockquote `>` or list markers before it): a `$$`
    // block. Inside a paragraph: inline `$$...$$`.
    if (/^(?:[ \t>]|[-*+](?=[ \t])|\d{1,9}[.)](?=[ \t]))*$/.test(indent) && /^[ \t]*$/.test(rest)) {
      // Added lines repeat `>` but turn list markers into indentation.
      const cont = indent.replace(/[-*+]|\d{1,9}[.)]/g, (marker) => " ".repeat(marker.length));
      if (!bracket) return `$$\n${cont}${match}\n${cont}$$`;
      // The `$$` fences must sit on lines of their own.
      const head = /^[ \t]*\n/.test(body) ? "" : `\n${cont}`;
      const tail = /\n[ \t>]*$/.test(body) ? "" : `\n${cont}`;
      return `$$${head}${body}${tail}$$`;
    }
    return bracket ? match : `$$${body}$$`;
  });

  // Each image shows one number, so all labels in a block share it.
  const labels = new Map<string, number>();
  let count = 0;
  for (const [, latex] of text.matchAll(DISPLAY_DOLLARS_RE)) {
    const fresh = [...latex!.matchAll(LABEL_RE)].map(([, label]) => label!).filter((label) => !labels.has(label));
    if (fresh.length) count++;
    for (const label of fresh) labels.set(label, count);
  }
  text = text.replace(EQREF_RE, (ref, label: string) => {
    const n = labels.get(label);
    return n === undefined ? ref : `(${n})`;
  });

  return { markdown: escapePrices(text.replace(PLACEHOLDER_RE, (_, i: string) => stash[Number(i)]!)), labels };
}

/**
 * Pandoc's rule for inline math: no space just inside the dollars and no digit
 * right after the closing one. A `$...$` span that fails it is a price
 * ("$5 and $10"), not math.
 */
export function isPriceSpan(source: string, start: number, end: number): boolean {
  if (source.startsWith("$$", start)) return false;
  const math = /\S/.test(source[start + 1] ?? "") && /\S/.test(source[end - 2] ?? "") && !/\d/.test(source[end] ?? "");
  return !math;
}

const mathParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

/**
 * Escape the opening `$` of every price span so it stays text and the main
 * parse pairs the remaining dollars correctly. Escaping one span can re-pair
 * later dollars, hence the loop.
 */
function escapePrices(markdown: string): string {
  if (!markdown.includes("$")) return markdown;
  for (let round = 0; round < 100; round++) {
    const openers: number[] = [];
    // Escaping inside a reference link would change its label so it no longer
    // matches the definition; convert() turns such prices back into text.
    let referenceEnd = -1;
    visit(mathParser.parse(markdown), ["linkReference", "imageReference", "inlineMath"], (node) => {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) return;
      if (node.type !== "inlineMath") referenceEnd = end;
      else if (node.type === "inlineMath" && start >= referenceEnd && isPriceSpan(markdown, start, end)) {
        openers.push(start);
      }
    });
    if (!openers.length) break;
    for (const offset of openers.reverse()) markdown = `${markdown.slice(0, offset)}\\${markdown.slice(offset)}`;
  }
  return markdown;
}

let mathjax: Promise<MathJaxInstance> | undefined;

function getMathJax(): Promise<MathJaxInstance> {
  mathjax ??= MathJax.init({
    loader: { load: ["input/tex", "output/svg"] },
    output: { fontCache: "none" },
  });
  return mathjax;
}

interface MathSvg {
  svg: string;
  /** viewBox in MathJax units (1/1000 em): [minX, minY, width, height]. */
  viewBox: number[];
}

async function texToSvg(tex: string, display: boolean): Promise<MathSvg> {
  const mj = await getMathJax();
  const html = mj.startup.adaptor.innerHTML(await mj.tex2svgPromise(tex, { display }));
  const error = /data-mjx-error="([^"]*)"/.exec(html);
  if (error) throw new Error(error[1]);
  const svg = html.slice(html.indexOf("<svg"), html.lastIndexOf("</svg>") + 6).replaceAll("&nbsp;", "&#160;");
  const viewBox = /viewBox="([^"]+)"/.exec(svg)![1]!.split(/\s+/).map(Number);
  return { svg, viewBox };
}

/**
 * Load the document's `latex-preamble` blocks. MathJax keeps `\newcommand`
 * and `\definecolor` definitions for later formulas; `\usepackage` lines are
 * dropped since MathJax bundles its packages.
 */
export async function loadPreamble(preamble: string): Promise<void> {
  const tex = preamble
    .split("\n")
    .map((line) => line.replace(/(?<!\\)%.*$/, ""))
    .filter((line) => !/^\s*\\(usepackage|RequirePackage)\b/.test(line))
    .join("\n")
    // MathJax's color package has no HTML model; translate it to RGB.
    .replace(/\\definecolor\{([^}]*)\}\{HTML\}\{([0-9a-fA-F]{6})\}/g, (_, name: string, hex: string) => {
      const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
      return `\\definecolor{${name}}{RGB}{${rgb}}`;
    })
    .trim();
  if (tex) await texToSvg(tex, true);
}

/** Bare `a \\ b` rows only lay out correctly inside an alignment environment. */
function normalizeRows(latex: string): string {
  if (latex.startsWith("\\begin{") || !/\\\\/.test(latex)) return latex;
  return `\\begin{aligned}\n${latex}\n\\end{aligned}`;
}

function nested(math: MathSvg, x: number, y: number, scale: number, color: string): string {
  const [minX, minY, w, h] = math.viewBox as [number, number, number, number];
  return math.svg
    .replace(
      /^<svg[^>]*>/,
      `<svg x="${x}" y="${y}" width="${w * scale}" height="${h * scale}" viewBox="${minX} ${minY} ${w} ${h}">`,
    )
    .replaceAll("currentColor", color);
}

/**
 * Render one display formula centered on a fixed-width canvas, with its
 * equation number (if labeled) at the right edge, like nb2wb's math images.
 */
export async function renderDisplayMath(latex: string, labels: Map<string, number>, style: MathStyle): Promise<Buffer> {
  let tag: number | undefined;
  const body = latex.replace(LABEL_RE, (_, label: string) => {
    tag ??= labels.get(label);
    return "";
  });
  const formula = await texToSvg(normalizeRows(body.trim()), true);
  const number = tag === undefined ? undefined : await texToSvg(`(${tag})`, false);

  const unit = style.emPx / 1000;
  const width = style.imageWidth;
  const edge = Math.max(4, Math.min(Math.max(Math.floor(style.padding / 3), 12), 32, Math.floor(width / 8)));
  const tagWidth = number ? number.viewBox[2]! * unit : 0;
  const available = width - 2 * edge - (number ? tagWidth + edge : 0);

  const scale = Math.min(unit, available / formula.viewBox[2]!);
  const formulaWidth = formula.viewBox[2]! * scale;
  const formulaHeight = formula.viewBox[3]! * scale;
  const height = Math.ceil(formulaHeight + 2 * style.padding);

  let content = nested(formula, edge + (available - formulaWidth) / 2, style.padding, scale, style.color);
  if (number) {
    const tagHeight = number.viewBox[3]! * unit;
    content += nested(number, width - edge - tagWidth, (height - tagHeight) / 2, unit, style.color);
  }
  return svgToPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="${width}" height="${height}" fill="${style.background}"/>${content}</svg>`,
  );
}
