import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SnippetStore, StoreError } from "../src/core/store.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "deugal-store-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeStore(name = "snippets.json"): SnippetStore {
  return new SnippetStore(path.join(dir, name));
}

describe("SnippetStore.add", () => {
  it("creates a snippet with generated id and timestamps", () => {
    const store = makeStore();
    const snippet = store.add({ title: "hello", content: "world", tags: ["Test"] });
    expect(snippet.id).toMatch(/^[a-z0-9]{8}$/);
    expect(snippet.title).toBe("hello");
    expect(snippet.tags).toEqual(["test"]);
    expect(snippet.useCount).toBe(0);
    expect(Date.parse(snippet.createdAt)).not.toBeNaN();
    expect(snippet.updatedAt).toBe(snippet.createdAt);
  });

  it("keeps optional fields only when provided", () => {
    const store = makeStore();
    const withLang = store.add({ title: "a", content: "b", tags: [], language: " TS " });
    expect(withLang.language).toBe("ts");
    const withDesc = store.add({ title: "a", content: "b", tags: [], description: "hey" });
    expect(withDesc.description).toBe("hey");
    expect("language" in withDesc).toBe(false);
  });

  it("rejects empty title or content", () => {
    const store = makeStore();
    expect(() => store.add({ title: "  ", content: "x", tags: [] })).toThrow(StoreError);
    expect(() => store.add({ title: "x", content: "  ", tags: [] })).toThrow(StoreError);
  });

  it("normalizes and dedupes tags", () => {
    const store = makeStore();
    const snippet = store.add({ title: "a", content: "b", tags: ["Git", "git", "  GIT  ", ""] });
    expect(snippet.tags).toEqual(["git"]);
  });

  it("persists to disk and reloads in a new instance", () => {
    const file = path.join(dir, "persist.json");
    const first = new SnippetStore(file);
    const created = first.add({ title: "persist me", content: "data", tags: ["x"] });
    const second = new SnippetStore(file);
    const loaded = second.resolve(created.id);
    expect(loaded.title).toBe("persist me");
    expect(readFileSync(file, "utf8")).toContain('"persist me"');
  });

  it("writes atomically without leaving temp files", () => {
    const store = makeStore();
    store.add({ title: "a", content: "b", tags: [] });
    const files = readdirSync(dir);
    expect(files.filter((f) => f.includes(".tmp"))).toEqual([]);
  });
});

describe("SnippetStore.resolve", () => {
  it("matches exact ids and unique prefixes", () => {
    const store = makeStore();
    const a = store.add({ title: "A", content: "aa", tags: [] });
    const found = store.resolve(a.id.slice(0, 4));
    expect(found.id).toBe(a.id);
  });

  it("throws not-found for unknown ids", () => {
    const store = makeStore();
    expect(() => store.resolve("zzzzzzzz")).toThrow(StoreError);
  });

  it("throws ambiguous for shared prefixes and lists candidates", () => {
    const file = path.join(dir, "ambiguous.json");
    const now = new Date().toISOString();
    const base = { content: "x", tags: [], createdAt: now, updatedAt: now, useCount: 0 };
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        snippets: [
          { ...base, id: "abcdef12", title: "one" },
          { ...base, id: "abcdef99", title: "two" },
          { ...base, id: "fedcba98", title: "three" },
        ],
      }),
      "utf8",
    );
    const store = new SnippetStore(file);
    expect(store.resolve("abcdef1").id).toBe("abcdef12");
    try {
      store.resolve("abcdef");
      expect.fail("expected StoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(StoreError);
      const storeError = err as StoreError;
      expect(storeError.kind).toBe("ambiguous");
      expect(storeError.message).toContain("abcdef12");
      expect(storeError.message).toContain("abcdef99");
    }
  });
});

describe("SnippetStore.update / markUsed / delete", () => {
  it("updates fields and bumps updatedAt", async () => {
    const store = makeStore();
    const created = store.add({ title: "old", content: "c", tags: ["a"] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = store.update(created.id, {
      title: "new",
      content: "c2",
      tags: ["b", "c"],
      description: "now has one",
      language: "sql",
    });
    expect(updated.title).toBe("new");
    expect(updated.content).toBe("c2");
    expect(updated.tags).toEqual(["b", "c"]);
    expect(updated.description).toBe("now has one");
    expect(updated.language).toBe("sql");
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
  });

  it("clears optional fields with empty strings", () => {
    const store = makeStore();
    const created = store.add({ title: "t", content: "c", tags: [], description: "d", language: "js" });
    const updated = store.update(created.id, { description: "", language: "" });
    expect("description" in updated).toBe(false);
    expect("language" in updated).toBe(false);
  });

  it("rejects invalid patches", () => {
    const store = makeStore();
    const created = store.add({ title: "t", content: "c", tags: [] });
    expect(() => store.update(created.id, { title: "" })).toThrow(StoreError);
    expect(() => store.update("missing", { title: "x" })).toThrow(StoreError);
  });

  it("markUsed increments useCount and stamps lastUsedAt", () => {
    const store = makeStore();
    const created = store.add({ title: "t", content: "c", tags: [] });
    const used = store.markUsed(created.id);
    expect(used.useCount).toBe(1);
    expect(used.lastUsedAt).toBeDefined();
    expect(store.markUsed(created.id).useCount).toBe(2);
  });

  it("delete removes the snippet and reports missing ones", () => {
    const store = makeStore();
    const created = store.add({ title: "t", content: "c", tags: [] });
    expect(store.delete(created.id)).toBe(true);
    expect(store.size()).toBe(0);
    expect(store.delete(created.id)).toBe(false);
  });
});

describe("SnippetStore.list", () => {
  function seed(store: SnippetStore): void {
    store.add({ title: "banana", content: "yellow", tags: ["food"], language: "txt" });
    store.add({ title: "apple", content: "red", tags: ["food", "fruit"] });
    store.add({ title: "carrot", content: "orange", tags: ["food", "veg"] });
    store.add({ title: "date", content: "brown", tags: ["fruit"] });
  }

  it("filters by tags with AND semantics", () => {
    const store = makeStore();
    seed(store);
    const both = store.list({ tags: ["food", "fruit"] });
    expect(both.map((s) => s.title)).toEqual(["apple"]);
    const one = store.list({ tags: ["veg"] });
    expect(one.map((s) => s.title)).toEqual(["carrot"]);
  });

  it("sorts by recent, created, used and alpha", async () => {
    const store = makeStore();
    const first = store.add({ title: "banana", content: "yellow", tags: ["food"] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = store.add({ title: "apple", content: "red", tags: ["food"] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const third = store.add({ title: "carrot", content: "orange", tags: ["veg"] });

    const alpha = store.list({ sort: "alpha" });
    expect(alpha.map((s) => s.title)).toEqual(["apple", "banana", "carrot"]);

    const created = store.list({ sort: "created" });
    expect(created.map((s) => s.id)).toEqual([third.id, second.id, first.id]);

    store.update(first.id, { content: "changed" });
    const recent = store.list({ sort: "recent" });
    expect(recent[0]?.id).toBe(first.id);
  });

  it("limits results and clamps negative limits", () => {
    const store = makeStore();
    seed(store);
    expect(store.list({ limit: 2 })).toHaveLength(2);
    expect(store.list({ limit: -5 })).toHaveLength(0);
  });
});

describe("SnippetStore.related", () => {
  it("returns snippets sharing tags, sorted by shared count", () => {
    const store = makeStore();
    const a = store.add({ title: "A", content: "1", tags: ["git", "linux"] });
    const b = store.add({ title: "B", content: "2", tags: ["git"] });
    const c = store.add({ title: "C", content: "3", tags: ["git", "linux", "termux"] });
    store.add({ title: "D", content: "4", tags: ["unrelated"] });
    const related = store.related(a.id);
    expect(related.map((r) => r.snippet.id)).toEqual([c.id, b.id]);
    expect(related[0]!.shared).toEqual(["git", "linux"]);
    expect(related[1]!.shared).toEqual(["git"]);
  });

  it("resolves prefixes and excludes the base snippet", () => {
    const store = makeStore();
    const a = store.add({ title: "A", content: "1", tags: ["x"] });
    store.add({ title: "B", content: "2", tags: ["x"] });
    const related = store.related(a.id.slice(0, 3));
    expect(related).toHaveLength(1);
    expect(related.every((r) => r.snippet.id !== a.id)).toBe(true);
  });

  it("returns empty when nothing shares tags", () => {
    const store = makeStore();
    const a = store.add({ title: "A", content: "1", tags: ["x"] });
    store.add({ title: "B", content: "2", tags: ["y"] });
    expect(store.related(a.id)).toEqual([]);
  });
});

describe("SnippetStore.setPinned", () => {
  it("pins, unpins and keeps pinned items first in every sort", () => {
    const store = makeStore();
    store.add({ title: "plain", content: "1", tags: [] });
    const target = store.add({ title: "star me", content: "2", tags: [] });
    store.add({ title: "another", content: "3", tags: [] });

    const pinned = store.setPinned(target.id, true);
    expect(pinned.pinned).toBe(true);

    expect(store.list({ sort: "alpha" })[0]?.id).toBe(target.id);
    expect(store.list({ sort: "used" })[0]?.id).toBe(target.id);

    const unpinned = store.setPinned(target.id, false);
    expect("pinned" in unpinned).toBe(false);
    expect(store.list({ sort: "alpha" })[0]?.id).not.toBe(target.id);
  });

  it("rejects unknown ids", () => {
    const store = makeStore();
    expect(() => store.setPinned("zzzzzzzz", true)).toThrow(StoreError);
  });
});

describe("SnippetStore.tagCounts", () => {
  it("counts and sorts tags", () => {
    const store = makeStore();
    store.add({ title: "a", content: "1", tags: ["x", "y"] });
    store.add({ title: "b", content: "2", tags: ["x"] });
    store.add({ title: "c", content: "3", tags: ["x", "y", "z"] });
    const counts = store.tagCounts();
    expect(counts[0]).toEqual({ tag: "x", count: 3 });
    expect(counts[1]).toEqual({ tag: "y", count: 2 });
    expect(counts[2]).toEqual({ tag: "z", count: 1 });
  });
});

describe("SnippetStore error handling", () => {
  it("throws for invalid JSON store files", () => {
    const file = path.join(dir, "broken.json");
    writeFileSync(file, "{not json", "utf8");
    const store = new SnippetStore(file);
    expect(() => store.all()).toThrow(StoreError);
    try {
      store.all();
    } catch (err) {
      expect((err as StoreError).kind).toBe("invalid");
    }
  });

  it("throws when a snippet entry is malformed", () => {
    const file = path.join(dir, "corrupt.json");
    writeFileSync(
      file,
      JSON.stringify({ version: 1, snippets: [{ id: "x", title: 5, content: "y" }] }),
      "utf8",
    );
    const store = new SnippetStore(file);
    expect(() => store.all()).toThrow(/invalid snippet at index 0/);
  });

  it("starts empty when the file does not exist yet", () => {
    const store = makeStore("missing.json");
    expect(store.size()).toBe(0);
    expect(store.all()).toEqual([]);
  });
});
