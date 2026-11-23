import { describe, expect, it } from "vitest";
import { parseCommandLines } from "../src/core/textimport.js";
import { StoreError } from "../src/core/errors.js";

describe("parseCommandLines", () => {
  it("creates one snippet per non-empty line", () => {
    const snippets = parseCommandLines("git status\n\nls -la\n");
    expect(snippets).toHaveLength(2);
    expect(snippets[0]).toMatchObject({ title: "git status", content: "git status", tags: [] });
    expect(snippets[1]!.content).toBe("ls -la");
  });

  it("skips comments and duplicate lines", () => {
    const snippets = parseCommandLines("# mes commandes\ngit log\n// autre commentaire\ngit log\n   \n");
    expect(snippets).toHaveLength(1);
    expect(snippets[0]!.content).toBe("git log");
  });

  it("handles CRLF line endings", () => {
    const snippets = parseCommandLines("git push\r\ndocker ps\r\n");
    expect(snippets.map((s) => s.content)).toEqual(["git push", "docker ps"]);
  });

  it("truncates long titles but keeps full content", () => {
    const long = `echo ${"a".repeat(100)}`;
    const [snippet] = parseCommandLines(long);
    expect(snippet!.content).toBe(long);
    expect(snippet!.title.length).toBeLessThanOrEqual(60);
    expect(snippet!.title.endsWith("...")).toBe(true);
  });

  it("applies tag, language and title prefix", () => {
    const [snippet] = parseCommandLines("kubectl get pods", {
      tag: "k8s ops",
      language: "BASH",
      titlePrefix: "cluster",
    });
    expect(snippet!.tags).toEqual(["k8s", "ops"]);
    expect(snippet!.language).toBe("bash");
    expect(snippet!.title).toBe("cluster kubectl get pods");
  });

  it("rejects text without any command", () => {
    expect(() => parseCommandLines("\n\n# rien\n   \n")).toThrow(StoreError);
  });
});
