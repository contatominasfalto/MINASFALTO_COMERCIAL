import { describe, expect, it } from "vitest";
import { isStockDateWithinPeriod } from "../client/src/lib/stock-period";

describe("isStockDateWithinPeriod", () => {
  it("inclui lançamentos de hoje mesmo quando estão após o horário atual", () => {
    const now = new Date(2026, 5, 29, 8, 0, 0);
    const movementAtNoon = new Date(2026, 5, 29, 12, 0, 0);

    expect(isStockDateWithinPeriod(movementAtNoon, now, now)).toBe(true);
  });

  it("não inclui lançamentos fora do período", () => {
    const start = new Date(2026, 5, 1, 18, 0, 0);
    const end = new Date(2026, 5, 29, 8, 0, 0);

    expect(
      isStockDateWithinPeriod(new Date(2026, 5, 30, 0, 0, 0), start, end),
    ).toBe(false);
  });
});
