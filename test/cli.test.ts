import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

describe("cli", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes <article>.html next to the input", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const dir = await mkdtemp(path.join(tmpdir(), "md2wb-"));
    const input = path.join(dir, "post.md");
    await writeFile(input, "# Hi\n");
    expect(await main([input, "-t", "x"])).toBe(0);
    expect(await readFile(path.join(dir, "post.html"), "utf8")).toContain("<h1>Hi</h1>");
  });

  it("fails on bad usage", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await main([])).toBe(1);
    expect(await main(["a.md", "--target", "medium"])).toBe(1);
    expect(error).toHaveBeenLastCalledWith(expect.stringContaining("Unknown target"));
  });
});
