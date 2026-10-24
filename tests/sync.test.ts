import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitAvailable, setRemote, status, sync } from "../src/core/sync.js";
import { SnippetStore } from "../src/core/store.js";

let dir: string;
const gitWorks = gitAvailable();

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "deugal-sync-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("sync module", () => {
  it.skipIf(!gitWorks)("detects that git is available", () => {
    expect(gitAvailable()).toBe(true);
  });

  it.skipIf(!gitWorks)("initializes a repo and commits store changes", () => {
    const store = new SnippetStore(dir + "/snippets.json");
    store.add({ title: "tracked", content: "in git", tags: ["meta"] });
    const first = sync(dir, { message: "first sync" });
    expect(first.initialized).toBe(true);
    expect(first.committed).toBe(true);
    expect(existsSync(dir + "/.git")).toBe(true);

    const afterInit = status(dir);
    expect(afterInit.isRepo).toBe(true);
    expect(afterInit.dirtyCount).toBe(0);
    expect(afterInit.lastCommit).toContain("first sync");

    store.add({ title: "tracked 2", content: "in git too", tags: [] });
    const second = sync(dir);
    expect(second.initialized).toBe(false);
    expect(second.committed).toBe(true);

    const clean = sync(dir);
    expect(clean.committed).toBe(false);
  });

  it.skipIf(!gitWorks)("keeps a remote url and reports sync status", () => {
    writeFileSync(path.join(dir, "snippets.json"), "{}", "utf8");
    setRemote(dir, "https://example.com/snippets.git");
    const st = status(dir);
    expect(st.remote).toBe("https://example.com/snippets.git");
    const pushFailsOnFakeRemote = sync(dir, { push: true });
    expect(pushFailsOnFakeRemote.pushed).toBe(false);
    expect(pushFailsOnFakeRemote.pushError).toBeDefined();
  });

  it("reports status gracefully outside any repo", () => {
    const st = status(path.join(dir, "nowhere"));
    expect(st.isRepo).toBe(false);
    expect(st.dirtyCount).toBe(0);
  });
});
