import { StoreError } from "./errors.js";
import { normalizeSnippetInput } from "./store.js";
import { randomId } from "./id.js";
import type { StoreData, Snippet } from "./types.js";

export const CURRENT_SCHEMA = 1;

export interface MigrationReport {
  fromVersion: number;
  toVersion: number;
  snippets: Snippet[];
  repairs: string[];
  changed: boolean;
}

function asRecord(value: unknown, index: number): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StoreError(`Cannot migrate: snippet at index ${index} is not an object`, "invalid");
  }
  return value as Record<string, unknown>;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function migrateStore(raw: unknown, now: string = new Date().toISOString()): MigrationReport {
  const repairs: string[] = [];
  if (typeof raw !== "object" || raw === null) {
    throw new StoreError("Cannot migrate: the store is not a JSON object", "invalid");
  }
  const record = raw as Record<string, unknown>;
  const fromVersion = typeof record.version === "number" ? record.version : 0;
  let entries: unknown[];
  if (Array.isArray(record.snippets)) {
    entries = record.snippets;
  } else if (Array.isArray(raw)) {
    entries = raw as unknown[];
    repairs.push("the store was a bare array of snippets");
  } else {
    throw new StoreError('Cannot migrate: expected {"snippets": [...]}', "invalid");
  }
  if (fromVersion > CURRENT_SCHEMA) {
    throw new StoreError(
      `Cannot migrate: this store was written by a newer version (schema ${fromVersion}, this build supports ${CURRENT_SCHEMA}). Update deugal.`,
      "invalid",
    );
  }
  const seenIds = new Set<string>();
  const snippets: Snippet[] = entries.map((entry, index) => {
    const item = asRecord(entry, index);
    const title = typeof item.title === "string" ? item.title : "";
    const content = typeof item.content === "string" ? item.content : "";
    if (!title.trim() || !content.trim()) {
      throw new StoreError(`Cannot migrate: snippet at index ${index} has no title or no content`, "invalid");
    }
    const tagsRaw = item.tags;
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw.filter((t): t is string => typeof t === "string")
      : typeof tagsRaw === "string"
        ? tagsRaw.split(/[\s,]+/)
        : [];
    if (!Array.isArray(tagsRaw) && tagsRaw !== undefined) {
      repairs.push(`snippet ${index}: tags were not an array and were converted`);
    }
    const input: { title: string; content: string; tags: string[]; language?: string; description?: string } = {
      title,
      content,
      tags,
    };
    if (typeof item.language === "string" && item.language.trim()) input.language = item.language;
    if (typeof item.description === "string") input.description = item.description;
    const normalized = normalizeSnippetInput(input);

    let id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : "";
    if (!id) {
      id = randomId();
      repairs.push(`snippet ${index}: missing id, one was generated`);
    } else if (seenIds.has(id)) {
      const previous = id;
      id = randomId();
      repairs.push(`snippet ${index}: duplicated id "${previous}", a new id was generated`);
    }
    seenIds.add(id);

    const createdAt = typeof item.createdAt === "string" && !Number.isNaN(Date.parse(item.createdAt))
      ? item.createdAt
      : now;
    const updatedAt = typeof item.updatedAt === "string" && !Number.isNaN(Date.parse(item.updatedAt))
      ? item.updatedAt
      : createdAt;
    if (!(typeof item.createdAt === "string" && !Number.isNaN(Date.parse(item.createdAt)))) {
      repairs.push(`snippet ${index}: invalid creation date, replaced by the migration date`);
    }
    const useCount = typeof item.useCount === "number" && Number.isFinite(item.useCount) && item.useCount >= 0
      ? Math.trunc(item.useCount)
      : 0;

    const snippet: Snippet = {
      id,
      title: normalized.title,
      content: normalized.content,
      tags: normalized.tags,
      createdAt,
      updatedAt,
      useCount,
    };
    if (normalized.description !== undefined) snippet.description = normalized.description;
    if (normalized.language !== undefined) snippet.language = normalized.language;
    if (typeof item.lastUsedAt === "string" && !Number.isNaN(Date.parse(item.lastUsedAt))) {
      snippet.lastUsedAt = item.lastUsedAt;
    }
    if (item.pinned === true) snippet.pinned = true;
    return snippet;
  });
  return {
    fromVersion,
    toVersion: CURRENT_SCHEMA,
    snippets,
    repairs,
    changed: fromVersion !== CURRENT_SCHEMA || repairs.some((r) => !r.startsWith("snippet") || r.includes("generated") || r.includes("converted")),
  };
}

export function toStoreData(snippets: Snippet[]): StoreData {
  return { version: CURRENT_SCHEMA, snippets };
}
