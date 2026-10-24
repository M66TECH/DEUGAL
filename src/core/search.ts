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

function matchTerm(snippet: Snippet, term: string): string[] {
  const where: string[] = [];
  if (snippet.id === term) where.push("id");
  if (snippet.title.toLowerCase().includes(term)) where.push("title");
  for (const tag of snippet.tags) {
    if (tag === term) {
      where.push("tag");
      break;
    }
    if (tag.includes(term) && !where.includes("tag")) where.push("tag-partial");
  }
  if (snippet.description?.toLowerCase().includes(term)) where.push("description");
  if (snippet.language?.toLowerCase().includes(term)) where.push("language");
  if (snippet.content.toLowerCase().includes(term)) where.push("content");
  if (where.length === 0 && term.length >= 3 && isSubsequence(term, snippet.title.toLowerCase())) {
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

export function search(snippets: Snippet[], terms: string[]): SearchHit[] {
  const cleaned = terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
  if (cleaned.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const snippet of snippets) {
    const allWhere: string[] = [];
    let matchedAll = true;
    for (const term of cleaned) {
      const where = matchTerm(snippet, term);
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
