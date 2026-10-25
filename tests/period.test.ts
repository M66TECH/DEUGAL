import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration, sinceEpoch } from "../src/core/period.js";
import { StoreError } from "../src/core/errors.js";

describe("parseDuration", () => {
  it("understands minutes, hours, days and weeks", () => {
    expect(parseDuration("30m")).toBe(30 * 60_000);
    expect(parseDuration("24h")).toBe(24 * 3_600_000);
    expect(parseDuration("7d")).toBe(7 * 86_400_000);
    expect(parseDuration("2w")).toBe(2 * 604_800_000);
  });

  it("is forgiving about case and spaces", () => {
    expect(parseDuration("  7D ")).toBe(7 * 86_400_000);
    expect(parseDuration("3 h")).toBe(3 * 3_600_000);
  });

  it("rejects malformed durations", () => {
    for (const bad of ["", "7", "d", "7y", "-3d", "0d", "1.5d", "abc"]) {
      expect(() => parseDuration(bad)).toThrow(StoreError);
    }
  });
});

describe("sinceEpoch", () => {
  it("subtracts the duration from the given now", () => {
    const now = Date.parse("2026-10-24T12:00:00.000Z");
    expect(sinceEpoch("1h", now)).toBe(now - 3_600_000);
    expect(sinceEpoch("1d", now)).toBe(now - 86_400_000);
  });
});

describe("formatDuration", () => {
  it("picks the largest sensible unit", () => {
    expect(formatDuration(7 * 86_400_000)).toBe("1w");
    expect(formatDuration(3 * 86_400_000)).toBe("3d");
    expect(formatDuration(90 * 60_000)).toBe("1h");
    expect(formatDuration(45 * 60_000)).toBe("45m");
    expect(formatDuration(10_000)).toBe("0m");
  });
});
