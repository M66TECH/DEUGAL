import type { Snippet } from "../core/types.js";

export interface NavigatorState {
  items: Snippet[];
  filtered: Snippet[];
  query: string;
  cursor: number;
  offset: number;
  pageSize: number;
  message: string;
}

export interface NavigatorResult {
  snippet: Snippet;
  action: "use" | "copy" | "edit";
}

export const HELP_LINES = [
  "fleches haut/bas ou j/k   naviguer",
  "entree                    afficher et copier",
  "u                         afficher seulement",
  "e                         editer",
  "t                         ajouter un tag",
  "/                         commencer une recherche",
  "q                         quitter",
];

export function createState(items: Snippet[], pageSize = 12): NavigatorState {
  const sorted = [...items].sort(
    (a, b) => Number(b.pinned === true) - Number(a.pinned === true) || b.updatedAt.localeCompare(a.updatedAt),
  );
  return {
    items: sorted,
    filtered: sorted,
    query: "",
    cursor: 0,
    offset: 0,
    pageSize: Math.max(1, pageSize),
    message: "",
  };
}

export function applyFilter(state: NavigatorState, match: (snippet: Snippet, query: string) => boolean): NavigatorState {
  const query = state.query.trim();
  const filtered = query.length === 0 ? state.items : state.items.filter((s) => match(s, query));
  return { ...state, filtered, cursor: 0, offset: 0 };
}

export function moveCursor(state: NavigatorState, delta: number): NavigatorState {
  if (state.filtered.length === 0) return { ...state, cursor: 0, offset: 0 };
  const count = state.filtered.length;
  const cursor = (((state.cursor + delta) % count) + count) % count;
  const offset = Math.min(Math.max(0, cursor - state.pageSize + 1), Math.max(0, count - state.pageSize));
  const maxOffset = Math.max(0, count - state.pageSize);
  return { ...state, cursor, offset: Math.min(offset, maxOffset) };
}

export function jumpTo(state: NavigatorState, index: number): NavigatorState {
  if (state.filtered.length === 0) return state;
  const clamped = Math.min(Math.max(0, index), state.filtered.length - 1);
  const offset = Math.min(Math.max(0, clamped - state.pageSize + 1), Math.max(0, state.filtered.length - state.pageSize));
  return { ...state, cursor: clamped, offset };
}

export function currentSnippet(state: NavigatorState): Snippet | undefined {
  return state.filtered[state.cursor];
}

export function visibleWindow(state: NavigatorState): { items: Snippet[]; firstIndex: number } {
  const items = state.filtered.slice(state.offset, state.offset + state.pageSize);
  return { items, firstIndex: state.offset };
}

export interface KeyOutcome {
  state: NavigatorState;
  result?: NavigatorResult;
  quit?: boolean;
  redraw?: boolean;
}

export interface KeyContext {
  appendQuery: (state: NavigatorState, char: string) => NavigatorState;
  backspaceQuery: (state: NavigatorState) => NavigatorState;
}

export function handleKey(key: string, state: NavigatorState, context?: Partial<KeyContext>): KeyOutcome {
  switch (key) {
    case "\u0003":
    case "q":
      return { state, quit: true };
    case "\u001b[A":
    case "k":
      return { state: moveCursor(state, -1), redraw: true };
    case "\u001b[B":
    case "j":
      return { state: moveCursor(state, 1), redraw: true };
    case "\u001b[5~":
      return { state: moveCursor(state, -state.pageSize), redraw: true };
    case "\u001b[6~":
      return { state: moveCursor(state, state.pageSize), redraw: true };
    case "g":
      return { state: jumpTo(state, 0), redraw: true };
    case "G":
      return { state: jumpTo(state, state.filtered.length - 1), redraw: true };
    case "\r":
    case "\n":
    case "c": {
      const snippet = currentSnippet(state);
      if (!snippet) return { state, redraw: true };
      return { state, result: { snippet, action: "copy" } };
    }
    case "u": {
      const snippet = currentSnippet(state);
      if (!snippet) return { state, redraw: true };
      return { state, result: { snippet, action: "use" } };
    }
    case "e": {
      const snippet = currentSnippet(state);
      if (!snippet) return { state, redraw: true };
      return { state, result: { snippet, action: "edit" } };
    }
    case "\u007f":
    case "\b":
      return context?.backspaceQuery
        ? { state: context.backspaceQuery(state), redraw: true }
        : { state, redraw: true };
    default:
      if (key.length === 1 && key >= " " && context?.appendQuery) {
        return { state: context.appendQuery(state, key), redraw: true };
      }
      return { state };
  }
}
