#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { convert } from "./convert.js";
import { getTarget } from "./targets.js";

const USAGE = `Usage: md2wb <article.md> [options]

Convert a Markdown article into paste-ready HTML for Substack or X Articles.
Open the result in a browser, click "Copy to clipboard", and paste.

Options:
  -t, --target <name>   substack (default) or x
  -o, --output <file>   output HTML file (default: <article>.html)
      --open            open the result in your browser
  -v, --version         print the version
  -h, --help            show this help`;

export async function main(argv: string[]): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        target: { type: "string", short: "t", default: "substack" },
        output: { type: "string", short: "o" },
        open: { type: "boolean", default: false },
        version: { type: "boolean", short: "v", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    console.error(`md2wb: ${(error as Error).message}\n\n${USAGE}`);
    return 1;
  }
  const { values, positionals } = args;
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values.version) {
    const pkg = new URL("../package.json", import.meta.url);
    console.log(JSON.parse(readFileSync(fileURLToPath(pkg), "utf8")).version);
    return 0;
  }
  if (positionals.length !== 1) {
    console.error(USAGE);
    return 1;
  }

  try {
    const target = getTarget(values.target);
    const input = path.resolve(positionals[0]!);
    const output = path.resolve(values.output ?? `${input.replace(/\.(md|markdown)$/i, "")}.html`);
    if (output === input) throw new Error("output path would overwrite the input file");
    console.log(`Converting ${path.relative(process.cwd(), input)} for ${target.label} …`);
    const html = await convert(await readFile(input, "utf8"), {
      target: target.name,
      baseDir: path.dirname(input),
    });
    await writeFile(output, html);
    console.log(`Written → ${output}`);
    if (values.open) openInBrowser(output);
    return 0;
  } catch (error) {
    console.error(`md2wb: ${(error as Error).message}`);
    return 1;
  }
}

function openInBrowser(file: string): void {
  const url = pathToFileURL(file).href;
  const [command, ...args] =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", '""', url]
        : ["xdg-open", url];
  spawn(command!, args, { detached: true, stdio: "ignore" })
    .on("error", (error) => console.error(`md2wb: could not open a browser: ${error.message}`))
    .unref();
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  process.exitCode = await main(process.argv.slice(2));
}
