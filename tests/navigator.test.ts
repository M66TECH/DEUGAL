import { describe, expect, it } from "vitest";
import {
  applyFilter,
  createState,
  currentSnippet,
  handleKey,
  jumpTo,
  moveCursor,
  visibleWindow,
} from "../src/ui/navigator.js";
import { renderNavigator } from "../src/ui/navigator-view.js";
import type { Snippet } from "../src/core/types.js";

function snippet(id: string, title: string, extra: Partial<Snippet> = {}): Snippet {
  const now = new Date().toISOString();
  return { id, title, content: `contenu de ${title}`, tags: [], createdAt: now, updatedAt: now, useCount: 0, ...extra };
}

const corpus = [
  snippet("aaaa1111", "premier", { updatedAt: "2026-01-01T00:00:00.000Z" }),
  snippet("bbbb2222", "deuxieme", { updatedAt: "2026-02-01T00:00:00.000Z" }),
  snippet("cccc3333", "troisieme", { updatedAt: "2026-03-01T00:00:00.000Z", pinned: true }),
];

describe("createState", () => {
  it("sorts pinned first then by most recent", () => {
    const state = createState(corpus);
    expect(state.filtered.map((s) => s.title)).toEqual(["troisieme", "deuxieme", "premier"]);
    expect(state.cursor).toBe(0);
  });

  it("enforces a sane page size", () => {
    expect(createState(corpus, 0).pageSize).toBe(1);
  });
});

describe("moveCursor", () => {
  it("moves and wraps around", () => {
    let state = createState(corpus, 2);
    expect(currentSnippet(state)?.title).toBe("troisieme");
    state = moveCursor(state, 1);
    expect(currentSnippet(state)?.title).toBe("deuxieme");
    state = moveCursor(state, 2);
    expect(currentSnippet(state)?.title).toBe("troisieme");
    state = moveCursor(state, -1);
    expect(currentSnippet(state)?.title).toBe("premier");
  });

  it("keeps the window scrolled to follow the cursor", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      snippet(`id${String(i).padStart(6, "0")}`, `t${i}`, {
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      }),
    );
    let state = createState(many, 5);
    expect(currentSnippet(state)?.title).toBe("t19");
    for (let i = 0; i < 12; i++) state = moveCursor(state, 1);
    expect(state.cursor).toBe(12);
    expect(state.offset).toBe(8);
    const window = visibleWindow(state);
    expect(window.firstIndex).toBe(8);
    expect(window.items).toHaveLength(5);
    expect(window.items[4]!.title).toBe("t7");
    expect(currentSnippet(state)?.title).toBe("t7");
  });

  it("stays at zero on an empty list", () => {
    const state = moveCursor(createState([]), 1);
    expect(state.cursor).toBe(0);
    expect(currentSnippet(state)).toBeUndefined();
  });
});

describe("jumpTo", () => {
  it("clamps out-of-range indexes", () => {
    const state = jumpTo(createState(corpus, 2), 99);
    expect(state.cursor).toBe(2);
    expect(jumpTo(state, -5).cursor).toBe(0);
  });
});

describe("applyFilter", () => {
  it("filters with the provided matcher", () => {
    const state = applyFilter({ ...createState(corpus), query: "deux" }, (s, q) =>
      s.title.toLowerCase().includes(q.toLowerCase()),
    );
    expect(state.filtered.map((s) => s.title)).toEqual(["deuxieme"]);
    expect(state.cursor).toBe(0);
  });

  it("returns everything for a blank query", () => {
    const state = applyFilter({ ...createState(corpus), query: "   " }, () => false);
    expect(state.filtered).toHaveLength(3);
  });
});

describe("handleKey", () => {
  it("navigates with arrows and vim keys", () => {
    const state = createState(corpus, 5);
    expect(currentSnippet(handleKey("\u001b[B", state).state)?.title).toBe("deuxieme");
    expect(currentSnippet(handleKey("j", state).state)?.title).toBe("deuxieme");
    expect(currentSnippet(handleKey("k", state).state)?.title).toBe("premier");
    expect(currentSnippet(handleKey("G", state).state)?.title).toBe("premier");
    expect(currentSnippet(handleKey("g", jumpTo(state, 2)).state)?.title).toBe("troisieme");
  });

  it("returns actions for enter, use and edit", () => {
    const state = createState(corpus, 5);
    expect(handleKey("\r", state).result).toEqual({ snippet: corpus[2], action: "copy" });
    expect(handleKey("u", state).result?.action).toBe("use");
    expect(handleKey("e", state).result?.action).toBe("edit");
  });

  it("quits on q and control-c", () => {
    const state = createState(corpus);
    expect(handleKey("q", state).quit).toBe(true);
    expect(handleKey("\u0003", state).quit).toBe(true);
  });

  it("delegates query typing and backspace to the context", () => {
    const state = createState(corpus);
    const typed = handleKey("z", state, {
      appendQuery: (current, char) => ({ ...current, query: current.query + char }),
    });
    expect(typed.state.query).toBe("z");
    const erased = handleKey("\u007f", typed.state, {
      backspaceQuery: (current) => ({ ...current, query: current.query.slice(0, -1) }),
    });
    expect(erased.state.query).toBe("");
  });

  it("ignores unknown keys without redrawing", () => {
    const state = createState(corpus);
    expect(handleKey("\u001b", state).redraw).toBeUndefined();
  });
});

describe("renderNavigator", () => {
  it("shows the header, cursor marker and preview", () => {
    const output = renderNavigator(createState(corpus, 5));
    expect(output).toContain("deugal  3/3 snippet(s)");
    expect(output).toContain(">");
    expect(output).toContain("troisieme");
    expect(output).toContain("contenu de troisieme");
    expect(output).toContain("q quitter");
  });

  it("shows the query and the empty state", () => {
    const empty = { ...createState([]), query: "zzz" };
    const output = renderNavigator(empty);
    expect(output).toContain("/zzz");
    expect(output).toContain("aucun snippet ne correspond");
  });

  it("marks pinned snippets", () => {
    expect(renderNavigator(createState(corpus, 5))).toContain("*");
  });
});
