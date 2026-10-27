// The preview page: themed article plus a toolbar whose button copies the
// article as rich HTML, ready to paste into the target editor.

import type { Target } from "./targets.js";

// Copy the article as text/html, without the per-image buttons X pages add.
const COPY_SCRIPT = `
async function copyContent() {
  var btn = document.getElementById("copy-btn");
  var content = document.getElementById("content").cloneNode(true);
  content.querySelectorAll(".image-container").forEach(function (container) {
    var img = container.querySelector("img");
    if (img) container.replaceWith(img);
  });
  try {
    var blob = new Blob([content.innerHTML], { type: "text/html" });
    await navigator.clipboard.write([new ClipboardItem({ "text/html": blob })]);
  } catch (_) {
    // Fallback: select the cleaned copy off-screen and let the browser copy it.
    content.removeAttribute("id");
    content.style.position = "fixed";
    content.style.left = "-100000px";
    document.body.appendChild(content);
    var range = document.createRange();
    range.selectNodeContents(content);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand("copy");
    window.getSelection().removeAllRanges();
    content.remove();
  }
  btn.textContent = "\\u2713 Copied!";
  setTimeout(function () { btn.textContent = "\\u{1F4CB} Copy to clipboard"; }, 2500);
}`;

// Browsers only put PNG images on the clipboard, so other formats are converted.
const COPY_IMAGE_SCRIPT = `
async function toPng(blob) {
  if (blob.type === "image/png") return blob;
  var bitmap = await createImageBitmap(blob);
  var canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  return new Promise(function (resolve) { canvas.toBlob(resolve, "image/png"); });
}
async function copyImage(img, button) {
  try {
    var blob = await toPng(await (await fetch(img.src)).blob());
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    button.textContent = "\\u2713 Copied";
    button.classList.add("copied");
  } catch (err) {
    console.error("Failed to copy image:", err);
    button.textContent = "Failed";
  }
  setTimeout(function () {
    button.textContent = "Copy image";
    button.classList.remove("copied");
  }, 3000);
}
document.querySelectorAll(".image-container").forEach(function (container) {
  var img = container.querySelector("img");
  var btn = container.querySelector(".copy-image-btn");
  if (img && btn) btn.addEventListener("click", function () { copyImage(img, btn); });
});`;

const STYLES = `
* { box-sizing: border-box; }
body {
  font-family: var(--body-font-family);
  font-size: var(--body-font-size);
  line-height: var(--body-line-height);
  color: var(--body-color);
  max-width: var(--body-max-width);
  margin: 0 auto;
  padding: var(--body-padding);
  background: var(--body-background);
}
#toolbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--toolbar-background);
  color: var(--toolbar-color);
  padding: 10px 20px;
  border-radius: var(--toolbar-radius);
  margin-bottom: 28px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--toolbar-shadow);
}
#toolbar button {
  background: var(--toolbar-button-background);
  color: var(--toolbar-button-color);
  border: none;
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 600;
  border-radius: var(--toolbar-button-radius);
  cursor: pointer;
  transition: background 0.15s;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
#toolbar button:hover { background: var(--toolbar-button-hover-background); }
#toolbar p { margin: 0; font-size: 13px; opacity: 0.9; }
#content {
  background: var(--content-background);
  padding: var(--content-padding);
  border-radius: var(--content-radius);
  box-shadow: var(--content-shadow);
}
img { max-width: 100%; height: auto; display: block; }
img.code-img { border-radius: var(--code-image-radius); }
.image-container { position: relative; margin: 0.5em 0; }
.copy-image-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--copy-image-button-background);
  color: #fff;
  border: none;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 16px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.image-container:hover .copy-image-btn { opacity: 1; }
.copy-image-btn:hover { background: var(--copy-image-button-hover-background); }
.copy-image-btn.copied { opacity: 1; background: var(--copy-image-button-copied-background); }
h1, h2, h3, h4, h5, h6 {
  font-family: var(--heading-font-family);
  font-weight: var(--heading-font-weight);
  margin: var(--heading-margin);
  line-height: 1.3;
  color: var(--heading-color);
}
h1 { font-size: var(--h1-size); }
h2 { font-size: var(--h2-size); }
h3 { font-size: var(--h3-size); letter-spacing: var(--h3-letter-spacing); }
p { margin: 0 0 1em; }
ul, ol { margin: 0 0 1em; padding-left: 1.8em; }
li { margin-bottom: 0.3em; }
blockquote {
  border-left: 3px solid var(--blockquote-border);
  margin: 1.2em 0;
  padding: 0.1em 1.2em;
  color: var(--blockquote-color);
  font-style: italic;
}
pre, code { font-family: var(--mono-font-family); font-size: var(--mono-font-size); }
pre {
  background: var(--pre-background);
  padding: var(--pre-padding);
  border-radius: 4px;
  overflow-x: auto;
}
code {
  background: var(--inline-code-background);
  padding: var(--inline-code-padding);
  border-radius: var(--inline-code-radius);
}
pre code { background: none; padding: 0; border-radius: 0; }
table { border-collapse: collapse; width: 100%; margin-bottom: 1.2em; }
th, td { border: 1px solid var(--table-border); padding: 0.5em 0.8em; }
th { background: var(--table-header-background); font-weight: 600; }
hr { border: none; border-top: 1px solid var(--hr-border); margin: 2em 0; }
a { color: var(--link-color); text-decoration: underline; }`;

export function buildPage(contentHtml: string, target: Target): string {
  const themeVars = Object.entries(target.theme)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join("\n");
  const script = target.copyableImages ? COPY_SCRIPT + COPY_IMAGE_SCRIPT : COPY_SCRIPT;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>md2wb — ${target.label} Preview</title>
<style>
:root {
${themeVars}
}${STYLES}
${target.extraCss}
</style>
</head>
<body>
<div id="toolbar">
  <button id="copy-btn" onclick="copyContent()">&#128203; Copy to clipboard</button>
  <p>${target.toolbarMessage}</p>
</div>
<div id="content">
${contentHtml}
</div>
<script>${script}
</script>
</body>
</html>
`;
}
