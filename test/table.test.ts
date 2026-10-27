import { describe, expect, it } from "vitest";
import { fitWidths } from "../src/table.js";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("fitWidths", () => {
  it("shares spare room evenly", () => {
    expect(fitWidths([100, 200], 400, 50)).toEqual([150, 250]);
  });

  it("caps only the columns wider than an equal share", () => {
    const fitted = fitWidths([150, 120, 3000], 1000, 112);
    expect(fitted.slice(0, 2)).toEqual([150, 120]);
    expect(sum(fitted)).toBe(1000);
  });

  it("never goes below the minimum width", () => {
    const fitted = fitWidths([500, 500, 500], 200, 112);
    expect(fitted.every((w) => w >= 112)).toBe(true);
  });
});
