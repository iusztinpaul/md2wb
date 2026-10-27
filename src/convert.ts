// Markdown -> paste-ready HTML page. The document is parsed into an mdast
// tree; code blocks, display math and tables are swapped for PNG images,
// inline math becomes Unicode text, and the result is wrapped in the target's
// preview page.

import type { Root as HastRoot } from "hast";
import type { Image, Nodes, Paragraph, Parents, PhrasingContent, Root, Table } from "mdast";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";
import { renderCode } from "./code.js";
import { processImages } from "./images.js";
import { inlineMathToHtml, inlineMathToText } from "./inline-math.js";
import { loadPreamble, prepareMath, renderDisplayMath } from "./math.js";
import { buildPage } from "./page.js";
import { pngDataUri } from "./raster.js";
import { renderTable, type TableCell } from "./table.js";
import { getTarget, type Target, type TargetName } from "./targets.js";

export interface ConvertOptions {
  /** Publishing target (default: "substack"). */
  target?: TargetName;
  /** Directory that relative image paths resolve against (default: cwd). */
  baseDir?: string;
  /** Receives non-fatal problems; defaults to printing on stderr. */
  onWarning?: (message: string) => void;
}

const FRONT_MATTER_RE = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
// `<!-- md2wb: hide-cell, text-snippet -->` applies to the code block right
// after it. The nb2wb prefix is accepted so existing articles keep working.
const DIRECTIVE_RE = /<!--\s*(?:md2wb|nb2wb)\s*:\s*(.+?)\s*-->/g;
// Any of these between a directive and a code block cancels the directive.
const BLOCKS = new Set(["paragraph", "heading", "list", "blockquote", "table", "math", "thematicBreak", "html"]);
// Directives are block-level comments, never comments inside a paragraph.
const FLOW_PARENTS = new Set(["root", "blockquote", "listItem", "footnoteDefinition"]);

/**
 * Convert a Markdown article into the target's preview page. MathJax is set
 * up once per process, so `\newcommand` and `\definecolor` definitions from
 * one article's latex-preamble stay defined for later calls.
 */
export async function convert(markdown: string, options: ConvertOptions = {}): Promise<string> {
  const target = getTarget(options.target ?? "substack");
  const warn = options.onWarning ?? ((message: string) => console.warn(`md2wb: ${message}`));
  const { language, body } = splitFrontMatter(markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"));
  const { markdown: source, labels } = prepareMath(body);

  const remark = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkBreaks);
  const tree = (await remark.run(remark.parse(source))) as Root;
  await renderBlocks(tree, { source, labels, target, warn, language });

  const hast = (await unified().use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw).run(tree)) as HastRoot;
  visit(hast, "comment", (_, index, parent) => {
    parent!.children.splice(index!, 1);
    return index;
  });
  await processImages(hast, { baseDir: options.baseDir ?? process.cwd(), copyable: target.copyableImages, warn });
  return buildPage(unified().use(rehypeStringify).stringify(hast), target);
}

function splitFrontMatter(markdown: string): { language?: string; body: string } {
  const match = FRONT_MATTER_RE.exec(markdown);
  const yaml = match?.[1] ?? "";
  // A leading `---` may just be a thematic break: only strip a block that
  // starts right after it and parses as a YAML mapping.
  if (!match || !/^\S/.test(yaml)) return { body: markdown };
  let data: unknown;
  try {
    data = parseYaml(yaml);
  } catch {
    return { body: markdown };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { body: markdown };
  const language = (data as { language?: unknown }).language;
  return { language: typeof language === "string" ? language : undefined, body: markdown.slice(match[0].length) };
}

interface Context {
  source: string;
  labels: Map<string, number>;
  target: Target;
  warn: (message: string) => void;
  /** Front-matter `language`, used for code blocks without one. */
  language?: string;
}

async function renderBlocks(tree: Root, ctx: Context): Promise<void> {
  const removed = new Set<Nodes>();
  const displayImages = new Set<Nodes>();
  const preamble: string[] = [];
  const jobs: Array<() => Promise<void>> = [];
  let pending: string[] = [];

  const addJob = (what: string, render: () => Promise<Buffer>, done: (png: Buffer) => void, failed?: () => void) =>
    jobs.push(async () => {
      try {
        done(await render());
      } catch (error) {
        ctx.warn(`could not render ${what}, keeping it as text: ${(error as Error).message}`);
        failed?.();
      }
    });

  visit(tree, (node, _, parent) => {
    if (node.type === "html" && FLOW_PARENTS.has(parent?.type ?? "root")) {
      const tags = directiveTags(node.value);
      if (tags) {
        pending.push(...tags);
        removed.add(node);
        return;
      }
    }
    if (BLOCKS.has(node.type)) pending = [];
    switch (node.type) {
      case "code": {
        const tags = [...pending, ...(node.meta?.split(/\s+/) ?? [])];
        pending = [];
        if (node.lang === "latex-preamble") {
          preamble.push(node.value);
          removed.add(node);
        } else if (tags.includes("hide-cell")) {
          removed.add(node);
        } else if (!tags.includes("text-snippet")) {
          const lang = node.lang ?? ctx.language ?? "";
          addJob(
            "code block",
            () => renderCode(node.value, lang, ctx.target.code),
            (png) => replaceNode(node, paragraph(image(png, "code", "code-img"))),
          );
        }
        return;
      }
      case "math": {
        const latex = node.value;
        if (!latex.trim()) removed.add(node);
        else {
          addJob(
            "display math",
            () => renderDisplayMath(latex, ctx.labels, ctx.target.math),
            (png) => replaceNode(node, paragraph(image(png, "math"))),
            () => replaceNode(node, paragraph({ type: "text", value: `$$\n${latex}\n$$` })),
          );
        }
        return;
      }
      case "inlineMath": {
        const latex = node.value;
        const { kind, raw } = inlineMathKind(node, ctx.source);
        if (kind === "text") {
          replaceNode(node, { type: "text", value: raw });
        } else if (kind === "inline") {
          replaceNode(node, { type: "html", value: inlineMathToHtml(latex) });
        } else if (latex.trim()) {
          // `$$...$$` inside a paragraph is still display math.
          addJob(
            "display math",
            () => renderDisplayMath(latex, ctx.labels, ctx.target.math),
            (png) => {
              replaceNode(node, image(png, "math"));
              displayImages.add(node);
            },
            () => replaceNode(node, { type: "text", value: `$$${latex}$$` }),
          );
        }
        return;
      }
      case "table": {
        addJob(
          "table",
          async () => renderTable(tableCells(node, ctx.source), ctx.target.table),
          (png) => replaceNode(node, paragraph(image(png, "table"))),
        );
        return SKIP;
      }
    }
  });

  if (preamble.length) {
    try {
      await loadPreamble(preamble.join("\n"));
    } catch (error) {
      ctx.warn(`could not load latex-preamble: ${(error as Error).message}`);
    }
  }
  for (const job of jobs) await job();
  prune(tree, removed, displayImages);
}

type InlineMath = Extract<Nodes, { type: "inlineMath" }>;

/**
 * Judge a remark-math `inlineMath` node from its source: `$$...$$` is display
 * math, and Pandoc's rule tells `$x$` from prices (no space just inside the
 * dollars, no digit right after the closing one), so "$5 and $10" is text.
 */
function inlineMathKind(node: InlineMath, source: string): { kind: "display" | "inline" | "text"; raw: string } {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return { kind: "inline", raw: `$${node.value}$` };
  const raw = source.slice(start, end);
  if (raw.startsWith("$$")) return { kind: "display", raw };
  const inner = raw.slice(1, -1);
  const tex = /^\S/.test(inner) && /\S$/.test(inner) && !/\d/.test(source[end] ?? "");
  return { kind: tex ? "inline" : "text", raw };
}

function directiveTags(html: string): string[] | undefined {
  const tags: string[] = [];
  const rest = html.replace(DIRECTIVE_RE, (_, list: string) => {
    tags.push(...list.split(",").map((tag) => tag.trim()).filter(Boolean));
    return "";
  });
  return tags.length && !rest.trim() ? tags : undefined;
}

function image(png: Buffer, alt: string, className?: string): Image {
  return {
    type: "image",
    url: pngDataUri(png),
    alt,
    ...(className ? { data: { hProperties: { className: [className] } } } : {}),
  };
}

function paragraph(child: PhrasingContent): Paragraph {
  return { type: "paragraph", children: [child] };
}

/** Swap a node's contents in place so parents keep pointing at it. */
function replaceNode(node: Nodes, replacement: Nodes): void {
  for (const key of Object.keys(node)) delete (node as unknown as Record<string, unknown>)[key];
  Object.assign(node, replacement);
}

function tableCells(table: Table, source: string): TableCell[][] {
  return table.children.map((row, r) =>
    row.children.map((cell, c) => ({
      text: cellText(cell, source).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim(),
      align: table.align?.[c] ?? "left",
      header: r === 0,
    })),
  );
}

function cellText(node: Nodes, source: string): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
      return node.value;
    case "inlineMath": {
      const { kind, raw } = inlineMathKind(node, source);
      return kind === "text" ? raw : inlineMathToText(node.value);
    }
    case "break":
      return "\n";
    case "html":
      return node.value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
    default:
      return "children" in node ? node.children.map((child) => cellText(child, source)).join("") : "";
  }
}

/** Drop removed nodes and split paragraphs around inline display-math images. */
function prune(parent: Parents, removed: Set<Nodes>, displayImages: Set<Nodes>): void {
  const children: Nodes[] = [];
  for (const child of parent.children) {
    if (removed.has(child)) continue;
    if (child.type === "paragraph" && child.children.some((c) => displayImages.has(c))) {
      children.push(...splitParagraph(child, displayImages));
      continue;
    }
    if ("children" in child) prune(child, removed, displayImages);
    children.push(child);
  }
  (parent as { children: Nodes[] }).children = children;
}

function splitParagraph(node: Paragraph, displayImages: Set<Nodes>): Paragraph[] {
  const out: Paragraph[] = [];
  let run: PhrasingContent[] = [];
  const flush = () => {
    const children = trimPhrasing(run);
    if (children.length) out.push({ type: "paragraph", children });
    run = [];
  };
  for (const child of node.children) {
    if (displayImages.has(child)) {
      flush();
      out.push(paragraph(child));
    } else {
      run.push(child);
    }
  }
  flush();
  return out;
}

function trimPhrasing(nodes: PhrasingContent[]): PhrasingContent[] {
  const blank = (n: PhrasingContent | undefined) => n?.type === "break" || (n?.type === "text" && !n.value.trim());
  const out = [...nodes];
  while (blank(out[0])) out.shift();
  while (blank(out.at(-1))) out.pop();
  const first = out[0];
  const last = out.at(-1);
  if (first?.type === "text") first.value = first.value.trimStart();
  if (last?.type === "text") last.value = last.value.trimEnd();
  return out;
}
