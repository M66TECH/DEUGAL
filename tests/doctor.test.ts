import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkConfigFile,
  checkDataDir,
  checkNodeVersion,
  checkStore,
  hasErrors,
  runChecks,
} from "../src/core/doctor.js";
import { SnippetStore } from "../src/core/store.js";
import type { DeugalConfig } from "../src/core/config.js";

let dir: string;
let config: DeugalConfig;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "deugal-doctor-"));
  config = { dataDir: dir, storeFile: path.join(dir, "snippets.json") };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("checkNodeVersion", () => {
  it("accepts 22.12 and above", () => {
    expect(checkNodeVersion("22.12.0").status).toBe("ok");
    expect(checkNodeVersion("22.18.0").status).toBe("ok");
    expect(checkNodeVersion("24.0.0").status).toBe("ok");
  });

  it("warns below 22.12", () => {
    expect(checkNodeVersion("22.11.9").status).toBe("warn");
    expect(checkNodeVersion("20.11.0").status).toBe("warn");
  });
});

describe("checkDataDir", () => {
  it("reports a missing directory as ok with a note", () => {
    const missing = { dataDir: path.join(dir, "absent"), storeFile: path.join(dir, "absent", "snippets.json") };
    const check = checkDataDir(missing);
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("will be created");
  });

  it("accepts an existing directory", () => {
    expect(checkDataDir(config).status).toBe("ok");
  });
});

describe("checkStore", () => {
  it("handles the absence of a store", () => {
    const checks = checkStore(config);
    expect(checks[0]?.status).toBe("ok");
    expect(checks[0]?.detail).toContain("no store yet");
  });

  it("counts snippets and reports unique ids plus backups", () => {
    const store = new SnippetStore(config.storeFile);
    store.add({ title: "un", content: "1", tags: [] });
    store.add({ title: "deux", content: "2", tags: [] });
    const checks = checkStore(config);
    expect(checks.find((c) => c.name === "store")?.detail).toContain("2 snippet(s)");
    expect(checks.find((c) => c.name === "store ids")?.status).toBe("ok");
    expect(checks.find((c) => c.name === "backups")?.status).toBe("ok");
  });

  it("flags a corrupted store as an error", () => {
    writeFileSync(config.storeFile, "{pas du json", "utf8");
    const checks = checkStore(config);
    expect(checks[0]?.status).toBe("error");
    expect(hasErrors(checks)).toBe(true);
  });
});

describe("checkConfigFile", () => {
  it("reports the absence of overrides", () => {
    expect(checkConfigFile(config).detail).toContain("no overrides");
  });

  it("flags invalid config JSON", () => {
    writeFileSync(path.join(dir, "config.json"), "{oops", "utf8");
    expect(checkConfigFile(config).status).toBe("error");
  });
});

describe("runChecks", () => {
  it("returns every category and a healthy overall state", () => {
    const store = new SnippetStore(config.storeFile);
    store.add({ title: "sain", content: "ok", tags: [] });
    const checks = runChecks(config, "22.18.0");
    const names = checks.map((c) => c.name);
    expect(names).toContain("node");
    expect(names).toContain("data dir");
    expect(names).toContain("store");
    expect(names).toContain("config");
    expect(names).toContain("sync");
    expect(hasErrors(checks)).toBe(false);
  });
});
