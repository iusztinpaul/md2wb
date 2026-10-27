// Inline every <img> as a data URI so the copied HTML carries the pixels,
// and (for X) wrap images with a "Copy image" button for manual pasting.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Element, ElementContent, Parents, Root } from "hast";
import { visitParents } from "unist-util-visit-parents";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export interface ImageOptions {
  baseDir: string;
  copyable: boolean;
  warn: (message: string) => void;
}

export async function processImages(tree: Root, options: ImageOptions): Promise<void> {
  const images: Array<{ node: Element; ancestors: Parents[] }> = [];
  visitParents(tree, "element", (node, ancestors) => {
    if (node.tagName === "img") images.push({ node, ancestors: [...ancestors] });
  });

  // Load all images concurrently, then rewrite the tree in document order.
  const sources = images.map(({ node }) => String(node.properties.src ?? ""));
  const loaded = await Promise.allSettled(
    sources.map((src) => (src.startsWith("data:") ? src : toDataUri(src, options.baseDir))),
  );
  images.forEach(({ node, ancestors }, i) => {
    const result = loaded[i]!;
    if (result.status === "rejected") {
      options.warn(`dropping image "${sources[i]}": ${(result.reason as Error).message}`);
      replaceChild(ancestors.at(-1)!, node, []);
      return;
    }
    node.properties.src = result.value;
    if (options.copyable) wrapCopyable(node, ancestors);
  });
}

async function toDataUri(src: string, baseDir: string): Promise<string> {
  if (src.startsWith("//")) src = `https:${src}`; // protocol-relative URL
  if (/^https?:\/\//i.test(src)) {
    const response = await fetch(src, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
    // Some CDNs serve images as application/octet-stream; trust the extension then.
    const mime = type.startsWith("image/") ? type : MIME_BY_EXT[path.extname(new URL(src).pathname).toLowerCase()];
    if (!mime) throw new Error(`not an image (${type || "no content type"})`);
    if (Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES) tooLarge();
    return encode(Buffer.from(await response.arrayBuffer()), mime);
  }
  if (!src) throw new Error("empty src");
  let name = src;
  try {
    name = decodeURIComponent(src);
  } catch {
    // A literal % in the file name.
  }
  const file = path.resolve(baseDir, name);
  const mime = MIME_BY_EXT[path.extname(file).toLowerCase()];
  if (!mime) throw new Error("unsupported image type");
  return encode(await readFile(file), mime);
}

function encode(data: Buffer, mime: string): string {
  if (data.length > MAX_IMAGE_BYTES) tooLarge();
  return `data:${mime};base64,${data.toString("base64")}`;
}

function tooLarge(): never {
  throw new Error(`larger than ${MAX_IMAGE_BYTES} bytes`);
}

function wrapCopyable(img: Element, ancestors: Parents[]): void {
  // A button cannot sit inside a link, so linked images are only embedded.
  if (ancestors.some((a) => a.type === "element" && a.tagName === "a")) return;
  const parent = ancestors.at(-1)!;
  const grandparent = ancestors.at(-2);
  const alone =
    parent.type === "element" &&
    parent.tagName === "p" &&
    parent.children.every((c) => c === img || (c.type === "text" && !c.value.trim()));
  // A lone image replaces its paragraph with a block <div>; an image inside
  // text gets an inline <span>, since a <div> cannot sit inside a <p>.
  const container: Element = {
    type: "element",
    tagName: alone ? "div" : "span",
    properties: { className: ["image-container"] },
    children: [
      img,
      {
        type: "element",
        tagName: "button",
        properties: { className: ["copy-image-btn"], type: "button" },
        children: [{ type: "text", value: "Copy image" }],
      },
    ],
  };
  if (alone && grandparent) replaceChild(grandparent, parent, [container]);
  else replaceChild(parent, img, [container]);
}

function replaceChild(parent: Parents, child: Element, replacement: ElementContent[]): void {
  const children = parent.children as ElementContent[];
  children.splice(children.indexOf(child), 1, ...replacement);
}
