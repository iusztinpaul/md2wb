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
