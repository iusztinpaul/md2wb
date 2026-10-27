import { describe, expect, it } from "vitest";
import { prepareMath } from "../src/math.js";

describe("prepareMath", () => {
  it("turns \\[...\\] on its own lines into a $$ block", () => {
    expect(prepareMath("a\n\n\\[\nx^2\n\\]\n\nb").markdown).toBe("a\n\n$$\nx^2\n$$\n\nb");
  });

  it("puts the $$ fences on their own lines", () => {
    expect(prepareMath("\\[ a + b\n= c \\]\n\nAfter.").markdown).toBe("$$\n a + b\n= c \n$$\n\nAfter.");
    expect(prepareMath("\\[ x = 1 \\]").markdown).toBe("$$\n x = 1 \n$$");
  });

  it("converts \\[...\\] inside a blockquote", () => {
    expect(prepareMath("> \\[\n> x = 1\n> \\]\n").markdown).toBe("> $$\n> x = 1\n> $$\n");
  });

  it("leaves \\[...\\] inside a paragraph alone (Markdown escaped brackets)", () => {
    expect(prepareMath("see \\[1\\] here").markdown).toBe("see \\[1\\] here");
  });

  it("turns inline equation environments into inline $$...$$", () => {
    expect(prepareMath("see \\begin{equation}x\\end{equation} here").markdown).toBe(
      "see $$\\begin{equation}x\\end{equation}$$ here",
    );
  });

  it("wraps bare equation environments, keeping list indentation", () => {
    const src = "- item\n  \\begin{align}\n  a &= b\n  \\end{align}\n";
    expect(prepareMath(src).markdown).toBe("- item\n  $$\n  \\begin{align}\n  a &= b\n  \\end{align}\n  $$\n");
  });

  it("leaves environments already inside $$ alone", () => {
    const src = "$$\\begin{equation}x\\end{equation}$$";
    expect(prepareMath(src).markdown).toBe(src);
  });

  it("never rewrites code", () => {
    const src = "```latex\n\\[x\\] \\eqref{a}\n```\n\nand `\\[y\\]`";
    expect(prepareMath(src).markdown).toBe(src);
  });

  it("never rewrites indented code", () => {
    const src = "Code:\n\n    \\[\n    code\n    \\]\n";
    expect(prepareMath(src).markdown).toBe(src);
  });

  it("does not let a stray \\[ swallow later paragraphs", () => {
    const src = "Escape \\[ here.\n\n\\begin{equation}a \\label{e}\\end{equation}\n\nand \\] there. See \\eqref{e}";
    const { markdown, labels } = prepareMath(src);
    expect([...labels]).toEqual([["e", 1]]);
    expect(markdown).toContain("See (1)");
  });

  it("numbers labels in document order and resolves references", () => {
    const src = "$$a \\label{first}$$\n\n$$b \\label{second}$$\n\nSee \\eqref{second}, \\eqref{first} and \\eqref{missing}.";
    const { markdown, labels } = prepareMath(src);
    expect([...labels]).toEqual([["first", 1], ["second", 2]]);
    expect(markdown).toContain("See (2), (1) and \\eqref{missing}.");
  });

  it("gives all labels in one block that block's number", () => {
    const src = "$$\\begin{aligned}a \\label{a} \\\\ b \\label{b}\\end{aligned}$$\n\n$$c \\label{c}$$";
    expect([...prepareMath(src).labels]).toEqual([["a", 1], ["b", 1], ["c", 2]]);
  });

  it("escapes dollars that are prices, not math", () => {
    expect(prepareMath("costs $5, while $x$ is").markdown).toBe("costs \\$5, while $x$ is");
    expect(prepareMath("$5 and $10 and $20").markdown).toBe("\\$5 and \\$10 and $20");
    expect(prepareMath("| a | b |\n|---|---|\n| $5 | $x$ |").markdown).toBe("| a | b |\n|---|---|\n| $5 | $x$ |");
  });

  it("does not resolve escaped references", () => {
    const src = "$$a \\label{x}$$ \\\\eqref{x}";
    expect(prepareMath(src).markdown).toContain("\\\\eqref{x}");
  });
});
