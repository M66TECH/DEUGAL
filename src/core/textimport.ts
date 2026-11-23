import { StoreError } from "./errors.js";
import { normalizeSnippetInput } from "./store.js";
import type { NewSnippet } from "./types.js";

export interface TextImportOptions {
  tag?: string | undefined;
  language?: string | undefined;
  titlePrefix?: string | undefined;
}

export function parseCommandLines(text: string, options: TextImportOptions = {}): NewSnippet[] {
  const lines = text.split(/\r?\n/);
  const snippets: NewSnippet[] = [];
  const seen = new Set<string>();
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#") || line.startsWith("//")) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    const baseTitle = line.length > 60 ? `${line.slice(0, 57)}...` : line;
    const title = options.titlePrefix ? `${options.titlePrefix} ${baseTitle}` : baseTitle;
    const input: NewSnippet = { title, content: line, tags: [] };
    if (options.tag !== undefined && options.tag.trim()) {
      input.tags = options.tag.split(/[\s,]+/).filter((t) => t.length > 0);
    }
    if (options.language !== undefined && options.language.trim()) {
      input.language = options.language;
    }
    try {
      snippets.push(normalizeSnippetInput(input));
    } catch (err) {
      throw new StoreError(`Invalid line "${line}": ${(err as Error).message}`, "invalid");
    }
  }
  if (snippets.length === 0) {
    throw new StoreError("No command found in the text (empty lines, blank and # comments are skipped)", "invalid");
  }
  return snippets;
}
