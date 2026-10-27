import { describe, expect, it } from "vitest";
import { prepareMath } from "../src/math.js";

describe("prepareMath", () => {
  it("turns \\[...\\] on its own lines into a $$ block", () => {
    expect(prepareMath("a\n\n\\[\nx^2\n\\]\n\nb").markdown).toBe("a\n\n$$\nx^2\n$$\n\nb");
  });

  it("turns inline \\[...\\] into inline $$...$$", () => {
    expect(prepareMath("see \\[x\\] here").markdown).toBe("see $$x$$ here");
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

  it("numbers labels in document order and resolves references", () => {
    const src = "$$a \\label{first}$$\n\n$$b \\label{second}$$\n\nSee \\eqref{second}, \\eqref{first} and \\eqref{missing}.";
    const { markdown, labels } = prepareMath(src);
    expect([...labels]).toEqual([["first", 1], ["second", 2]]);
    expect(markdown).toContain("See (2), (1) and \\eqref{missing}.");
  });

  it("does not resolve escaped references", () => {
    const src = "$$a \\label{x}$$ \\\\eqref{x}";
    expect(prepareMath(src).markdown).toContain("\\\\eqref{x}");
  });
});
