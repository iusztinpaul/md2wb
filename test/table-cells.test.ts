import { expect, it, vi } from "vitest";
import { convert } from "../src/index.js";
import { renderTable } from "../src/table.js";

vi.mock("../src/table.js", async (importOriginal) => {
  const table = await importOriginal<typeof import("../src/table.js")>();
  return { ...table, renderTable: vi.fn(table.renderTable) };
});

it("passes cell text to the table renderer, keeping prices as text", async () => {
  await convert("| Plan | Note |\n| :-- | --: |\n| Pro | costs $5 and $10, $x_1$ |", { onWarning: () => {} });
  const [rows] = vi.mocked(renderTable).mock.calls[0]!;
  expect(rows).toEqual([
    [
      { text: "Plan", align: "left", header: true },
      { text: "Note", align: "right", header: true },
    ],
    [
      { text: "Pro", align: "left", header: false },
      { text: "costs $5 and $10, x₁", align: "right", header: false },
    ],
  ]);
});

it("lifts a trailing 'Table N:' row out of the table as a caption paragraph", async () => {
  vi.mocked(renderTable).mockClear();
  const html = await convert("| A | B |\n| --- | --- |\n| 1 | 2 |\nTable 1: The *numbers*, a month.", { onWarning: () => {} });
  const [rows] = vi.mocked(renderTable).mock.calls[0]!;
  expect(rows.map((row) => row.map((cell) => cell.text))).toEqual([["A", "B"], ["1", "2"]]);
  expect(html).toContain("<p>Table 1: The <em>numbers</em>, a month.</p>");
});

it("keeps a last row that only looks like a caption in the first cell", async () => {
  vi.mocked(renderTable).mockClear();
  await convert("| A | B |\n| --- | --- |\n| Table 2: x | y |", { onWarning: () => {} });
  const [rows] = vi.mocked(renderTable).mock.calls[0]!;
  expect(rows).toHaveLength(2);
});
