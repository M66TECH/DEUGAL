import { stringify as stringifyYaml, parse as parseYaml } from "yaml";
import { StoreError } from "./errors.js";
import { normalizeSnippetInput } from "./store.js";
import { randomId } from "./id.js";
import type { ExportBundle, NewSnippet, Snippet } from "./types.js";

export type TransferFormat = "json" | "yaml";

export const TRANSFER_VERSION = 1;

export function inferFormat(filePath: string): TransferFormat {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  return "json";
}

export function serializeBundle(bundle: ExportBundle, format: TransferFormat): string {
  const text =
    format === "yaml" ? stringifyYaml(bundle) : `${JSON.stringify(bundle, null, 2)}\n`;
  return text;
}

function asRecord(value: unknown, index: number): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new StoreError(`Import error: entry ${index} is not an object`, "invalid");
  }
  return value as Record<string, unknown>;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  return value;
}

function normalizeEntry(value: unknown, index: number): Snippet {
  const record = asRecord(value, index);
  const title = typeof record.title === "string" ? record.title : undefined;
  const content = typeof record.content === "string" ? record.content : undefined;
  if (title === undefined || content === undefined) {
    throw new StoreError(
      `Import error: entry ${index} must have a "title" (string) and "content" (string)`,
      "invalid",
    );
  }
  const base: NewSnippet = {
    title,
    content,
    tags: Array.isArray(record.tags) ? (record.tags as unknown[]) .filter((t): t is string => typeof t === "string") : [],
  };
  const description = optionalString(record, "description");
  if (description !== undefined) base.description = description;
  const language = optionalString(record, "language");
  if (language !== undefined) base.language = language;
  const normalized = normalizeSnippetInput(base);
  const now = new Date().toISOString();
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : randomId();
  const snippet: Snippet = {
    id,
    title: normalized.title,
    content: normalized.content,
    tags: normalized.tags,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : now,
    useCount: typeof record.useCount === "number" && Number.isFinite(record.useCount)
      ? Math.max(0, Math.trunc(record.useCount))
      : 0,
  };
  if (normalized.description !== undefined) snippet.description = normalized.description;
  if (normalized.language !== undefined) snippet.language = normalized.language;
  if (typeof record.lastUsedAt === "string") snippet.lastUsedAt = record.lastUsedAt;
  return snippet;
}

export function parseBundle(text: string, format: TransferFormat): Snippet[] {
  let parsed: unknown;
  try {
    parsed = format === "yaml" ? parseYaml(text) : JSON.parse(text);
  } catch (err) {
    throw new StoreError(`Invalid ${format.toUpperCase()} input: ${(err as Error).message}`, "invalid");
  }
  let entries: unknown[];
  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as ExportBundle).snippets)) {
    entries = (parsed as ExportBundle).snippets;
  } else {
    throw new StoreError(
      'Invalid input: expected an array of snippets or {"snippets":[...]}, or a file produced by "deugal export"',
      "invalid",
    );
  }
  return entries.map(normalizeEntry);
}
