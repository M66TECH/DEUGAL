import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Command, CommanderError, Option } from "commander";
import { ensureDataDir, loadConfig } from "./core/config.js";
import { errorMessage, StoreError } from "./core/errors.js";
import { copyToClipboard } from "./core/clipboard.js";
import { editInEditor } from "./core/editor.js";
import { search } from "./core/search.js";
import { SnippetStore } from "./core/store.js";
import { inferFormat, parseBundle, serializeBundle, TRANSFER_VERSION } from "./core/transfer.js";
import type { ExportBundle, NewSnippet, SortMode } from "./core/types.js";
import { dim } from "./ui/color.js";
import {
  printError,
  printInfoLine,
  printList,
  printShow,
  printSuccess,
  printTags,
} from "./ui/output.js";
import { setColorEnabled } from "./ui/color.js";

type PkgInfo = { version: string };
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as PkgInfo;

export function parseTags(raw: string[] | undefined): string[] {
  const out: string[] = [];
  for (const entry of raw ?? []) {
    for (const piece of entry.split(",")) {
      const tag = piece.trim().toLowerCase();
      if (tag && !out.includes(tag)) out.push(tag);
    }
  }
  return out;
}

async function readStdin(graceMs = 250, maxMs = 5000): Promise<string> {
  const stdin = process.stdin;
  if (stdin.readableEnded) return "";
  return await new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    let done = false;
    let graceTimer: NodeJS.Timeout | undefined;
    let maxTimer: NodeJS.Timeout | undefined;
    const finish = (): void => {
      if (done) return;
      done = true;
      if (graceTimer !== undefined) clearTimeout(graceTimer);
      if (maxTimer !== undefined) clearTimeout(maxTimer);
      stdin.off("data", onData);
      stdin.off("end", finish);
      stdin.off("error", finish);
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const onData = (chunk: Buffer | string): void => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
      if (graceTimer !== undefined) {
        clearTimeout(graceTimer);
        graceTimer = undefined;
      }
    };
    try {
      stdin.on("data", onData);
      stdin.on("end", finish);
      stdin.on("error", finish);
      graceTimer = setTimeout(finish, graceMs);
      maxTimer = setTimeout(finish, maxMs);
    } catch {
      finish();
    }
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const real = fsSync.realpathSync(entry);
    return import.meta.url === pathToFileURL(real).href || import.meta.url === pathToFileURL(entry).href;
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

export interface MainDeps {
  store?: SnippetStore;
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function buildProgram(deps: MainDeps): Command {
  const program = new Command();
  program
    .name("deugal")
    .description(
      "Local-first snippet manager for the terminal. Store, search and reuse code snippets without leaving your shell.",
    )
    .version(pkg.version, "-V, --version", "output the version number")
    .option("--no-color", "disable colored output (also honors NO_COLOR)")
    .showHelpAfterError('(run "deugal --help" for usage)')
    .showSuggestionAfterError()
    .exitOverride();

  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts() as { color?: boolean };
    setColorEnabled(opts.color !== false);
  });

  const getStore = (): SnippetStore => {
    if (deps.store) return deps.store;
    const config = loadConfig();
    ensureDataDir(config);
    return new SnippetStore(config.storeFile);
  };

  program
    .command("add <title> [content]")
    .description(
      "add a snippet. Content comes from: the [content] argument, piped stdin, or your editor with --editor",
    )
    .option("-d, --description <text>", "short description")
    .option("-l, --language <lang>", "language hint, e.g. ts, bash, sql")
    .option("-t, --tags <tags...>", "tags, comma or space separated")
    .option("-e, --editor", "write the content in your editor ($EDITOR)")
    .option("--json", "print the created snippet as JSON")
    .action(
      async (
        title: string,
        content: string | undefined,
        options: {
          description?: string;
          language?: string;
          tags?: string[];
          editor?: boolean;
          json?: boolean;
        },
      ) => {
        const store = getStore();
        let body = content ?? "";
        if (options.editor) {
          body = editInEditor(body);
        } else if (!body && !process.stdin.isTTY) {
          body = await readStdin();
        }
        if (!body.trim()) {
          throw new StoreError(
            "Snippet content is empty. Pass it as an argument, pipe it (echo ... | deugal add ...), or use --editor.",
            "invalid",
          );
        }
        const input: NewSnippet = {
          title,
          content: body.replace(/\r?\n$/, ""),
          tags: parseTags(options.tags),
        };
        if (options.description !== undefined) input.description = options.description;
        if (options.language !== undefined) input.language = options.language;
        const snippet = store.add(input);
        if (options.json) {
          writeJson(snippet);
        } else {
          printSuccess(`Added ${snippet.id}  ${snippet.title}`);
          printInfoLine(`show it: deugal show ${snippet.id}`);
        }
      },
    );

  program
    .command("list")
    .alias("ls")
    .description("list snippets (most recently updated first by default)")
    .option("-t, --tag <tags...>", "filter by tags (AND), comma or space separated")
    .option("-l, --lang <lang>", "filter by language hint, e.g. ts, bash, sql")
    .addOption(
      new Option("-s, --sort <mode>", "sort order")
        .choices(["recent", "created", "used", "alpha"])
        .default("recent" as SortMode),
    )
    .option("-n, --limit <n>", "show at most n snippets", Number.parseInt)
    .option("--json", "print JSON instead of a table")
    .action(
      async (options: { tag?: string[]; lang?: string; sort: SortMode; limit?: number; json?: boolean }) => {
        const store = getStore();
        const lang = options.lang?.trim().toLowerCase();
        let items = store.list({ tags: parseTags(options.tag), sort: options.sort, limit: options.limit });
        if (lang) {
          items = items.filter((s) => s.language === lang);
        }
        if (options.json) {
          writeJson(items);
          return;
        }
        if (items.length === 0) {
          printInfoLine('No snippets yet. Add one with: deugal add "my snippet" "content"');
          return;
        }
        printList(items, options.sort);
        printInfoLine(`${items.length} snippet(s)`);
      },
    );

  program
    .command("recent [n]")
    .description("show the n most recently created snippets (default 10)")
    .option("--json", "print JSON instead of a table")
    .action(async (n: string | undefined, options: { json?: boolean }) => {
      const store = getStore();
      const limit = n !== undefined ? Number.parseInt(n, 10) : 10;
      if (Number.isNaN(limit) || limit < 0) {
        throw new StoreError(`Invalid count "${String(n)}". Use a positive number.`, "invalid");
      }
      const items = store.list({ sort: "created", limit });
      if (options.json) {
        writeJson(items);
        return;
      }
      if (items.length === 0) {
        printInfoLine('No snippets yet. Add one with: deugal add "my snippet" "content"');
        return;
      }
      printList(items, "created");
      printInfoLine(`${items.length} snippet(s), newest first`);
    });

  program
    .command("search <terms...>")
    .alias("find")
    .description("search snippets by title, tags, description, language or content (fuzzy on titles)")
    .option("-t, --tag <tags...>", "restrict search to snippets having all these tags")
    .option("--json", "print JSON instead of a table")
    .action(async (terms: string[], options: { tag?: string[]; json?: boolean }) => {
      const store = getStore();
      const candidates = store.list({ tags: parseTags(options.tag) });
      const hits = search(candidates, terms);
      if (options.json) {
        writeJson(hits);
        return;
      }
      if (hits.length === 0) {
        printInfoLine(`No snippet matches: ${terms.join(" ")}`);
        return;
      }
      printList(hits.map((h) => h.snippet), "recent");
      printInfoLine(`${hits.length} match(es)`);
    });

  program
    .command("related <id>")
    .description("list snippets that share at least one tag with the given snippet")
    .option("--json", "print JSON")
    .action(async (id: string, options: { json?: boolean }) => {
      const store = getStore();
      const related = store.related(id);
      if (options.json) {
        writeJson(related);
        return;
      }
      if (related.length === 0) {
        printInfoLine(`No snippet shares a tag with "${id}".`);
        return;
      }
      printList(related.map((r) => r.snippet), "recent");
      for (const { snippet, shared } of related) {
        printInfoLine(`  ${snippet.id}: ${shared.join(", ")}`);
      }
      printInfoLine(`${related.length} related snippet(s)`);
    });

  program
    .command("pin <id>")
    .description("pin a snippet so it always appears first in lists")
    .action(async (id: string) => {
      const store = getStore();
      const updated = store.setPinned(id, true);
      printSuccess(`Pinned ${updated.id}  ${updated.title}`);
    });

  program
    .command("unpin <id>")
    .description("remove the pin from a snippet")
    .action(async (id: string) => {
      const store = getStore();
      const updated = store.setPinned(id, false);
      printSuccess(`Unpinned ${updated.id}  ${updated.title}`);
    });

  program
    .command("show <id>")
    .description("show a snippet's metadata and content (ids are prefix-matchable)")
    .option("--json", "print JSON")
    .action(async (id: string, options: { json?: boolean }) => {
      const store = getStore();
      const snippet = store.resolve(id);
      if (options.json) {
        writeJson(snippet);
        return;
      }
      printShow(snippet);
    });

  program
    .command("use <id>")
    .description("print a snippet's raw content (pipe-friendly) and bump its usage counter")
    .option("-c, --copy", "also copy the content to the clipboard")
    .option("--no-track", "do not increment the usage counter")
    .action(async (id: string, options: { copy?: boolean; track?: boolean }) => {
      const store = getStore();
      const snippet = store.resolve(id);
      const content = options.track === false ? snippet.content : store.markUsed(snippet.id).content;
      process.stdout.write(content);
      if (!content.endsWith("\n")) process.stdout.write("\n");
      if (options.copy) {
        copyToClipboard(content);
        printInfoLine("Copied to clipboard.");
      }
    });

  program
    .command("rm <ids...>")
    .description("delete one or more snippets (requires --force)")
    .option("-f, --force", "actually delete, no prompt")
    .action(async (ids: string[], options: { force?: boolean }) => {
      if (!options.force) {
        throw new StoreError("Refusing to delete without --force. Re-run with: deugal rm <id> --force", "invalid");
      }
      const store = getStore();
      let deleted = 0;
      const errors: string[] = [];
      for (const id of ids) {
        try {
          const snippet = store.resolve(id);
          store.delete(snippet.id);
          deleted += 1;
          printSuccess(`Deleted ${snippet.id}  ${snippet.title}`);
        } catch (err) {
          errors.push(`${id}: ${errorMessage(err)}`);
        }
      }
      if (errors.length > 0) {
        throw new StoreError(
          `Deleted ${deleted} of ${ids.length}. Failures:\n${errors.map((e) => `  ${e}`).join("\n")}`,
          "not-found",
        );
      }
      printInfoLine(`${deleted} snippet(s) deleted`);
    });

  program
    .command("edit <id>")
    .description("open a snippet's content in your editor and save changes back")
    .option("-e, --editor <name>", "editor to use (defaults to $EDITOR, notepad or vi)")
    .action(async (id: string, options: { editor?: string }) => {
      const store = getStore();
      const snippet = store.resolve(id);
      const edited = editInEditor(snippet.content, options.editor);
      if (edited.trim() === snippet.content.trim() || !edited.trim()) {
        printInfoLine("No changes.");
        return;
      }
      const updated = store.update(snippet.id, { content: edited.replace(/\r?\n$/, "") });
      printSuccess(`Updated ${updated.id}  ${updated.title}`);
    });

  const tag = program.command("tag").description("add or remove tags on a snippet");
  tag
    .command("add <id> <tags...>")
    .description("tag a snippet")
    .action(async (id: string, tags: string[]) => {
      const store = getStore();
      const snippet = store.resolve(id);
      const merged = parseTags([...snippet.tags, ...tags]);
      const updated = store.update(snippet.id, { tags: merged });
      printSuccess(`${updated.id}: ${updated.tags.join(", ") || "(no tags)"}`);
    });
  tag
    .command("rm <id> <tags...>")
    .description("remove tags from a snippet")
    .action(async (id: string, tags: string[]) => {
      const store = getStore();
      const snippet = store.resolve(id);
      const removals = parseTags(tags);
      const remaining = snippet.tags.filter((t) => !removals.includes(t));
      const updated = store.update(snippet.id, { tags: remaining });
      printSuccess(`${updated.id}: ${updated.tags.join(", ") || "(no tags)"}`);
    });

  program
    .command("tags")
    .description("list all tags with usage counts")
    .option("--json", "print JSON")
    .action(async (options: { json?: boolean }) => {
      const store = getStore();
      const counts = store.tagCounts();
      if (options.json) {
        writeJson(counts);
        return;
      }
      if (counts.length === 0) {
        printInfoLine("No tags yet. Tag snippets with: deugal tag add <id> <tags...>");
        return;
      }
      printTags(counts);
    });

  program
    .command("export <file>")
    .description("export all snippets to a JSON or YAML file, or to stdout with -")
    .addOption(
      new Option("-f, --format <format>", "output format (default: inferred from file extension)")
        .choices(["json", "yaml"]),
    )
    .action(async (file: string, options: { format?: "json" | "yaml" }) => {
      const store = getStore();
      const format = options.format ?? inferFormat(file);
      const bundle: ExportBundle = { deugal: TRANSFER_VERSION, exportedAt: new Date().toISOString(), snippets: store.all() };
      if (file === "-") {
        process.stdout.write(serializeBundle(bundle, format));
        return;
      }
      mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      writeFileSync(file, serializeBundle(bundle, format), "utf8");
      printSuccess(`Exported ${bundle.snippets.length} snippet(s) to ${file} (${format})`);
    });

  program
    .command("import <file>")
    .description("import snippets from a JSON or YAML file, or from stdin with -")
    .option("--overwrite", "replace existing snippets that have the same id")
    .addOption(
      new Option("-f, --format <format>", "input format (default: inferred from file extension)")
        .choices(["json", "yaml"]),
    )
    .action(async (file: string, options: { overwrite?: boolean; format?: "json" | "yaml" }) => {
      const store = getStore();
      const format = options.format ?? inferFormat(file);
      const text = file === "-" ? await readStdin() : readFileSync(file, "utf8");
      const incoming = parseBundle(text, format);
      let added = 0;
      let replaced = 0;
      let skipped = 0;
      const skippedIds: string[] = [];
      for (const snippet of incoming) {
        if (!store.byId(snippet.id)) {
          store.upsert(snippet);
          added += 1;
        } else if (options.overwrite) {
          store.upsert(snippet);
          replaced += 1;
        } else {
          skipped += 1;
          skippedIds.push(snippet.id);
        }
      }
      printSuccess(`Imported from ${file}: ${added} added, ${replaced} replaced, ${skipped} skipped`);
      for (const id of skippedIds) {
        printInfoLine(`  skipped existing id: ${id} (use --overwrite to replace)`);
      }
    });

  program
    .command("recover")
    .description("list the rotating backups of the store, or restore one with --from")
    .option("--from <n>", "restore from backup number n (1 = most recent)", Number.parseInt)
    .action(async (options: { from?: number }) => {
      const store = getStore();
      if (options.from !== undefined) {
        const restored = store.restoreBackup(options.from);
        printSuccess(`Restored ${store.file} from ${restored}`);
        printInfoLine("The previous state was kept as .pre-recover");
        return;
      }
      const backups = store.backupFiles();
      if (backups.length === 0) {
        printInfoLine("No backups yet. They appear after the first modifications of the store.");
        return;
      }
      for (const b of backups) {
        process.stdout.write(
          `${dim(`bak${b.index}`)}  ${String(Math.round(b.sizeBytes / 1024)).padStart(5)} KB  ${b.modifiedAt.toISOString().slice(0, 19).replace("T", " ")}\n`,
        );
      }
      printInfoLine("Restore with: deugal recover --from <n>");
    });

  program
    .command("stats")
    .description("quick stats about your snippet collection")
    .option("--json", "print JSON")
    .action(async (options: { json?: boolean }) => {
      const store = getStore();
      const all = store.all();
      const stats = {
        count: all.length,
        tags: store.tagCounts().length,
        topUsed: [...all].sort((a, b) => b.useCount - a.useCount).slice(0, 5),
        newest: [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
      };
      if (options.json) {
        writeJson({ ...stats, storeFile: store.file });
        return;
      }
      process.stdout.write(`snippets: ${stats.count}\ntags:     ${stats.tags}\n`);
      if (stats.topUsed.length > 0 && stats.topUsed.some((s) => s.useCount > 0)) {
        process.stdout.write("top used:\n");
        for (const s of stats.topUsed.filter((s) => s.useCount > 0).slice(0, 5)) {
          process.stdout.write(`  ${s.id}  ${s.title.padEnd(36)} ${s.useCount} use(s)\n`);
        }
      }
      if (all.length > 0) {
        const newest = stats.newest[0]!;
        printInfoLine(`store: ${store.file}`);
        printInfoLine(`newest: ${newest.id}  ${newest.title}`);
      }
    });

  program
    .command("config")
    .description("show where deugal stores your data")
    .action(async () => {
      const config = loadConfig();
      const store = getStore();
      process.stdout.write(`data dir: ${config.dataDir}\nstore file: ${store.file}\n`);
    });

  return program;
}

export async function main(argv: string[], deps: MainDeps = {}): Promise<number> {
  const program = buildProgram(deps);
  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) {
      return err.exitCode;
    }
    printError(errorMessage(err));
    return 1;
  }
}

export function runCli(argv: string[]): void {
  main(argv)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      printError(errorMessage(err));
      process.exitCode = 1;
    });
}

if (isMainModule()) {
  runCli(process.argv.slice(2));
}
