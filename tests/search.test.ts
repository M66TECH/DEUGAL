import { describe, expect, it } from "vitest";
import { isSubsequence, search } from "../src/core/search.js";
import type { Snippet } from "../src/core/types.js";

function snippet(overrides: Partial<Snippet> & { id: string; title: string }): Snippet {
  const now = new Date().toISOString();
  return {
    content: "",
    tags: [],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
    ...overrides,
  };
}

const corpus: Snippet[] = [
  snippet({
    id: "gitreseth",
    title: "Git reset hard",
    content: "git reset --hard origin/main",
    tags: ["git"],
    language: "bash",
  }),
  snippet({
    id: "reacthook",
    title: "React fetch hook",
    content: "useEffect(() => { fetch('/api').then(r => r.json()) })",
    tags: ["react", "hooks"],
    language: "ts",
    description: "fetches data on mount",
  }),
  snippet({
    id: "sqldump",
    title: "Dump postgres table",
    content: "pg_dump -t users mydb > users.sql",
    tags: ["sql", "postgres"],
    language: "bash",
    useCount: 7,
  }),
];

describe("search", () => {
  it("matches across title, tags, content, description and language", () => {
    expect(search(corpus, ["git"]).map((h) => h.snippet.id)).toEqual(["gitreseth"]);
    expect(search(corpus, ["postgres"]).map((h) => h.snippet.id)).toEqual(["sqldump"]);
    expect(search(corpus, ["hooks"]).map((h) => h.snippet.id)).toEqual(["reacthook"]);
    expect(search(corpus, ["mount"]).map((h) => h.snippet.id)).toEqual(["reacthook"]);
    expect(search(corpus, ["ts"]).map((h) => h.snippet.id)).toEqual(["reacthook"]);
    const bashIds = search(corpus, ["bash"]).map((h) => h.snippet.id);
    expect(bashIds).toContain("gitreseth");
    expect(bashIds).toContain("sqldump");
  });

  it("requires all terms to match (AND semantics)", () => {
    expect(search(corpus, ["git", "reset"]).map((h) => h.snippet.id)).toEqual(["gitreseth"]);
    expect(search(corpus, ["git", "postgres"])).toEqual([]);
  });

  it("gives exact id matches a top score", () => {
    const hits = search(corpus, ["sqldump"]);
    expect(hits[0]?.snippet.id).toBe("sqldump");
    expect(hits[0]?.where).toContain("id");
    expect(hits[0]?.score).toBeGreaterThanOrEqual(100);
  });

  it("ranks title matches above content matches", () => {
    const corpus2 = [
      snippet({ id: "aaaa", title: "plain", content: "docker compose up" }),
      snippet({ id: "bbbb", title: "docker stuff", content: "nothing" }),
    ];
    const hits = search(corpus2, ["docker"]);
    expect(hits[0]?.snippet.id).toBe("bbbb");
  });

  it("is case-insensitive", () => {
    expect(search(corpus, ["GIT"])).toHaveLength(1);
    expect(search(corpus, ["ReSeT"]).map((h) => h.snippet.id)).toEqual(["gitreseth"]);
  });

  it("returns no hits for empty terms", () => {
    expect(search(corpus, [])).toEqual([]);
    expect(search(corpus, ["   "])).toEqual([]);
  });

  it("fuzzy-matches title subsequences as fallback", () => {
    const hits = search(corpus, ["grst"]);
    expect(hits.map((h) => h.snippet.id)).toContain("gitreseth");
    expect(hits[0]?.where).toContain("title-fuzzy");
    expect(search(corpus, ["zzqq"])).toEqual([]);
  });

  it("does not fuzzy-match terms shorter than 3 characters", () => {
    const corpus2 = [snippet({ id: "aaaa", title: "abc", content: "def" })];
    expect(search(corpus2, ["ca"])).toEqual([]);
  });
});

describe("isSubsequence", () => {
  it("checks ordered character subsequences", () => {
    expect(isSubsequence("grst", "git reset hard")).toBe(true);
    expect(isSubsequence("tx", "git reset")).toBe(false);
    expect(isSubsequence("", "anything")).toBe(false);
    expect(isSubsequence("toolongneedle", "short")).toBe(false);
  });
});
