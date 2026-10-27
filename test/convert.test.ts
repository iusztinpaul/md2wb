import { copyFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("keeps code blocks as copyable snippets on both targets", async () => {
    const source = "```python\nprint('hi') # <ok> & done\n```";
    for (const target of ["substack", "x"] as const) {
      const { body } = await run(source, target);
      expect(body).toContain('<pre><code class="language-python">print(\'hi\') # &#x3C;ok> &#x26; done\n</code></pre>');
      expect(images(body)).toEqual([]);
    }
  });

  it("cleans terminal output and tabs in snippets", async () => {
    const { body } = await run("```text\n\x1b[31mred\x1b[0m\x01\n\tindented\n```");
    expect(body).toContain('<pre><code class="language-text">red\n    indented\n</code></pre>');
  });

  it("drops hide-cell code, by comment or fence tag", async () => {
    const { body } = await run(
      "```python hide-cell\nsecret()\n```\n\n<!-- nb2wb: hide-cell -->\n```python\nalso_secret()\n```\n\n```bash\nnpm i\n```",
    );
    expect(body).not.toContain("secret");
    expect(body).toContain('<pre><code class="language-bash">npm i');
  });

  const snippet = '<pre><code class="language-python">print(1)\n</code></pre>';

  it("only applies a directive to the code block right after it", async () => {
    const { body } = await run("<!-- md2wb: hide-cell -->\n\nA paragraph.\n\n```python\nprint(1)\n```");
    expect(body).toContain("A paragraph.");
    expect(body).toContain(snippet);
    expect(body).not.toContain("md2wb:");
  });

  it("only applies directives that are the code block's previous siblings", async () => {
    const quoted = await run("> <!-- md2wb: hide-cell -->\n\n```python\nprint(1)\n```");
    expect(quoted.body).toContain(snippet);
    expect(quoted.body).not.toContain("md2wb:");
    const defined = await run("<!-- md2wb: hide-cell -->\n[a]: https://example.com\n\n```python\nprint(1)\n```");
    expect(defined.body).toContain(snippet);
    const stacked = await run("<!-- md2wb: hide-cell -->\n<!-- md2wb: text-snippet -->\n```python\nprint(1)\n```");
    expect(stacked.body).not.toContain("print(1)");
  });

  it("ignores directive comments inside a paragraph", async () => {
    const { body } = await run("text <!-- md2wb: hide-cell -->\n\n```python\nprint(1)\n```");
    expect(body).toContain(snippet);
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

  it("parses price text as Markdown, without blockquote markers", async () => {
    const quoted = await run("> costs $5 and\n> $10 total");
    expect(quoted.body).toContain("costs $5 and<br>\n$10 total");
    expect(quoted.body).not.toMatch(/&#x3E;|&gt;/);
    const styled = await run("Pay $5 for **bold** and $10.");
    expect(styled.body).toContain("Pay $5 for <strong>bold</strong> and $10.");
    const spaced = await run("costs $ 5 and $ 10 later");
    expect(spaced.body).toContain("costs $ 5 and $ 10 later");
  });

  it("keeps footnotes and math next to prices", async () => {
    const { body } = await run("It costs $5 per month[^1], or $50 per year, while $x$ varies.\n\n[^1]: Billed monthly.");
    expect(body).toContain("It costs $5 per month");
    expect(body).toContain("Billed monthly.");
    expect(body).toContain("while <em>x</em> varies");
  });

  it("keeps reference links whose label contains prices", async () => {
    const { body } = await run("See [$5 and $10 plans] here.\n\n[$5 and $10 plans]: https://example.com");
    expect(body).toContain('<a href="https://example.com">$5 and $10 plans</a>');
  });

  it("drops an empty inline $$ $$", async () => {
    const { body } = await run("text $$ $$ more");
    expect(body).not.toContain("<code");
  });

  it("converts \\[...\\] that starts a list item", async () => {
    const { body } = await run("- \\[ x = 1 \\]\n- next");
    expect(images(body)).toMatchObject([{ alt: "math" }]);
    expect(body).toContain("<li>next</li>");
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
    const query = await run("![gone](missing.png?v=2)");
    expect(query.warnings).toEqual([expect.stringContaining("ENOENT")]);
  });

  it("fetches protocol-relative image URLs over https", async () => {
    const png = await readFile(`${fixtures}/tiny.png`);
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(url);
      return new Response(png, { headers: { "content-type": "image/png" } });
    });
    const { body } = await run("![cdn](//cdn.example.com/a.png)");
    expect(fetched).toEqual(["https://cdn.example.com/a.png"]);
    expect(images(body)).toMatchObject([{ alt: "cdn" }]);
  });

  it("embeds remote images served as octet-stream when the extension says image", async () => {
    const png = await readFile(`${fixtures}/tiny.png`);
    vi.stubGlobal("fetch", async () => new Response(png, { headers: { "content-type": "application/octet-stream" } }));
    const { body, warnings } = await run("![remote](https://cdn.example.com/fig.png)");
    expect(warnings).toEqual([]);
    expect(images(body)).toMatchObject([{ alt: "remote", width: 2, height: 3 }]);
  });

  it("loads local images with a query, a fragment or a file: URL", async () => {
    const file = path.join(fixtures, "tiny.png");
    const { body, warnings } = await run(`![q](tiny.png?raw=true)\n\n![f](tiny.png#center)\n\n![u](${pathToFileURL(file).href})`);
    expect(warnings).toEqual([]);
    expect(images(body).map((i) => i.alt)).toEqual(["q", "f", "u"]);
  });

  it("loads local images whose names contain %, # or a relative file: prefix", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "md2wb-"));
    await copyFile(`${fixtures}/tiny.png`, path.join(dir, "50%off.png"));
    await copyFile(`${fixtures}/tiny.png`, path.join(dir, "C#-vs-java.png"));
    const warnings: string[] = [];
    const html = await convert("![sale](50%off.png)\n\n![lang](C#-vs-java.png)\n\n![rel](file:50%off.png)", {
      baseDir: dir,
      onWarning: (w) => warnings.push(w),
    });
    expect(warnings).toEqual([]);
    expect(images(content(html)).map((i) => i.alt)).toEqual(["sale", "lang", "rel"]);
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

  it("strips empty front matter but keeps two separated rules", async () => {
    expect((await run("---\n---\n\nHello")).body).not.toContain("<hr>");
    expect((await run("---\n\n---\n\nHello")).body.match(/<hr>/g)).toHaveLength(2);
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
