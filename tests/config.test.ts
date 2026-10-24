import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resolveDataDir } from "../src/core/config.js";

const savedEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("resolveDataDir", () => {
  it("uses DEUGAL_HOME when set", () => {
    expect(resolveDataDir({ DEUGAL_HOME: "D:\\tmp\\deugal-data" })).toMatch(/deugal-data$/);
    expect(resolveDataDir({ DEUGAL_HOME: "/some/dir" })).toBe(path.resolve("/some/dir"));
  });

  it("trims whitespace but ignores empty DEUGAL_HOME", () => {
    expect(resolveDataDir({ DEUGAL_HOME: "   " })).not.toBe("");
    const home = os.homedir();
    expect(resolveDataDir({})).toBe(path.join(home, ".deugal"));
  });

  it("loadConfig returns the store file inside the data dir", () => {
    const config = loadConfig({ DEUGAL_HOME: "D:\\tmp\\deugal-data" });
    expect(path.basename(config.storeFile)).toBe("snippets.json");
    expect(config.storeFile.startsWith(config.dataDir)).toBe(true);
  });
});

describe("restore env integrity", () => {
  it("cleanup restores previous env", () => {
    expect(process.env.TEST_DEUGAL_UNSET).toBeUndefined();
  });

  it("uses its own tmp dirs when needed", () => {
    const dir = path.join(os.tmpdir(), "deugal-config-check");
    process.env.DEUGAL_HOME = dir;
    expect(loadConfig().dataDir).toBe(path.resolve(dir));
    rmSync(dir, { recursive: true, force: true });
  });
});
