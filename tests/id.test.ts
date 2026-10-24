import { describe, expect, it } from "vitest";
import { randomId } from "../src/core/id.js";

describe("randomId", () => {
  it("generates ids of the requested length", () => {
    expect(randomId(8)).toHaveLength(8);
    expect(randomId(12)).toHaveLength(12);
    expect(randomId()).toHaveLength(8);
  });

  it("only uses the allowed alphabet", () => {
    for (let i = 0; i < 50; i++) {
      expect(randomId()).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("generates unique ids across many calls", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => randomId()));
    expect(ids.size).toBe(2000);
  });
});
