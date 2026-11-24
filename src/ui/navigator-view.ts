import { cyan, dim, green, yellow } from "./color.js";
import { truncate } from "./output.js";
import type { NavigatorState } from "./navigator.js";

export function renderNavigator(state: NavigatorState, width = 100): string {
  const lines: string[] = [];
  const title = `deugal  ${state.filtered.length}/${state.items.length} snippet(s)`;
  lines.push(cyan("─".repeat(Math.min(width, 60))));
  lines.push(`${cyan(title)}${state.query ? `   ${yellow(`/${state.query}`)}` : ""}`);
  lines.push(cyan("─".repeat(Math.min(width, 60))));
  const titleWidth = Math.max(20, Math.min(46, width - 34));
  const { items, firstIndex } = ((): { items: typeof state.filtered; firstIndex: number } => ({
    items: state.filtered.slice(state.offset, state.offset + state.pageSize),
    firstIndex: state.offset,
  }))();
  if (items.length === 0) {
    lines.push(dim("  aucun snippet ne correspond"));
  }
  items.forEach((snippet, index) => {
    const absolute = firstIndex + index;
    const selected = absolute === state.cursor;
    const pointer = selected ? cyan(">") : " ";
    const pin = snippet.pinned ? "*" : " ";
    const id = dim(snippet.id.padEnd(9));
    const label = truncate(snippet.title, titleWidth).padEnd(titleWidth);
    const tags = snippet.tags.length > 0 ? yellow(truncate(snippet.tags.join(","), 18).padEnd(18)) : " ".repeat(18);
    const uses = String(snippet.useCount).padStart(3);
    const text = `${pointer}${pin} ${id} ${selected ? cyan(label) : label} ${tags} ${dim(uses)}`;
    lines.push(text);
  });
  lines.push(cyan("─".repeat(Math.min(width, 60))));
  const current = state.filtered[state.cursor];
  if (current) {
    const preview = current.content.split(/\r?\n/).slice(0, 3);
    for (const line of preview) {
      lines.push(dim(`  ${truncate(line, Math.max(20, width - 6))}`));
    }
  }
  lines.push("");
  if (state.message) lines.push(green(`  ${state.message}`));
  lines.push(dim("  fleches ou j/k naviguer   entree copier   u afficher   e editer   / rechercher   q quitter"));
  return `${lines.join("\n")}\n`;
}
