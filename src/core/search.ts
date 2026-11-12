import { errorMessage, StoreError } from "./errors.js";
import type { Snippet } from "./types.js";

export interface SearchHit {
  snippet: Snippet;
  score: number;
  where: string[];
}

interface Weights {
  idExact: number;
  title: number;
  tagExact: number;
  tagPartial: number;
  tagFuzzy: number;
  description: number;
  language: number;
  content: number;
  titleFuzzy: number;
}

const WEIGHTS: Weights = {
  idExact: 100,
  title: 50,
  tagExact: 40,
  tagPartial: 20,
  tagFuzzy: 6,
  description: 15,
  language: 10,
  content: 5,
  titleFuzzy: 8,
};

export function isSubsequence(needle: string, haystack: string): boolean {
  if (needle.length === 0) return false;
  if (needle.length > haystack.length) return false;
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) {
      index += 1;
      if (index === needle.length) return true;
    }
  }
  return false;
}

function matchTerm(snippet: Snippet, term: string, caseSensitive = false): string[] {
  const where: string[] = [];
  const norm = (value: string): string => (caseSensitive ? value : value.toLowerCase());
  const needle = caseSensitive ? term : term;
  if (snippet.id === needle) where.push("id");
  if (norm(snippet.title).includes(needle)) where.push("title");
  for (const tag of snippet.tags) {
    if (norm(tag) === needle) {
      where.push("tag");
      break;
    }
    if (norm(tag).includes(needle)) {
      if (!where.includes("tag")) where.push("tag-partial");
    } else if (term.length >= 3 && isSubsequence(needle, norm(tag))) {
      if (!where.includes("tag-fuzzy")) where.push("tag-fuzzy");
    }
  }
  if (snippet.description !== undefined && norm(snippet.description).includes(needle)) where.push("description");
  if (snippet.language !== undefined && norm(snippet.language).includes(needle)) where.push("language");
  if (norm(snippet.content).includes(needle)) where.push("content");
  if (where.length === 0 && term.length >= 3 && isSubsequence(needle, norm(snippet.title))) {
    where.push("title-fuzzy");
  }
  return where;
}

function scoreWhere(where: string[]): number {
  let score = 0;
  for (const w of where) {
    switch (w) {
      case "id":
        score += WEIGHTS.idExact;
        break;
      case "title":
        score += WEIGHTS.title;
        break;
      case "tag":
        score += WEIGHTS.tagExact;
        break;
      case "tag-partial":
        score += WEIGHTS.tagPartial;
        break;
      case "tag-fuzzy":
        score += WEIGHTS.tagFuzzy;
        break;
      case "description":
        score += WEIGHTS.description;
        break;
      case "language":
        score += WEIGHTS.language;
        break;
      case "content":
        score += WEIGHTS.content;
        break;
      case "title-fuzzy":
        score += WEIGHTS.titleFuzzy;
        break;
    }
  }
  return score;
}

export interface SearchOptions {
  regex?: boolean;
  ignoreCase?: boolean;
}

function compilePatterns(terms: string[], options: SearchOptions): RegExp[] | undefined {
  if (!options.regex) return undefined;
  const flags = options.ignoreCase === false ? "g" : "gi";
  return terms.map((term) => {
    try {
      return new RegExp(term, flags);
    } catch (err) {
      throw new StoreError(
        `Invalid regular expression "${term}": ${errorMessage(err)}`,
        "invalid",
      );
    }
  });
}

function regexHits(snippet: Snippet, patterns: RegExp[]): string[] {
  const where: string[] = [];
  const fields: Array<[string, string | undefined]> = [
    ["title", snippet.title],
    ["description", snippet.description],
    ["language", snippet.language],
    ["content", snippet.content],
    ["tags", snippet.tags.join(" ")],
  ];
  let allMatched = true;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let matchedAnywhere = false;
    for (const [name, value] of fields) {
      if (value === undefined) continue;
      pattern.lastIndex = 0;
      if (pattern.test(value)) {
        matchedAnywhere = true;
        if (!where.includes(name)) where.push(name);
      }
    }
    if (!matchedAnywhere) {
      allMatched = false;
      break;
    }
  }
  return allMatched ? where : [];
}

function searchRegex(snippets: Snippet[], patterns: RegExp[]): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const snippet of snippets) {
    const where = regexHits(snippet, patterns);
    if (where.length === 0) continue;
    hits.push({ snippet, score: scoreWhere(where.map(regexFieldToWeight)), where });
  }
  return hits.sort(
    (a, b) =>
      b.score - a.score ||
      b.snippet.updatedAt.localeCompare(a.snippet.updatedAt) ||
      a.snippet.title.localeCompare(b.snippet.title),
  );
}

function regexFieldToWeight(field: string): string {
  if (field === "tags") return "tag";
  return field;
}

export function search(snippets: Snippet[], terms: string[], options: SearchOptions = {}): SearchHit[] {
  const patterns = compilePatterns(terms, options);
  if (patterns !== undefined) return searchRegex(snippets, patterns);
  const caseSensitive = options.ignoreCase === false;
  const cleaned = terms
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const normalized = caseSensitive ? cleaned : cleaned.map((t) => t.toLowerCase());
  if (normalized.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const snippet of snippets) {
    const allWhere: string[] = [];
    let matchedAll = true;
    for (const term of normalized) {
      const where = matchTerm(snippet, term, caseSensitive);
      if (where.length === 0) {
        matchedAll = false;
        break;
      }
      for (const w of where) {
        if (!allWhere.includes(w)) allWhere.push(w);
      }
    }
    if (matchedAll) {
      hits.push({ snippet, score: scoreWhere(allWhere), where: allWhere });
    }
  }
  return hits.sort(
    (a, b) =>
      b.score - a.score ||
      b.snippet.updatedAt.localeCompare(a.snippet.updatedAt) ||
      a.snippet.title.localeCompare(b.snippet.title),
  );
}
