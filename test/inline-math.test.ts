import { describe, expect, it } from "vitest";
import { expandFrac, inlineMathToHtml, inlineMathToText, italicize } from "../src/inline-math.js";

describe("inlineMathToHtml", () => {
  it("converts Greek letters and italicizes them", () => {
    expect(inlineMathToHtml(String.raw`\alpha + \beta = \gamma`)).toBe("<em>α</em> + <em>β</em> = <em>γ</em>");
  });

  it("italicizes adjacent variables per character", () => {
    expect(inlineMathToHtml("E = mc^2")).toBe("<em>E</em> = <em>m</em><em>c</em>²");
  });

  it("uses Unicode sub/superscripts when every character has a form", () => {
    expect(inlineMathToHtml("x_{12}^{3}")).toBe("<em>x</em>₁₂³");
    expect(inlineMathToHtml("x_a")).toBe("<em>x</em>ₐ");
  });

  it("falls back to <sub>/<sup> otherwise", () => {
    expect(inlineMathToHtml("x_{q}")).toBe("<em>x</em><sub><em>q</em></sub>");
    expect(inlineMathToHtml("2^{n+1}")).toBe("2ⁿ⁺¹");
  });

  it("keeps known function names upright", () => {
    const html = inlineMathToHtml(String.raw`\sin x + \cos y`);
    expect(html).toBe("sin <em>x</em> + cos <em>y</em>");
  });

  it("expands fractions", () => {
    expect(inlineMathToHtml(String.raw`\frac{1}{2}`)).toBe("(1)/(2)");
  });

  it("escapes HTML-special characters", () => {
    expect(inlineMathToHtml("a < b > c & d")).toBe("<em>a</em> &lt; <em>b</em> &gt; <em>c</em> &amp; <em>d</em>");
  });

  it("keeps bare scripts without a Unicode form as <sup>/<sub>", () => {
    expect(inlineMathToHtml("x_y")).toBe("<em>x</em><sub><em>y</em></sub>");
    expect(inlineMathToHtml(String.raw`x^\alpha`)).toBe("<em>x</em><sup><em>α</em></sup>");
  });

  it("nests scripts inside scripts", () => {
    expect(inlineMathToHtml("x^{a_{b}}")).toBe("<em>x</em><sup><em>a</em><sub><em>b</em></sub></sup>");
    expect(inlineMathToHtml("e^{-x_{i}^2}")).toBe("<em>e</em><sup>−<em>x</em><sub><em>i</em></sub>²</sup>");
  });

  it("keeps escaped braces", () => {
    expect(inlineMathToHtml(String.raw`S = \{1, 2\}`)).toBe("<em>S</em> = {1, 2}");
  });

  it("keeps \\text and \\operatorname arguments upright and untouched", () => {
    expect(inlineMathToHtml(String.raw`\operatorname{sgn}(x)`)).toBe("sgn(<em>x</em>)");
    expect(inlineMathToHtml(String.raw`\text{if } x > 0`)).toBe("if  <em>x</em> &gt; 0");
    expect(inlineMathToHtml(String.raw`\text{max_len} < n`)).toBe("max_len &lt; <em>n</em>");
    expect(inlineMathToHtml(String.raw`A^\text{T}`)).toBe("<em>A</em><sup>T</sup>");
  });

  it("still converts symbols inside upright text", () => {
    expect(inlineMathToHtml(String.raw`5\,\mathrm{\mu m}`)).toMatch(/^5\s+μ m$/); // \, is a thin space
    expect(inlineMathToHtml(String.raw`\mathrm{\Delta}x`)).toBe("Δ<em>x</em>");
    expect(inlineMathToHtml(String.raw`\frac\text{a}b`)).toBe("(a)/(<em>b</em>)");
  });

  it("handles delimiters, limits and other commands unicodeit lacks", () => {
    expect(inlineMathToHtml(String.raw`\left( x \right)`)).toBe("( <em>x</em> )");
    expect(inlineMathToHtml(String.raw`\lvert x \rvert`)).toBe("| <em>x</em> |");
    expect(inlineMathToHtml(String.raw`\sum\limits_i`)).toBe("∑ᵢ");
    expect(inlineMathToHtml(String.raw`\bm{x} + a \dots`)).toBe("𝐱 + <em>a</em> …");
  });

  it("uses Unicode for scripts with a minus sign", () => {
    expect(inlineMathToHtml("x^{-1}")).toBe("<em>x</em>⁻¹");
  });

  it("leaves unknown commands after ^ alone", () => {
    expect(inlineMathToHtml(String.raw`e^\foo`)).toBe(String.raw`<em>e</em>^\foo`);
  });

  it("expands \\dfrac and \\tfrac like \\frac", () => {
    expect(inlineMathToHtml(String.raw`\dfrac{a}{b} + \tfrac12`)).toBe("(<em>a</em>)/(<em>b</em>) + (1)/(2)");
  });

  it("converts symbols through unicodeit", () => {
    expect(inlineMathToHtml(String.raw`\sum_i \int f \leq \infty`)).toContain("∑");
    expect(inlineMathToHtml(String.raw`x \in \mathbb{R}`)).toContain("ℝ");
  });
});

describe("inlineMathToText", () => {
  it("writes scripts without a Unicode form as ^x / _(xy)", () => {
    expect(inlineMathToText(String.raw`e^{i\pi} + x_{y}`)).toBe("e^(iπ) + x_y");
    expect(inlineMathToText("10^{-3}")).toBe("10⁻³");
  });

  it("strips markup and decodes entities", () => {
    expect(inlineMathToText("a < x_1")).toBe("a < x₁");
    expect(inlineMathToText("x_{q} < 1")).toBe("x_q < 1");
  });
});

describe("expandFrac", () => {
  it("handles nested braces, spaces and multiple fractions", () => {
    expect(expandFrac(String.raw`\frac {a + b} {c}`)).toBe("(a + b)/(c)");
    expect(expandFrac(String.raw`\frac{a}{b} + \frac{c}{d}`)).toBe("(a)/(b) + (c)/(d)");
    expect(expandFrac(String.raw`\frac{\frac{a}{b}}{c}`)).toBe(String.raw`(\frac{a}{b})/(c)`);
  });
});

describe("italicize", () => {
  it("leaves tags and unresolved commands alone", () => {
    expect(italicize("<sup>2</sup>")).toBe("<sup>2</sup>");
    expect(italicize(String.raw`\mathcal x`)).toBe(String.raw`\mathcal <em>x</em>`);
  });
});
