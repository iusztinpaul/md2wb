// Publishing targets: preview-page theme plus the render settings for the
// images we generate. Values mirror nb2wb's `substack` and `x` profiles.

export type TargetName = "substack" | "x";

export interface CodeStyle {
  fontSize: number;
  /** Minimum width of the code panel, before outer padding. */
  imageWidth: number;
  paddingX: number;
  paddingY: number;
  theme: string;
}

export interface MathStyle {
  /** Pixels per em (nb2wb: 48pt at 150 dpi on Substack). */
  emPx: number;
  /** Vertical padding above and below the formula. */
  padding: number;
  imageWidth: number;
  color: string;
  background: string;
}

export interface TableStyle {
  fontSize: number;
  imageWidth: number;
  cellPaddingX: number;
  cellPaddingY: number;
  outerPadding: number;
  borderRadius: number;
  shadowAlpha: number;
  shadowBlur: number;
  shadowOffsetY: number;
}

export interface Target {
  name: TargetName;
  label: string;
  toolbarMessage: string;
  /** Wrap images with per-image "Copy image" buttons (editors that drop pasted images). */
  copyableImages: boolean;
  theme: Record<string, string>;
  extraCss: string;
  code: CodeStyle;
  math: MathStyle;
  table: TableStyle;
}

const BASE_THEME: Record<string, string> = {
  "body-font-family": 'Georgia, "Times New Roman", serif',
  "body-font-size": "18px",
  "body-line-height": "1.7",
  "body-color": "#222",
  "body-max-width": "960px",
  "body-padding": "24px 16px 60px",
  "body-background": "#f0f0f0",
  "toolbar-background": "#1e1e2e",
  "toolbar-color": "#cdd6f4",
  "toolbar-radius": "8px",
  "toolbar-shadow": "0 2px 8px rgba(0,0,0,0.25)",
  "toolbar-button-background": "#89b4fa",
  "toolbar-button-color": "#1e1e2e",
  "toolbar-button-hover-background": "#74c7ec",
  "toolbar-button-radius": "6px",
  "content-background": "#fff",
  "content-padding": "48px 56px",
  "content-radius": "8px",
  "content-shadow": "0 2px 12px rgba(0,0,0,0.08)",
  "heading-font-family": '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  "heading-font-weight": "700",
  "heading-color": "currentColor",
  "heading-margin": "1.4em 0 0.5em",
  "h1-size": "2em",
  "h2-size": "1.5em",
  "h3-size": "1.17em",
  "h3-letter-spacing": "normal",
  "blockquote-border": "#ddd",
  "blockquote-color": "#666",
  "mono-font-family": '"DejaVu Sans Mono", "Fira Code", Consolas, monospace',
  "mono-font-size": "0.85em",
  "pre-background": "#f4f4f4",
  "pre-padding": "1em",
  "inline-code-background": "transparent",
  "inline-code-padding": "0",
  "inline-code-radius": "0",
  "table-border": "#ddd",
  "table-header-background": "#f4f4f4",
  "hr-border": "#ddd",
  "link-color": "inherit",
  "copy-image-button-background": "rgba(26, 137, 23, 0.9)",
  "copy-image-button-hover-background": "rgba(13, 95, 11, 0.95)",
  "copy-image-button-copied-background": "#0d5f0b",
  "code-image-radius": "5px",
};

const X_THEME: Record<string, string> = {
  ...BASE_THEME,
  "body-font-family": '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  "body-font-size": "19px",
  "body-line-height": "1.6",
  "body-color": "#0f1419",
  "body-max-width": "680px",
  "body-padding": "24px 20px 60px",
  "body-background": "#fff",
  "toolbar-background": "#1d9bf0",
  "toolbar-color": "#fff",
  "toolbar-shadow": "0 2px 8px rgba(0,0,0,0.15)",
  "toolbar-button-background": "#fff",
  "toolbar-button-color": "#1d9bf0",
  "toolbar-button-hover-background": "#e8f5fe",
  "toolbar-button-radius": "20px",
  "content-padding": "0",
  "content-radius": "0",
  "content-shadow": "none",
  "heading-font-family": '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  "heading-font-weight": "800",
  "heading-color": "#0f1419",
  "heading-margin": "1.5em 0 0.6em",
  "h1-size": "2.2em",
  "h2-size": "1.8em",
  "h3-size": "1.4em",
  "blockquote-border": "#0f1419",
  "blockquote-color": "#0f1419",
  "mono-font-family": '"SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
  "mono-font-size": "0.88em",
  "pre-background": "#f7f9f9",
  "pre-padding": "1.2em",
  "inline-code-background": "#f7f9f9",
  "inline-code-padding": "0.15em 0.4em",
  "inline-code-radius": "3px",
  "table-border": "#eff3f4",
  "table-header-background": "#f7f9f9",
  "hr-border": "#eff3f4",
  "copy-image-button-background": "rgba(29, 155, 240, 0.9)",
  "copy-image-button-hover-background": "rgba(20, 120, 190, 0.95)",
  "copy-image-button-copied-background": "#1478be",
};

export const TARGETS: Record<TargetName, Target> = {
  substack: {
    name: "substack",
    label: "Substack",
    toolbarMessage: "Then paste directly into your Substack draft.",
    copyableImages: false,
    theme: BASE_THEME,
    extraCss: "#toolbar p { opacity: 0.7; }\nul, ol { padding-left: 1.6em; }\nli { margin-bottom: 0.25em; }",
    code: { fontSize: 48, imageWidth: 1920, paddingX: 100, paddingY: 100, theme: "monokai" },
    math: { emPx: 100, padding: 68, imageWidth: 1920, color: "#000000", background: "#ffffff" },
    table: {
      fontSize: 34,
      imageWidth: 1920,
      cellPaddingX: 24,
      cellPaddingY: 14,
      outerPadding: 20,
      borderRadius: 12,
      shadowAlpha: 24,
      shadowBlur: 18,
      shadowOffsetY: 8,
    },
  },
  x: {
    name: "x",
    label: "X Articles",
    toolbarMessage: "Paste into X Articles. If images are missing, hover each one to copy it.",
    copyableImages: true,
    theme: X_THEME,
    extraCss: "",
    code: { fontSize: 42, imageWidth: 1200, paddingX: 30, paddingY: 30, theme: "monokai" },
    math: { emPx: 73, padding: 50, imageWidth: 1200, color: "#000000", background: "#ffffff" },
    table: {
      fontSize: 30,
      imageWidth: 1200,
      cellPaddingX: 16,
      cellPaddingY: 10,
      outerPadding: 14,
      borderRadius: 10,
      shadowAlpha: 20,
      shadowBlur: 14,
      shadowOffsetY: 6,
    },
  },
};

export function getTarget(name: string): Target {
  if (name === "substack" || name === "x") return TARGETS[name];
  throw new Error(`Unknown target "${name}". Supported: ${Object.keys(TARGETS).join(", ")}`);
}
