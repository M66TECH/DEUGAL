import type { Snippet } from "./types.js";

export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const deletion = previous[j]! + 1;
      const insertion = current[j - 1]! + 1;
      const substitution = previous[j - 1]! + cost;
      current[j] = Math.min(deletion, insertion, substitution);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length]!;
}

export function similarity(a: string, b: string): number {
  const left = normalizeForComparison(a);
  const right = normalizeForComparison(b);
  if (left.length === 0 && right.length === 0) return 1;
  if (left.length === 0 || right.length === 0) return 0;
  if (left === right) return 1;
  const longest = Math.max(left.length, right.length);
  if (longest > 400) {
    const shorter = left.length < right.length ? left : right;
    const longer = left.length < right.length ? right : left;
    return longer.includes(shorter) ? shorter.length / longer.length : 0;
  }
  return 1 - levenshtein(left, right) / longest;
}

export interface DuplicateGroup {
  snippets: Snippet[];
  score: number;
}

export function findSimilar(snippets: Snippet[], threshold = 0.85): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const assigned = new Set<string>();
  for (let i = 0; i < snippets.length; i++) {
    const base = snippets[i]!;
    if (assigned.has(base.id)) continue;
    const members: Snippet[] = [base];
    let worst = 1;
    for (let j = i + 1; j < snippets.length; j++) {
      const other = snippets[j]!;
      if (assigned.has(other.id)) continue;
      const score = similarity(base.content, other.content);
      if (score >= threshold) {
        members.push(other);
        assigned.add(other.id);
        worst = Math.min(worst, score);
      }
    }
    if (members.length > 1) {
      assigned.add(base.id);
      groups.push({ snippets: members, score: Number(worst.toFixed(3)) });
    }
  }
  return groups.sort((a, b) => b.score - a.score || b.snippets.length - a.snippets.length);
}
