import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomId } from "./id.js";
import { errorMessage, StoreError } from "./errors.js";
import type {
  ListOptions,
  NewSnippet,
  Snippet,
  SnippetPatch,
  SortMode,
  StoreData,
} from "./types.js";

const DATA_VERSION = 1;

export { StoreError } from "./errors.js";

function isSnippetLike(value: unknown): value is Snippet {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return typeof s.id === "string" && typeof s.title === "string" && typeof s.content === "string";
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const clean = t.trim().toLowerCase();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

export function normalizeSnippetInput(input: NewSnippet): NewSnippet {
  const title = input.title.trim();
  if (!title) throw new StoreError("Snippet title cannot be empty", "invalid");
  if (!input.content.trim()) throw new StoreError("Snippet content cannot be empty", "invalid");
  const normalized: NewSnippet = {
    title,
    content: input.content,
    tags: normalizeTags(input.tags),
  };
  if (input.description !== undefined) normalized.description = input.description;
  if (input.language !== undefined && input.language.trim()) {
    normalized.language = input.language.trim().toLowerCase();
  }
  return normalized;
}

function compareByMode(a: Snippet, b: Snippet, mode: SortMode): number {
  const pinDiff = Number(b.pinned === true) - Number(a.pinned === true);
  if (pinDiff !== 0) return pinDiff;
  switch (mode) {
    case "alpha":
      return a.title.localeCompare(b.title);
    case "used":
      return b.useCount - a.useCount || a.title.localeCompare(b.title);
    case "created":
      return b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title);
    case "recent":
    default:
      return b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title);
  }
}

export class SnippetStore {
  readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  private load(): StoreData {
    if (!existsSync(this.file)) return { version: DATA_VERSION, snippets: [] };
    let text: string;
    try {
      text = readFileSync(this.file, "utf8");
    } catch (err) {
      throw new StoreError(
        `Cannot read store file ${this.file}: ${errorMessage(err)}`,
        "io",
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new StoreError(
        `Store file ${this.file} is not valid JSON. Fix or remove it, or set DEUGAL_HOME to another location.`,
        "invalid",
      );
    }
    if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as StoreData).snippets)) {
      throw new StoreError(
        `Store file ${this.file} has an unexpected shape (expected {"version":1,"snippets":[...]})`,
        "invalid",
      );
    }
    const snippets = (parsed as StoreData).snippets;
    snippets.forEach((item, index) => {
      if (!isSnippetLike(item)) {
        throw new StoreError(
          `Store file ${this.file} contains an invalid snippet at index ${index}`,
          "invalid",
        );
      }
    });
    return { version: DATA_VERSION, snippets };
  }

  private save(data: StoreData): void {
    const dir = path.dirname(this.file);
    const tmp = `${this.file}.${process.pid}.${randomId(6)}.tmp`;
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      renameSync(tmp, this.file);
    } catch (err) {
      throw new StoreError(
        `Cannot write store file ${this.file}: ${errorMessage(err)}`,
        "io",
      );
    }
  }

  all(): Snippet[] {
    return this.load().snippets;
  }

  size(): number {
    return this.load().snippets.length;
  }

  byId(id: string): Snippet | undefined {
    return this.load().snippets.find((s) => s.id === id);
  }

  resolve(idOrPrefix: string): Snippet {
    const id = idOrPrefix.trim();
    if (!id) throw new StoreError("Empty snippet id", "invalid");
    const all = this.load().snippets;
    const exact = all.find((s) => s.id === id);
    if (exact) return exact;
    const matches = all.filter((s) => s.id.startsWith(id));
    if (matches.length === 0) {
      throw new StoreError(`No snippet matches id "${id}". Run "deugal list" to see ids.`, "not-found");
    }
    if (matches.length > 1) {
      const lines = matches.map((m) => `  ${m.id}  ${m.title}`).join("\n");
      throw new StoreError(
        `Ambiguous id "${id}" matches ${matches.length} snippets:\n${lines}`,
        "ambiguous",
      );
    }
    return matches[0]!;
  }

  add(input: NewSnippet): Snippet {
    const data = this.load();
    const normalized = normalizeSnippetInput(input);
    const now = new Date().toISOString();
    let id = randomId();
    while (data.snippets.some((s) => s.id === id)) {
      id = randomId();
    }
    const snippet: Snippet = {
      id,
      title: normalized.title,
      content: normalized.content,
      tags: normalized.tags,
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    };
    if (normalized.description !== undefined) snippet.description = normalized.description;
    if (normalized.language !== undefined) snippet.language = normalized.language;
    data.snippets.push(snippet);
    this.save(data);
    return snippet;
  }

  upsert(snippet: Snippet): "added" | "replaced" {
    const data = this.load();
    if (!isSnippetLike(snippet)) {
      throw new StoreError("Cannot upsert an invalid snippet", "invalid");
    }
    const index = data.snippets.findIndex((s) => s.id === snippet.id);
    if (index >= 0) {
      data.snippets[index] = snippet;
      this.save(data);
      return "replaced";
    }
    data.snippets.push(snippet);
    this.save(data);
    return "added";
  }

  update(id: string, patch: SnippetPatch): Snippet {
    const data = this.load();
    const index = data.snippets.findIndex((s) => s.id === id);
    if (index < 0) {
      throw new StoreError(`No snippet with id "${id}"`, "not-found");
    }
    const current = data.snippets[index]!;
    const next: Snippet = { ...current };
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) throw new StoreError("Snippet title cannot be empty", "invalid");
      next.title = title;
    }
    if (patch.content !== undefined) {
      if (!patch.content.trim()) throw new StoreError("Snippet content cannot be empty", "invalid");
      next.content = patch.content;
    }
    if (patch.description !== undefined) {
      if (patch.description === "") delete next.description;
      else next.description = patch.description;
    }
    if (patch.language !== undefined) {
      if (patch.language.trim() === "") delete next.language;
      else next.language = patch.language.trim().toLowerCase();
    }
    if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
    next.updatedAt = new Date().toISOString();
    data.snippets[index] = next;
    this.save(data);
    return next;
  }

  markUsed(id: string): Snippet {
    const data = this.load();
    const index = data.snippets.findIndex((s) => s.id === id);
    if (index < 0) {
      throw new StoreError(`No snippet with id "${id}"`, "not-found");
    }
    const current = data.snippets[index]!;
    const next: Snippet = {
      ...current,
      useCount: current.useCount + 1,
      lastUsedAt: new Date().toISOString(),
    };
    data.snippets[index] = next;
    this.save(data);
    return next;
  }

  delete(id: string): boolean {
    const data = this.load();
    const before = data.snippets.length;
    data.snippets = data.snippets.filter((s) => s.id !== id);
    if (data.snippets.length === before) return false;
    this.save(data);
    return true;
  }

  list(options: ListOptions = {}): Snippet[] {
    let items = this.load().snippets;
    if (options.tags && options.tags.length > 0) {
      items = items.filter((s) => options.tags!.every((t) => s.tags.includes(t)));
    }
    items = [...items].sort((a, b) => compareByMode(a, b, options.sort ?? "recent"));
    if (options.limit !== undefined) {
      const limit = Math.max(0, Math.trunc(options.limit));
      items = items.slice(0, limit);
    }
    return items;
  }

  setPinned(idOrPrefix: string, pinned: boolean): Snippet {
    const data = this.load();
    const index = data.snippets.findIndex((s) => s.id === idOrPrefix);
    if (index < 0) {
      throw new StoreError(`No snippet with id "${idOrPrefix}"`, "not-found");
    }
    const current = data.snippets[index]!;
    const next: Snippet = { ...current };
    if (pinned) next.pinned = true;
    else delete next.pinned;
    data.snippets[index] = next;
    this.save(data);
    return next;
  }

  related(idOrPrefix: string): Array<{ snippet: Snippet; shared: string[] }> {
    const base = this.resolve(idOrPrefix);
    const result: Array<{ snippet: Snippet; shared: string[] }> = [];
    for (const snippet of this.load().snippets) {
      if (snippet.id === base.id) continue;
      const shared = snippet.tags.filter((t) => base.tags.includes(t));
      if (shared.length > 0) result.push({ snippet, shared });
    }
    return result.sort(
      (a, b) =>
        b.shared.length - a.shared.length ||
        b.snippet.updatedAt.localeCompare(a.snippet.updatedAt) ||
        a.snippet.title.localeCompare(b.snippet.title),
    );
  }

  tagCounts(): Array<{ tag: string; count: number }> {
    const counts = new Map<string, number>();
    for (const s of this.load().snippets) {
      for (const t of s.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }
}
