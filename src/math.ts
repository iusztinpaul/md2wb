// Display math: source normalization, equation numbering, and MathJax
// rendering to PNG. MathJax runs in-process, so no TeX install is needed.

import MathJax, { type MathJaxInstance } from "mathjax";
import type { MathStyle } from "./targets.js";
import { svgToPng } from "./raster.js";

// Fenced and inline code must never be touched by the math rewrites below.
const CODE_RE = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$|(`+)[^\n]+?\2/gm;
const DISPLAY_RE =
  /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\begin\{(equation|align|gather|multline|eqnarray)(\*?)\}[\s\S]*?\\end\{\1\2\}/g;
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
 * resolve `\eqref{...}` references to `(N)`.
 */
export function prepareMath(source: string): PreparedMarkdown {
  const stash: string[] = [];
  let text = source.replace(CODE_RE, (code) => `\u0000${stash.push(code) - 1}\u0000`);

  text = text.replace(DISPLAY_RE, (match, _env, _star, offset: number, whole: string) => {
    if (match.startsWith("$$")) return match;
    const body = match.startsWith("\\[") ? match.slice(2, -2) : match;
    const lineStart = whole.lastIndexOf("\n", offset - 1) + 1;
    const indent = whole.slice(lineStart, offset);
    const lineEnd = whole.indexOf("\n", offset + match.length);
    const rest = whole.slice(offset + match.length, lineEnd === -1 ? undefined : lineEnd);
    // On its own line: a `$$` block. Inside a paragraph: inline `$$...$$`.
    if (/^[ \t]*$/.test(indent) && /^[ \t]*$/.test(rest)) {
      return `$$\n${indent}${body.trim()}\n${indent}$$`;
    }
    return `$$${body}$$`;
  });

  const labels = new Map<string, number>();
  for (const [, latex] of text.matchAll(/\$\$([\s\S]+?)\$\$/g)) {
    for (const [, label] of latex!.matchAll(LABEL_RE)) {
      if (!labels.has(label!)) labels.set(label!, labels.size + 1);
    }
  }
  text = text.replace(EQREF_RE, (ref, label: string) => {
    const n = labels.get(label);
    return n === undefined ? ref : `(${n})`;
  });

  return { markdown: text.replace(PLACEHOLDER_RE, (_, i: string) => stash[Number(i)]!), labels };
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
