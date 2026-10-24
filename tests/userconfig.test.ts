import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyConfigPatch,
  configFilePath,
  emptyUserConfig,
  loadUserConfig,
  saveUserConfig,
} from "../src/core/userconfig.js";
import { StoreError } from "../src/core/errors.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "deugal-userconfig-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadUserConfig", () => {
  it("returns an empty config when the file does not exist", () => {
    expect(loadUserConfig(dir)).toEqual({});
    expect(configFilePath(dir)).toBe(path.join(dir, "config.json"));
  });

  it("keeps only valid values and ignores the rest", () => {
    writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({ editor: " nvim ", sort: "alpha", limit: 25, bogus: "dropped" }),
      "utf8",
    );
    expect(loadUserConfig(dir)).toEqual({ editor: "nvim", sort: "alpha", limit: 25 });
  });

  it("rejects invalid JSON with a helpful message", () => {
    writeFileSync(path.join(dir, "config.json"), "{oops", "utf8");
    expect(() => loadUserConfig(dir)).toThrow(/config reset/);
  });

  it("rejects non-object configs", () => {
    writeFileSync(path.join(dir, "config.json"), "[1,2]", "utf8");
    expect(() => loadUserConfig(dir)).toThrow(StoreError);
  });
});

describe("saveUserConfig", () => {
  it("writes atomically and reloads the same values", () => {
    saveUserConfig(dir, { editor: "nano", sort: "used", limit: 5 });
    expect(loadUserConfig(dir)).toEqual({ editor: "nano", sort: "used", limit: 5 });
  });

  it("round-trips an empty config", () => {
    saveUserConfig(dir, emptyUserConfig());
    expect(loadUserConfig(dir)).toEqual({});
  });
});

describe("applyConfigPatch", () => {
  it("sets each key with validation", () => {
    expect(applyConfigPatch({}, "editor", "nvim")).toEqual({ editor: "nvim" });
    expect(applyConfigPatch({}, "sort", "ALPHA")).toEqual({ sort: "alpha" });
    expect(applyConfigPatch({}, "limit", "12")).toEqual({ limit: 12 });
    expect(applyConfigPatch({ limit: 3 }, "limit", "9")).toEqual({ limit: 9 });
    expect(applyConfigPatch({}, "color", "NEVER")).toEqual({ color: "never" });
  });

  it("rejects invalid values", () => {
    expect(() => applyConfigPatch({}, "editor", "  ")).toThrow(StoreError);
    expect(() => applyConfigPatch({}, "sort", "random")).toThrow(StoreError);
    expect(() => applyConfigPatch({}, "limit", "zero")).toThrow(StoreError);
    expect(() => applyConfigPatch({}, "limit", "-2")).toThrow(StoreError);
    expect(() => applyConfigPatch({}, "color", "bright")).toThrow(StoreError);
  });
});

describe("file naming", () => {
  it("ignores stray temp files on load", () => {
    saveUserConfig(dir, { editor: "vi" });
    renameSync(configFilePath(dir), configFilePath(dir) + ".tmp-x");
    expect(loadUserConfig(dir)).toEqual({});
    writeFileSync(configFilePath(dir) + ".tmp-x", "{}", "utf8");
    expect(loadUserConfig(dir)).toEqual({});
    rmSync(configFilePath(dir) + ".tmp-x");
  });
});
