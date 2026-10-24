import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inferFormat, parseBundle, serializeBundle, TRANSFER_VERSION } from "../src/core/transfer.js";
import { SnippetStore } from "../src/core/store.js";
import { StoreError } from "../src/core/errors.js";
import type { ExportBundle } from "../src/core/types.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "deugal-transfer-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeStore(): SnippetStore {
  return new SnippetStore(path.join(dir, "snippets.json"));
}

describe("inferFormat", () => {
  it("detects yaml by extension and defaults to json", () => {
    expect(inferFormat("a.yaml")).toBe("yaml");
    expect(inferFormat("b.YML")).toBe("yaml");
    expect(inferFormat("c.json")).toBe("json");
    expect(inferFormat("d")).toBe("json");
  });
});

describe("serializeBundle + parseBundle round trip", () => {
  it("round trips through json", () => {
    const bundle: ExportBundle = {
      deugal: TRANSFER_VERSION,
      exportedAt: "2026-10-23T00:00:00.000Z",
      snippets: [
        {
          id: "abc12345",
          title: "Sample",
          content: "SELECT 1;",
          tags: ["sql"],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          useCount: 3,
          language: "sql",
        },
      ],
    };
    const text = serializeBundle(bundle, "json");
    const parsed = parseBundle(text, "json");
    expect(parsed).toEqual(bundle.snippets);
    expect(text).toContain('"deugal": 1');
  });

  it("round trips through yaml", () => {
    const bundle: ExportBundle = {
      deugal: TRANSFER_VERSION,
      exportedAt: "2026-10-23T00:00:00.000Z",
      snippets: [
        {
          id: "yaml0001",
          title: "Yaml snippet",
          content: "echo hi",
          tags: ["shell"],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          useCount: 1,
        },
      ],
    };
    const text = serializeBundle(bundle, "yaml");
    expect(text).toContain("deugal: 1");
    const parsed = parseBundle(text, "yaml");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: "yaml0001",
      title: "Yaml snippet",
      content: "echo hi",
      tags: ["shell"],
      useCount: 1,
    });
  });

  it("accepts a bare array as input", () => {
    const parsed = parseBundle('[{"title":"t","content":"c"}]', "json");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.id).toMatch(/^[a-z0-9]{8}$/);
    expect(parsed[0]!.tags).toEqual([]);
  });

  it("rejects wrong shapes with helpful errors", () => {
    expect(() => parseBundle('{"foo":1}', "json")).toThrow(StoreError);
    expect(() => parseBundle("key: [unclosed", "yaml")).toThrow(StoreError);
    expect(() => parseBundle('[{"title":"no content"}]', "json")).toThrow(/entry 0/);
  });

  it("normalizes tags and optional fields", () => {
    const parsed = parseBundle(
      '[{"title":"T","content":"C","tags":["A","a","B"],"useCount":-4,"id":"my-id","language":"JSON"}]',
      "json",
    );
    expect(parsed[0]!.tags).toEqual(["a", "b"]);
    expect(parsed[0]!.useCount).toBe(0);
    expect(parsed[0]!.id).toBe("my-id");
    expect(parsed[0]!.language).toBe("json");
  });
});

describe("import into a real store", () => {
  const bundle = {
    deugal: 1,
    exportedAt: "2026-10-23T00:00:00.000Z",
    snippets: [
      {
        id: "same0001",
        title: "Existing title",
        content: "old content",
        tags: ["keep"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        useCount: 0,
      },
      {
        id: "brand0002",
        title: "Brand new",
        content: "fresh",
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        useCount: 2,
      },
    ],
  };

  it("adds new ids and reports existing ones", () => {
    const store = makeStore();
    store.upsert(bundle.snippets[0]!);
    const incoming = parseBundle(JSON.stringify(bundle), "json");
    let added = 0;
    let replaced = 0;
    let skipped = 0;
    for (const snippet of incoming) {
      if (!store.byId(snippet.id)) {
        store.upsert(snippet);
        added += 1;
      } else {
        skipped += 1;
      }
    }
    void replaced;
    expect(added).toBe(1);
    expect(skipped).toBe(1);
    expect(store.size()).toBe(2);
    expect(store.byId("brand0002")?.useCount).toBe(2);
  });

  it("overwrites when allowed", () => {
    const store = makeStore();
    store.upsert({
      id: "same0001",
      title: "Local version",
      content: "local",
      tags: [],
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      useCount: 9,
    });
    const incoming = parseBundle(JSON.stringify(bundle), "json");
    const target = incoming.find((s) => s.id === "same0001")!;
    const result = store.upsert(target);
    expect(result).toBe("replaced");
    expect(store.byId("same0001")?.title).toBe("Existing title");
    expect(store.byId("same0001")?.useCount).toBe(0);
  });
});
