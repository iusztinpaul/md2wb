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
    expect(inlineMathToHtml("x_a")).toBe("xₐ"); // one letter run, like nb2wb
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

  it("converts symbols through unicodeit", () => {
    expect(inlineMathToHtml(String.raw`\sum_i \int f \leq \infty`)).toContain("∑");
    expect(inlineMathToHtml(String.raw`x \in \mathbb{R}`)).toContain("ℝ");
  });
});

describe("inlineMathToText", () => {
  it("strips markup and decodes entities", () => {
    expect(inlineMathToText("a < x_1")).toBe("a < x₁");
    expect(inlineMathToText("x_{complex}")).toBe("xcomplex");
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
