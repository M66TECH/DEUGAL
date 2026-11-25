import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA, migrateStore, toStoreData } from "../src/core/migrate.js";
import { StoreError } from "../src/core/errors.js";

const NOW = "2026-03-01T00:00:00.000Z";

describe("migrateStore", () => {
  it("accepts an already healthy store without repairs", () => {
    const raw = {
      version: 1,
      snippets: [
        { id: "abc12345", title: "propre", content: "ok", tags: ["x"], createdAt: NOW, updatedAt: NOW, useCount: 2 },
      ],
    };
    const report = migrateStore(raw, NOW);
    expect(report.fromVersion).toBe(1);
    expect(report.toVersion).toBe(CURRENT_SCHEMA);
    expect(report.repairs).toEqual([]);
    expect(report.snippets[0]?.title).toBe("propre");
  });

  it("accepts a bare array of snippets", () => {
    const report = migrateStore([{ title: "seul", content: "contenu" }], NOW);
    expect(report.repairs.some((r) => r.includes("bare array"))).toBe(true);
    expect(report.snippets).toHaveLength(1);
    expect(report.snippets[0]?.id).toMatch(/^[a-z0-9]{8}$/);
  });

  it("fills missing ids and dates", () => {
    const report = migrateStore({ version: 0, snippets: [{ title: "t", content: "c" }] }, NOW);
    expect(report.repairs.some((r) => r.includes("missing id"))).toBe(true);
    expect(report.snippets[0]?.createdAt).toBe(NOW);
    expect(report.snippets[0]?.updatedAt).toBe(NOW);
    expect(report.snippets[0]?.useCount).toBe(0);
  });

  it("regenerates duplicated ids", () => {
    const raw = {
      version: 1,
      snippets: [
        { id: "sameid11", title: "un", content: "1", createdAt: NOW, updatedAt: NOW },
        { id: "sameid11", title: "deux", content: "2", createdAt: NOW, updatedAt: NOW },
      ],
    };
    const report = migrateStore(raw, NOW);
    const ids = report.snippets.map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
    expect(report.repairs.some((r) => r.includes("duplicated id"))).toBe(true);
  });

  it("converts string tags and keeps optional fields", () => {
    const raw = {
      version: 1,
      snippets: [
        {
          id: "tags0001",
          title: "avec tags texte",
          content: "c",
          tags: "git, deps ops",
          language: "BASH",
          description: "desc",
          pinned: true,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    };
    const report = migrateStore(raw, NOW);
    const snippet = report.snippets[0]!;
    expect(snippet.tags).toEqual(["git", "deps", "ops"]);
    expect(snippet.language).toBe("bash");
    expect(snippet.description).toBe("desc");
    expect(snippet.pinned).toBe(true);
  });

  it("normalizes multi-line titles and invalid dates", () => {
    const raw = {
      version: 1,
      snippets: [
        { id: "dates001", title: "titre\nsur deux lignes", content: "c", createdAt: "pas une date", updatedAt: NOW },
      ],
    };
    const report = migrateStore(raw, NOW);
    expect(report.snippets[0]?.title).toBe("titre sur deux lignes");
    expect(report.snippets[0]?.createdAt).toBe(NOW);
    expect(report.repairs.some((r) => r.includes("invalid creation date"))).toBe(true);
  });

  it("rejects stores from a newer schema", () => {
    expect(() => migrateStore({ version: 99, snippets: [] }, NOW)).toThrow(StoreError);
  });

  it("rejects snippets without title or content", () => {
    expect(() => migrateStore({ version: 1, snippets: [{ id: "x", title: "", content: "c" }] }, NOW)).toThrow(
      /no title or no content/,
    );
    expect(() => migrateStore({ version: 1, snippets: [{ title: "t" }] }, NOW)).toThrow(StoreError);
  });

  it("rejects non-object entries and non-object stores", () => {
    expect(() => migrateStore({ version: 1, snippets: ["texte"] }, NOW)).toThrow(/is not an object/);
    expect(() => migrateStore(42, NOW)).toThrow(/not a JSON object/);
  });

  it("produces a valid store payload", () => {
    const report = migrateStore({ version: 1, snippets: [{ title: "a", content: "b" }] }, NOW);
    const data = toStoreData(report.snippets);
    expect(data.version).toBe(CURRENT_SCHEMA);
    expect(data.snippets).toHaveLength(1);
  });
});
