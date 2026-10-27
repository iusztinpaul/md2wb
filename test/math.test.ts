import { describe, expect, it } from "vitest";
import { prepareMath } from "../src/math.js";

describe("prepareMath", () => {
  it("turns \\[...\\] on its own lines into a $$ block", () => {
    expect(prepareMath("a\n\n\\[\nx^2\n\\]\n\nb").markdown).toBe("a\n\n$$\nx^2\n$$\n\nb");
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

  it("does not resolve escaped references", () => {
    const src = "$$a \\label{x}$$ \\\\eqref{x}";
    expect(prepareMath(src).markdown).toContain("\\\\eqref{x}");
  });
});
