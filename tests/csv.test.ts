import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, escapeCsvField, parseCsv, parseCsvSnippets, serializeCsv } from "../src/core/csv.js";
import { StoreError } from "../src/core/errors.js";
import type { Snippet } from "../src/core/types.js";

function snippet(overrides: Partial<Snippet> & { title: string; content: string }): Snippet {
  const now = new Date().toISOString();
  return { id: "abcdefgh", tags: [], createdAt: now, updatedAt: now, useCount: 0, ...overrides };
}

describe("escapeCsvField", () => {
  it("quotes only when needed and doubles quotes", () => {
    expect(escapeCsvField("simple")).toBe("simple");
    expect(escapeCsvField("avec, virgule")).toBe('"avec, virgule"');
    expect(escapeCsvField('il dit "bonjour"')).toBe('"il dit ""bonjour"""');
    expect(escapeCsvField("ligne1\nligne2")).toBe('"ligne1\nligne2"');
  });
});

describe("serializeCsv", () => {
  it("writes a header and one line per snippet", () => {
    const text = serializeCsv([
      snippet({ title: "deux lignes", content: "a\nb", tags: ["x", "y"], language: "bash" }),
      snippet({ title: "avec, virgule", content: 'echo "hi"' }),
    ]);
    const lines = text.trimEnd().split("\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(text).toContain('deux lignes,"a\nb",x y,bash,');
    expect(text).toContain('"avec, virgule","echo ""hi""",,,');
  });
});

describe("parseCsv", () => {
  it("handles quoted fields, escaped quotes and CRLF", () => {
    const rows = parseCsv('a,"b,c","l""x"\r\nd,e,f\r\n');
    expect(rows).toEqual([
      ["a", "b,c", 'l"x'],
      ["d", "e", "f"],
    ]);
  });

  it("ignores fully blank lines", () => {
    expect(parseCsv("a,b\n\n\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("rejects unterminated quotes", () => {
    expect(() => parseCsv('a,"oups')).toThrow(StoreError);
  });
});

describe("parseCsvSnippets", () => {
  it("maps columns into snippet inputs", () => {
    const rows = parseCsvSnippets(
      [
        "title,content,tags,language,description",
        'Premier,"echo 1",shell bash,BASH,un test',
        "Deuxieme,SELECT 1,sql,, ",
      ].join("\n"),
    );
    expect(rows[0]).toEqual({
      title: "Premier",
      content: "echo 1",
      tags: ["shell", "bash"],
      language: "bash",
      description: "un test",
    });
    expect(rows[1]).toEqual({ title: "Deuxieme", content: "SELECT 1", tags: ["sql"] });
  });

  it("accepts a different column order and extra columns", () => {
    const rows = parseCsvSnippets("content,notes,title\nbody,note,titre\n");
    expect(rows).toEqual([{ title: "titre", content: "body", tags: [] }]);
  });

  it("rejects missing required columns and empty files", () => {
    expect(() => parseCsvSnippets("titre,content\nx,y\n")).toThrow(/missing required column "title"/);
    expect(() => parseCsvSnippets("")).toThrow(StoreError);
    expect(() => parseCsvSnippets("title,content\n")).toThrow(/no snippet rows/);
  });

  it("rejects rows without title or content", () => {
    expect(() => parseCsvSnippets("title,content\nok,fine\n,faux\n")).toThrow(/Invalid CSV row 3/);
  });
});

describe("round trip", () => {
  it("keeps content with commas quotes and newlines intact", () => {
    const original = [
      snippet({ title: 'Titre, "special"', content: "ligne 1\nligne 2, with comma", tags: ["a", "b"], language: "ts" }),
    ];
    const back = parseCsvSnippets(serializeCsv(original));
    expect(back[0]?.title).toBe('Titre, "special"');
    expect(back[0]?.content).toBe("ligne 1\nligne 2, with comma");
    expect(back[0]?.tags).toEqual(["a", "b"]);
    expect(back[0]?.language).toBe("ts");
  });
});
