import { copyFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderCode } from "../src/code.js";
import { TARGETS } from "../src/targets.js";
import { convert } from "../src/index.js";
import { content, images } from "./helpers.js";

const fixtures = fileURLToPath(new URL("./fixtures", import.meta.url));

async function run(markdown: string, target: "substack" | "x" = "substack") {
  const warnings: string[] = [];
  const html = await convert(markdown, { target, baseDir: fixtures, onWarning: (w) => warnings.push(w) });
  return { html, body: content(html), warnings };
}

describe("convert", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders prose as plain HTML", async () => {
    const { body, warnings } = await run("# Title\n\nSome **bold** and ~~gone~~ text.\nNext line.\n\n- one\n- two");
    expect(body).toContain("<h1>Title</h1>");
    expect(body).toContain("<strong>bold</strong>");
    expect(body).toContain("<del>gone</del>");
    expect(body).toContain("text.<br>\nNext line.");
    expect(body).toContain("<li>one</li>");
    expect(warnings).toEqual([]);
  });

  it("renders code blocks as images sized for the target", async () => {
    const source = "```python\nprint('hi')\n```";
    const substack = images((await run(source)).html);
    const x = images((await run(source, "x")).html);
    expect(substack).toMatchObject([{ alt: "code", width: 1920 + 2 * 100 }]);
    expect(x).toMatchObject([{ alt: "code", width: 1200 + 2 * 30 }]);
  });

  it("highlights capitalized fence languages", async () => {
    const upper = await renderCode("x = 1", "Python", TARGETS.x.code);
    const lower = await renderCode("x = 1", "python", TARGETS.x.code);
    expect(upper.equals(lower)).toBe(true);
  });

  it("keeps text-snippet code as text and drops hide-cell code", async () => {
    const { body } = await run(
      "<!-- md2wb: text-snippet -->\n```bash\nnpm i\n```\n\n```python hide-cell\nsecret()\n```\n\n<!-- nb2wb: hide-cell -->\n```python\nalso_secret()\n```",
    );
    expect(body).toContain('<pre><code class="language-bash">npm i');
    expect(body).not.toContain("secret");
    expect(images(body)).toEqual([]);
  });

  it("only applies a directive to the code block right after it", async () => {
    const { body } = await run("<!-- md2wb: hide-cell -->\n\nA paragraph.\n\n```python\nprint(1)\n```");
    expect(body).toContain("A paragraph.");
    expect(images(body)).toMatchObject([{ alt: "code" }]);
  });

  it("ignores directive comments inside a paragraph", async () => {
    const { body } = await run("text <!-- md2wb: hide-cell -->\n\n```python\nprint(1)\n```");
    expect(images(body)).toMatchObject([{ alt: "code" }]);
  });

  it("renders display math as numbered images and inline math as text", async () => {
    const { body, warnings } = await run(
      "Inline $E = mc^2$.\n\n$$a^2 + b^2 = c^2 \\label{eq:p}$$\n\nBy \\eqref{eq:p}, and\n\n\\[\nx\n\\]",
    );
    expect(body).toContain("<em>E</em> = <em>m</em><em>c</em>²");
    expect(body).toContain("By (1), and");
    const math = images(body);
    expect(math.map((i) => i.alt)).toEqual(["math", "math"]);
    expect(math.every((i) => i.width === 1920)).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("keeps multi-line \\[...\\] blocks from swallowing what follows", async () => {
    const { body } = await run("\\[ a + b\n= c \\]\n\nAfter paragraph.");
    expect(images(body)).toMatchObject([{ alt: "math" }]);
    expect(body).toContain("<p>After paragraph.</p>");
  });

  it("drops blockquote markers from prices spanning lines", async () => {
    const { body } = await run("> costs $5 and\n> $10 total");
    expect(body).toContain("$10 total");
    expect(body).not.toMatch(/&#x3E;|&gt;/);
  });

  it("leaves prices and escaped brackets as text", async () => {
    const { body } = await run("It costs $5 and $10 today. Escaped \\[1\\] brackets, and $x$.");
    expect(body).toContain("It costs $5 and $10 today. Escaped [1] brackets, and <em>x</em>.");
    expect(images(body)).toEqual([]);
  });

  it("splits paragraphs around inline display math", async () => {
    const { body } = await run("Before $$x$$ after.");
    expect(body).toMatch(/<p>Before<\/p>\n<p><img src="data:image\/png[^"]+" alt="math"><\/p>\n<p>after.<\/p>/);
  });

  it("applies latex-preamble definitions and hides the block", async () => {
    const { body, warnings } = await run(
      "```latex-preamble\n\\usepackage{xcolor}\n\\definecolor{brand}{HTML}{E8C547}\n\\newcommand{\\R}{\\mathbb{R}}\n```\n\n$$\\color{brand} x \\in \\R$$",
    );
    expect(warnings).toEqual([]);
    expect(body).not.toContain("usepackage");
    expect(images(body)).toHaveLength(1);
  });

  it("keeps broken math as source and warns", async () => {
    const { body, warnings } = await run("$$\\frac{a$$");
    expect(images(body)).toEqual([]);
    expect(body).toContain("$$");
    expect(warnings).toHaveLength(1);
  });

  it("renders tables as images", async () => {
    const { body } = await run("| a | b |\n|:--|--:|\n| $x_1$ | `y` |", "x");
    expect(images(body)).toMatchObject([{ alt: "table", width: 1200 }]);
    expect(body).not.toContain("<table");
  });

  it("embeds local images and drops missing ones with a warning", async () => {
    const { body, warnings } = await run("![dot](tiny.png)\n\n![gone](missing.png)");
    expect(images(body)).toMatchObject([{ alt: "dot", width: 2, height: 3 }]);
    expect(body).not.toContain("missing.png");
    expect(warnings).toEqual([expect.stringContaining("missing.png")]);
  });

  it("embeds remote images served as octet-stream when the extension says image", async () => {
    const png = await readFile(`${fixtures}/tiny.png`);
    vi.stubGlobal("fetch", async () => new Response(png, { headers: { "content-type": "application/octet-stream" } }));
    const { body, warnings } = await run("![remote](https://cdn.example.com/fig.png)");
    expect(warnings).toEqual([]);
    expect(images(body)).toMatchObject([{ alt: "remote", width: 2, height: 3 }]);
  });

  it("loads local images whose names contain %", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "md2wb-"));
    await copyFile(`${fixtures}/tiny.png`, path.join(dir, "50%off.png"));
    const warnings: string[] = [];
    const html = await convert("![sale](50%off.png)", { baseDir: dir, onWarning: (w) => warnings.push(w) });
    expect(warnings).toEqual([]);
    expect(images(content(html))).toMatchObject([{ alt: "sale" }]);
  });

  it("wraps inline X images in a span and leaves linked ones unwrapped", async () => {
    const inline = await run("See ![a](tiny.png) here.", "x");
    expect(inline.body).toMatch(/<p>See <span class="image-container"><img [^>]+><button/);
    const linked = await run("[![a](tiny.png)](https://example.com)", "x");
    expect(linked.body).not.toContain("copy-image-btn");
  });

  it("adds per-image copy buttons only for X", async () => {
    const substack = await run("![dot](tiny.png)");
    const x = await run("![dot](tiny.png)", "x");
    expect(substack.body).not.toContain("copy-image-btn");
    expect(x.body).toMatch(/<div class="image-container"><img [^>]+><button class="copy-image-btn"/);
    expect(x.body).not.toContain("<p><div");
  });

  it("wraps output in the target's preview page", async () => {
    const { html } = await run("hello", "x");
    expect(html).toContain("<title>md2wb — X Articles Preview</title>");
    expect(html).toContain('id="copy-btn"');
  });

  it("accepts CRLF line endings and a byte-order mark", async () => {
    const { body } = await run("\uFEFF---\r\ntitle: Hi\r\n---\r\n\r\n\\[\r\nx = 1\r\n\\]\r\n");
    expect(body).not.toContain("title: Hi");
    expect(images(body)).toMatchObject([{ alt: "math" }]);
  });

  it("does not mistake a leading thematic break for front matter", async () => {
    const { body } = await run("---\n\nIntro paragraph: here\n\n---\n\nRest");
    expect(body).toContain("Intro paragraph: here");
    expect(body).toContain("Rest");
  });

  it("strips empty front matter", async () => {
    const { body } = await run("---\n---\n\nHello");
    expect(body).not.toContain("<hr>");
  });

  it("strips front matter and HTML comments", async () => {
    const { body } = await run("---\ntitle: T\nlanguage: rust\n---\n\n<!-- draft note -->\n\nText");
    expect(body).not.toContain("title: T");
    expect(body).not.toContain("draft note");
  });

  it("rejects unknown targets", async () => {
    await expect(convert("x", { target: "medium" as "x" })).rejects.toThrow(/Unknown target/);
  });
});
