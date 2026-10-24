import pc from "picocolors";
import type { Snippet, SortMode } from "../core/types.js";

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 3) return text.slice(0, max);
  return `${text.slice(0, max - 3)}...`;
}

export function fmtDate(iso: string | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "?";
  return iso.slice(0, 10);
}

export interface ListColumn {
  id: number;
  title: number;
  tags: number;
  lang: number;
  uses: number;
}

function computeWidths(items: Snippet[]): ListColumn {
  const widths: ListColumn = { id: 2, title: 5, tags: 4, lang: 4, uses: 4 };
  for (const s of items) {
    widths.id = Math.max(widths.id, s.id.length);
    widths.title = Math.min(42, Math.max(widths.title, s.title.length));
    widths.tags = Math.min(26, Math.max(widths.tags, s.tags.join(",").length));
    widths.lang = Math.min(10, Math.max(widths.lang, (s.language ?? "").length));
  }
  return widths;
}

export function printList(items: Snippet[], sort: SortMode): void {
  const widths = computeWidths(items);
  const header =
    `${pc.dim("id".padEnd(widths.id))}  ${pc.dim("title".padEnd(widths.title))}  ` +
    `${pc.dim("tags".padEnd(widths.tags))}  ${pc.dim("lang".padEnd(widths.lang))}  ` +
    `${pc.dim("uses".padStart(widths.uses))}`;
  process.stdout.write(`${pc.dim(header)}\n`);
  for (const s of items) {
    const row =
      `${pc.dim(s.id.padEnd(widths.id))}  ${pc.cyan(truncate(s.title, widths.title).padEnd(widths.title))}  ` +
      `${pc.yellow(truncate(s.tags.join(","), widths.tags).padEnd(widths.tags))}  ` +
      `${pc.magenta((s.language ?? "").padEnd(widths.lang))}  ` +
      `${String(s.useCount).padStart(widths.uses)}`;
    process.stdout.write(`${row}\n`);
  }
}

export function printShow(snippet: Snippet): void {
  const rows: Array<[string, string]> = [
    ["id", snippet.id],
    ["title", snippet.title],
    ["tags", snippet.tags.join(", ")],
    ["lang", snippet.language ?? ""],
    ["created", fmtDate(snippet.createdAt)],
    ["updated", fmtDate(snippet.updatedAt)],
    ["uses", String(snippet.useCount)],
  ];
  if (snippet.description) rows.push(["desc", snippet.description]);
  const labelWidth = Math.max(...rows.map(([label]) => label.length)) + 1;
  for (const [label, value] of rows) {
    const valueText = label === "title" ? pc.cyan(value) : label === "tags" ? pc.yellow(value) : value;
    process.stdout.write(`${pc.dim(label.padEnd(labelWidth))}${valueText}\n`);
  }
  process.stdout.write(`${pc.dim("---")}
${snippet.content}
`);
}

export function printTags(entries: Array<{ tag: string; count: number }>): void {
  for (const { tag, count } of entries) {
    process.stdout.write(`${pc.yellow(tag.padEnd(24))}${count}\n`);
  }
}

export function printInfoLine(message: string): void {
  process.stdout.write(`${pc.dim(message)}\n`);
}

export function printSuccess(message: string): void {
  process.stdout.write(`${pc.green(message)}\n`);
}

export function printError(message: string): void {
  process.stderr.write(`${pc.red(`error: ${message}`)}\n`);
}
