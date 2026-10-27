// Inline `$...$` math -> readable Unicode text with light HTML (<em>, <sup>,
// <sub>), ported from nb2wb's inline_latex.py. Neither Substack nor X renders
// TeX, so inline math stays as selectable text instead of tiny images.

import { replace as unicodeit } from "unicodeit";

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ",
  n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ",
};

const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", s: "ₛ", t: "ₜ", x: "ₓ",
};

// Greek letters (and variant forms) that TeX italicizes in math mode.
const GREEK = new Set("αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩϕϵϑϱϖϰ");

// Function names TeX typesets upright.
const ROMAN_FUNCTIONS = new Set([
  "sin", "cos", "tan", "csc", "sec", "cot", "sinh", "cosh", "tanh", "coth", "sech", "csch",
  "arcsin", "arccos", "arctan", "arccot", "arcsec", "arccsc",
  "arsinh", "arcosh", "artanh", "arcoth", "arsech", "arcsch",
  "log", "ln", "lg", "exp", "arg", "deg", "hom", "pr", "lim", "max", "min", "sup", "inf",
  "liminf", "limsup", "det", "dim", "ker", "gcd", "lcm", "mod",
]);
const FUNCTION_COMMAND_RE = new RegExp(
  `\\\\(${[...ROMAN_FUNCTIONS, "Pr"].sort((a, b) => b.length - a.length).join("|")})(?![A-Za-z])`,
  "g",
);

// Private-use placeholders: the user's <, > and & stay out of the tag-aware
// steps, braced scripts are marked so they convert all-or-nothing, escaped
// braces survive brace stripping, and upright text is kept from italics.
const LT = "\uE000";
const GT = "\uE001";
const AMP = "\uE002";
const SUP = "\uE003";
const SUB = "\uE004";
const END = "\uE005";
const LBRACE = "\uE006";
const RBRACE = "\uE007";
const UPRIGHT = "\uE008";

// Commands whose argument is upright text rather than math.
const TEXT_COMMAND_RE = /\\(?:text|textrm|mathrm|operatorname\*?|mbox)\s*\{([^{}]*)\}/g;

/** Convert one inline TeX expression (without the dollars) to an HTML fragment. */
export function inlineMathToHtml(latex: string): string {
  // \text{...} contents are set aside so no math processing touches them.
  const upright: string[] = [];
  let text = latex
    .trim()
    .replaceAll("\\{", LBRACE)
    .replaceAll("\\}", RBRACE)
    .replace(TEXT_COMMAND_RE, (_, words: string) => `${UPRIGHT}${upright.push(words) - 1}\uE009`);
  text = expandFrac(text).replace(FUNCTION_COMMAND_RE, "$1");
  text = toUnicode(shieldScripts(text)).replace(/&/g, AMP).replace(/</g, LT).replace(/>/g, GT);
  text = expandScripts(text).replace(/[{}]/g, "");
  return italicize(text)
    .replace(/\uE008(\d+)\uE009/g, (_, i: string) => escapeHtml(upright[Number(i)]!))
    .replaceAll(LBRACE, "{")
    .replaceAll(RBRACE, "}")
    .replaceAll(AMP, "&amp;")
    .replaceAll(LT, "&lt;")
    .replaceAll(GT, "&gt;");
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function toUnicode(latex: string): string {
  try {
    return unicodeit(latex);
  } catch {
    return latex; // best effort: keep what unicodeit cannot parse
  }
}

/**
 * unicodeit maps whichever script characters it can (x_{complex} becomes
 * xcₒₘₚₗₑₓ), so braced scripts, nested ones included, are marked and
 * converted all-or-nothing by expandScripts() instead.
 */
function shieldScripts(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if ((ch === "^" || ch === "_") && text[i + 1] === "{") {
      const [inner, next] = braceArg(text, i + 1);
      out += (ch === "^" ? SUP : SUB) + toUnicode(shieldScripts(inner)) + END;
      i = next;
    } else if ((ch === "^" || ch === "_") && text[i + 1] === UPRIGHT) {
      // A \text{...} script such as A^\text{T}.
      const next = text.indexOf("\uE009", i) + 1;
      out += (ch === "^" ? SUP : SUB) + text.slice(i + 1, next) + END;
      i = next;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Plain-text variant, for places that cannot hold markup (table images). */
export function inlineMathToText(latex: string): string {
  return inlineMathToHtml(latex)
    .replace(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/** Read one `{...}` argument (or a single character) starting at `pos`. */
function braceArg(s: string, pos: number): [string, number] {
  if (s[pos] !== "{") return [s.slice(pos, pos + 1), pos + 1];
  let depth = 0;
  for (let i = pos; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return [s.slice(pos + 1, i), i + 1];
  }
  return [s.slice(pos + 1), s.length];
}

/** `\frac{a}{b}` (also d/t/cfrac) -> `(a)/(b)`; nested fractions are left as is. */
export function expandFrac(latex: string): string {
  const frac = /\\[dtc]?frac(?![A-Za-z])/y;
  let out = "";
  let i = 0;
  while (i < latex.length) {
    frac.lastIndex = i;
    if (frac.test(latex)) {
      i = frac.lastIndex;
      while (latex[i] === " ") i++;
      const [num, afterNum] = braceArg(latex, i);
      i = afterNum;
      while (latex[i] === " ") i++;
      const [den, afterDen] = braceArg(latex, i);
      i = afterDen;
      out += `(${num})/(${den})`;
    } else {
      out += latex[i++];
    }
  }
  return out;
}

/** Map script text to Unicode when every character has a form, else use <sup>/<sub>. */
function scriptText(inner: string, table: Record<string, string>, tag: string): string {
  const visible = [...inner].filter((ch) => ch.trim());
  if (visible.length && visible.every((ch) => table[ch] !== undefined)) {
    return [...inner].map((ch) => table[ch] ?? ch).join("");
  }
  return `<${tag}>${inner}</${tag}>`;
}

function expandScripts(text: string): string {
  // Innermost marked groups first, so nested scripts nest as tags.
  const innermost = /([\uE003\uE004])([^\uE003\uE004\uE005]*)\uE005/;
  while (innermost.test(text)) {
    text = text.replace(innermost, (_, mark: string, inner: string) =>
      mark === SUP ? scriptText(inner, SUPERSCRIPT, "sup") : scriptText(inner, SUBSCRIPT, "sub"),
    );
  }
  return text
    .replace(/\^([^\s{\\])/gu, (_, ch: string) => SUPERSCRIPT[ch] ?? `<sup>${ch}</sup>`)
    .replace(/_([^\s{\\])/gu, (_, ch: string) => SUBSCRIPT[ch] ?? `<sub>${ch}</sub>`);
}

/** Italicize variables and Greek letters, leaving tags and function names alone. */
export function italicize(html: string): string {
  return html
    .split(/(<[^>]+>|\uE008[^\uE009]*\uE009)/)
    .map((part) => (part.startsWith("<") || part.startsWith(UPRIGHT) ? part : italicizeText(part)))
    .join("");
}

function italicizeText(text: string): string {
  const chars = [...text];
  let out = "";
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i]!;
    if (GREEK.has(ch)) {
      out += `<em>${ch}</em>`;
      i++;
    } else if (/[A-Za-z]/.test(ch)) {
      const start = i;
      while (i < chars.length && /[A-Za-z]/.test(chars[i]!)) i++;
      const word = chars.slice(start, i).join("");
      const isCommand = chars[start - 1] === "\\"; // unresolved command, e.g. \mathbf
      if (!isCommand && !ROMAN_FUNCTIONS.has(word.toLowerCase())) {
        out += [...word].map((c) => `<em>${c}</em>`).join("");
      } else {
        out += word;
      }
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}
