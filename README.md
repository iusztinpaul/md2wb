# md2wb

Write in Markdown. Publish to Substack and X Articles.

`md2wb` turns a Markdown article into a preview page you can paste straight into the Substack or X Articles editor. Neither editor understands TeX, code highlighting or tables, so md2wb converts them before you paste:

- **Display math** (`$$…$$`, `\[…\]`, `\begin{align}…`) becomes crisp images, rendered by MathJax. No TeX install is needed. `\label`/`\eqref` numbering and `\color` both work.
- **Inline math** (`$…$`) becomes readable Unicode text (`$E = mc^2$` → *E* = *mc*²), so it stays selectable.
- **Code blocks** become syntax-highlighted images (Shiki, monokai) with line numbers.
- **Tables** become images, since neither editor accepts pasted tables.
- **Images** are embedded as data URIs. For X, each image also gets a "Copy image" button, for when the editor drops pasted images.

It is a distilled TypeScript port of [nb2wb](https://github.com/the-palindrome/nb2wb), keeping only Markdown input and the Substack and X Articles targets.

## Usage

Requires Node.js 22.12 or newer.

```bash
npm install
npm run build
node dist/cli.js examples/article.md            # Substack (default)
node dist/cli.js examples/article.md -t x --open  # X Articles, open in the browser
```

This writes `examples/article.html`. Open it in a browser, click **Copy to clipboard**, and paste into a new draft.

```
Usage: md2wb <article.md> [options]

Options:
  -t, --target <name>   substack (default) or x
  -o, --output <file>   output HTML file (default: <article>.html)
      --open            open the result in your browser
  -v, --version         print the version
  -h, --help            show this help
```

From code:

```ts
import { convert } from "md2wb";

const html = await convert(markdown, { target: "x", baseDir: "path/to/article" });
```

Relative image paths resolve against `baseDir` (the article's folder when using the CLI).

## Markdown features

Everything in GitHub-flavored Markdown works: headings, emphasis, lists, links, blockquotes, strikethrough, tables, images. Single line breaks are kept as line breaks.

A few rules decide what counts as math:

- `$…$` is inline math only when there is no space just inside the dollars and no digit right after the closing one, so "it costs $5 and $10" stays text.
- `\[…\]` is display math only on its own lines. Inside a paragraph it is Markdown's escaped brackets.
- `$$…$$` and `\begin{equation|align|gather|multline|eqnarray}` are always display math.

Code blocks without a language use the front-matter `language` (for example `language: python`), or plain text if there is none.

### Math preamble

A `latex-preamble` code block is not rendered. Its `\newcommand` and `\definecolor` definitions apply to every formula in the article. `\usepackage` lines are ignored because MathJax already bundles the common packages.

````markdown
```latex-preamble
\definecolor{brand}{HTML}{E8C547}
\newcommand{\R}{\mathbb{R}}
```
````

### Directives

Put a directive comment right before a code block, or add it after the language on the fence line. A directive followed by anything other than a code block is ignored.

| Directive | Effect |
| --- | --- |
| `<!-- md2wb: text-snippet -->` | Keep the block as copyable text instead of an image. |
| `<!-- md2wb: hide-cell -->` | Drop the block from the output. |

````markdown
<!-- md2wb: text-snippet -->
```bash
npm install md2wb
```

```python hide-cell
print("draft only")
```
````

The `nb2wb:` prefix also works, so articles written for nb2wb convert unchanged.

## Development

```bash
npm install       # also builds dist/
npm run typecheck
npm test
```

| File | Role |
| --- | --- |
| `src/convert.ts` | Pipeline: parse Markdown, swap blocks for images, build the page |
| `src/math.ts` | Display-math normalization, equation numbering, MathJax → PNG |
| `src/inline-math.ts` | Inline math → Unicode text |
| `src/code.ts` | Code block → highlighted PNG |
| `src/table.ts` | Table → PNG |
| `src/images.ts` | Embed images, add X copy buttons |
| `src/page.ts`, `src/targets.ts` | Preview page and per-target settings |

## License

Apache-2.0. Portions are derived from nb2wb (MIT); see [NOTICE](NOTICE).
