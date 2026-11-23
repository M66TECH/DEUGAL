import { describe, expect, it } from "vitest";
import { findSimilar, levenshtein, normalizeForComparison, similarity } from "../src/core/similar.js";
import type { Snippet } from "../src/core/types.js";

function snippet(id: string, title: string, content: string): Snippet {
  const now = new Date().toISOString();
  return { id, title, content, tags: [], createdAt: now, updatedAt: now, useCount: 0 };
}

describe("levenshtein", () => {
  it("computes edit distances", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("git reset", "git reset")).toBe(0);
  });
});

describe("normalizeForComparison", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeForComparison("  Git   RESET\n--hard ")).toBe("git reset --hard");
  });
});

describe("similarity", () => {
  it("is 1 for identical content after normalization", () => {
    expect(similarity("git reset  --hard", "git reset --hard")).toBe(1);
    expect(similarity("", "")).toBe(1);
  });

  it("is close to 1 for one character differences", () => {
    expect(similarity("docker ps", "docker pss")).toBeGreaterThan(0.85);
  });

  it("is low for unrelated content", () => {
    expect(similarity("git reset --hard", "SELECT * FROM users")).toBeLessThan(0.4);
  });

  it("handles very long content by substring containment", () => {
    const base = "x".repeat(500);
    expect(similarity(base, `${base}yy`)).toBeGreaterThan(0);
    expect(similarity("short", base)).toBe(0);
  });
});

describe("findSimilar", () => {
  it("groups near duplicates and reports the lowest score of the group", () => {
    const snippets = [
      snippet("a1", "git reset", "git reset --hard origin/main"),
      snippet("a2", "git reset", "git reset --hard origin/main "),
      snippet("a3", "git reset two", "git reset --hard origin/main!!"),
      snippet("b1", "sql", "SELECT * FROM users"),
    ];
    const groups = findSimilar(snippets, 0.85);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.snippets.map((s) => s.id).sort()).toEqual(["a1", "a2", "a3"]);
    expect(groups[0]!.score).toBeLessThan(1);
  });

  it("never groups a snippet in two groups", () => {
    const snippets = [
      snippet("x1", "un", "echo bonjour"),
      snippet("x2", "deux", "echo bonjour toi"),
      snippet("x3", "trois", "echo bonjour toi encore"),
    ];
    const groups = findSimilar(snippets, 0.7);
    const seen = groups.flatMap((g) => g.snippets.map((s) => s.id));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("returns nothing when all contents differ", () => {
    const snippets = [snippet("p", "a", "aaa"), snippet("q", "b", "zzz")];
    expect(findSimilar(snippets, 0.85)).toEqual([]);
  });

  it("respects the threshold", () => {
    const snippets = [snippet("m1", "a", "docker compose up"), snippet("m2", "b", "docker compose down")];
    expect(findSimilar(snippets, 0.95)).toHaveLength(0);
    expect(findSimilar(snippets, 0.5)).toHaveLength(1);
  });
});
