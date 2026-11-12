import { StoreError } from "./errors.js";
import { normalizeSnippetInput } from "./store.js";
import type { NewSnippet, Snippet } from "./types.js";

export const CSV_COLUMNS = ["title", "content", "tags", "language", "description"] as const;

type CsvColumn = (typeof CSV_COLUMNS)[number];

export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeCsv(snippets: Snippet[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const snippet of snippets) {
    const row: string[] = [
      snippet.title,
      snippet.content,
      snippet.tags.join(" "),
      snippet.language ?? "",
      snippet.description ?? "",
    ];
    lines.push(row.map(escapeCsvField).join(","));
  }
  return `${lines.join("\n")}\n`;
}

interface ParseState {
  rows: string[][];
  field: string;
  row: string[];
  inQuotes: boolean;
  fieldStarted: boolean;
}

export function parseCsv(text: string): string[][] {
  const state: ParseState = { rows: [], field: "", row: [], inQuotes: false, fieldStarted: false };
  let i = 0;
  const pushField = (): void => {
    state.row.push(state.field);
    state.field = "";
    state.fieldStarted = false;
  };
  const pushRow = (): void => {
    pushField();
    const hasContent = state.row.some((value) => value.trim().length > 0);
    if (hasContent) state.rows.push(state.row);
    state.row = [];
  };
  while (i < text.length) {
    const char = text[i]!;
    if (state.inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          state.field += '"';
          i += 2;
          continue;
        }
        state.inQuotes = false;
        i += 1;
        continue;
      }
      state.field += char;
      i += 1;
      continue;
    }
    if (char === '"' && !state.fieldStarted) {
      state.inQuotes = true;
      state.fieldStarted = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    state.field += char;
    state.fieldStarted = true;
    i += 1;
  }
  if (state.inQuotes) {
    throw new StoreError("Invalid CSV: unterminated quoted field", "invalid");
  }
  if (state.field.length > 0 || state.row.length > 0) pushRow();
  return state.rows;
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase();
}

export function parseCsvSnippets(text: string): NewSnippet[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new StoreError("Invalid CSV: file is empty", "invalid");
  const header = rows[0]!.map(normalizeHeader);
  const required: CsvColumn[] = ["title", "content"];
  for (const column of required) {
    if (!header.includes(column)) {
      throw new StoreError(
        `Invalid CSV header: missing required column "${column}". Expected columns: ${CSV_COLUMNS.join(", ")}`,
        "invalid",
      );
    }
  }
  const indexOf = (column: CsvColumn): number => header.indexOf(column);
  const snippets: NewSnippet[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!;
    const value = (column: CsvColumn): string => {
      const index = indexOf(column);
      return index >= 0 ? (cells[index] ?? "") : "";
    };
    const tags = value("tags")
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const input: NewSnippet = { title: value("title"), content: value("content"), tags };
    const language = value("language").trim();
    if (language) input.language = language;
    const description = value("description").trim();
    if (description) input.description = description;
    try {
      snippets.push(normalizeSnippetInput(input));
    } catch {
      throw new StoreError(`Invalid CSV row ${i + 1}: title and content are required`, "invalid");
    }
  }
  if (snippets.length === 0) throw new StoreError("Invalid CSV: no snippet rows found", "invalid");
  return snippets;
}
