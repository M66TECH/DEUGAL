import { search } from "../core/search.js";
import { applyFilter, createState, handleKey, type NavigatorResult } from "./navigator.js";
import { renderNavigator } from "./navigator-view.js";
import type { Snippet } from "../core/types.js";

export interface BrowseOptions {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  pageSize?: number;
}

export function browseSnippets(snippets: Snippet[], options: BrowseOptions = {}): Promise<NavigatorResult | undefined> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  let state = createState(snippets, options.pageSize ?? 12);

  return new Promise((resolve) => {
    const canRaw = typeof input.setRawMode === "function";
    if (!canRaw) {
      resolve(undefined);
      return;
    }
    const clearScreen = (): void => {
      output.write("\u001b[H\u001b[2J");
    };
    const draw = (): void => {
      clearScreen();
      output.write(renderNavigator(state));
    };

    const appendQuery = (current: typeof state, char: string): typeof state => {
      const withQuery = { ...current, query: current.query + char };
      return applyFilter(withQuery, (snippet, query) => {
        const term = query.trim().toLowerCase();
        if (term.length === 0) return true;
        if (snippet.id.startsWith(term)) return true;
        return snippet.title.toLowerCase().includes(term) || snippet.tags.some((tag: string) => tag.includes(term));
      });
    };
    const backspaceQuery = (current: typeof state): typeof state => {
      const withQuery = { ...current, query: current.query.slice(0, -1) };
      return applyFilter(withQuery, (snippet, query) => {
        const term = query.trim().toLowerCase();
        if (term.length === 0) return true;
        return snippet.title.toLowerCase().includes(term) || snippet.tags.some((tag: string) => tag.includes(term));
      });
    };

    const cleanup = (): void => {
      input.setRawMode?.(false);
      input.pause();
      input.removeListener("data", onData);
      output.write("\u001b[?25h\n");
    };

    const onData = (chunk: Buffer | string): void => {
      const text = chunk.toString();
      const outcome = handleKey(text, state, { appendQuery, backspaceQuery });
      state = outcome.state;
      if (outcome.quit === true) {
        cleanup();
        resolve(undefined);
        return;
      }
      if (outcome.result !== undefined) {
        cleanup();
        resolve(outcome.result);
        return;
      }
      if (outcome.redraw === true) draw();
    };

    output.write("\u001b[?25l");
    input.setRawMode?.(true);
    input.resume();
    input.on("data", onData);
    draw();
  });
}

export function filterByQuery(snippets: Snippet[], query: string): Snippet[] {
  return search(snippets, [query]).map((hit) => hit.snippet);
}
