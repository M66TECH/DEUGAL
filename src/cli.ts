import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Command, CommanderError, Option } from "commander";
import { ensureDataDir, loadConfig } from "./core/config.js";
import { errorMessage, StoreError } from "./core/errors.js";
import {
  applyConfigPatch,
  CONFIG_KEYS,
  emptyUserConfig,
  loadUserConfig,
  saveUserConfig,
} from "./core/userconfig.js";
import type { DeugalUserConfig } from "./core/userconfig.js";
import { copyToClipboard } from "./core/clipboard.js";
import { editInEditor } from "./core/editor.js";
import { search } from "./core/search.js";
import { SnippetStore } from "./core/store.js";
import { inferFormat, parseBundle, serializeBundle, TRANSFER_VERSION } from "./core/transfer.js";
import { sinceEpoch } from "./core/period.js";
import { setRemote, status as syncStatus, sync } from "./core/sync.js";
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

const COMPLETION_SCRIPTS: Record<"bash" | "zsh" | "powershell", string> = {
  bash: `
_deugal_complete() {
  local candidates IFS=$'\\n'
  candidates=$(deugal candidates "\${COMP_WORDS[COMP_CWORD]}" 2>/dev/null)
  local words=()
  while IFS= read -r line; do
    words+=("\${line%%$'\\t'*}")
  done <<< "$candidates"
  if [ "$#" -eq 0 ]; then
    words+=("add list recent search related show use edit rm pin unpin tag tags export import recover stats config help completions")
  fi
  COMPREPLY=($(compgen -W "\${words[*]:-}" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _deugal_complete deugal
`,
  zsh: `
#compdef deugal
_deugal() {
  local -a candidates
  local line part word="\${words[CURRENT]}"
  candidates=()
  while IFS=$'\\t' read -r id label; do
    candidates+=("\${id}:\${label}")
  done < <(deugal candidates "$word" 2>/dev/null)
  if [ "$#candidates" -eq 0 ]; then
    _describe "command" candidates
    return
  fi
  _describe -t snippets "snippet" candidates
}
compdef _deugal deugal
`,
  powershell: `
Register-ArgumentCompleter -CommandName deugal -Native -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $candidates = deugal candidates $wordToComplete 2>$null
  if (-not $candidates) {
    $candidates = "add list recent search related show use edit rm pin unpin tag tags export import recover stats config help completions"
  }
  $candidates | ForEach-Object {
    $id = ($_ -split "\`t")[0]
    [System.Management.Automation.CompletionResult]::new($id, $id, 'ParameterValue', $id)
  }
}
`,
};

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
    let colorEnabled = opts.color !== false;
    if (colorEnabled) {
      try {
        const mode = loadUserConfig(loadConfig().dataDir).color;
        if (mode === "never") colorEnabled = false;
        else if (mode === "always") colorEnabled = true;
      } catch {
        /* invalid config or missing binary: fall back to auto detection */
      }
    }
    setColorEnabled(colorEnabled);
  });

  const getStore = (): SnippetStore => {
    if (deps.store) return deps.store;
    const config = loadConfig();
    ensureDataDir(config);
    return new SnippetStore(config.storeFile);
  };

  const getUserConfig = (): DeugalUserConfig => loadUserConfig(loadConfig().dataDir);

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
      new Option("-s, --sort <mode>", "sort order (default: recent, or your config sort)")
        .choices(["recent", "created", "used", "alpha"]),
    )
    .option("-n, --limit <n>", "show at most n snippets", Number.parseInt)
    .option("--since <duration>", "only snippets updated in the last Nm, Nh, Nd or Nw")
    .option("--json", "print JSON instead of a table")
    .action(
      async (options: {
        tag?: string[];
        lang?: string;
        sort?: SortMode;
        limit?: number;
        since?: string;
        json?: boolean;
      }) => {
        const store = getStore();
        const userConfig = getUserConfig();
        const lang = options.lang?.trim().toLowerCase();
        let items = store.list({
          tags: parseTags(options.tag),
          sort: options.sort ?? userConfig.sort ?? "recent",
          limit: options.limit ?? userConfig.limit,
          updatedSince: options.since !== undefined ? sinceEpoch(options.since) : undefined,
        });
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
        printList(items, options.sort ?? userConfig.sort ?? "recent");
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

  const COMMAND_NAMES = [
    "add", "list", "recent", "search", "related", "show", "use", "edit", "rm",
    "pin", "unpin", "tag", "tags", "export", "import", "recover", "stats", "config",
    "help",
  ];

  const candidatesCmd = new Command("candidates")
    .argument("[partial]")
    .description("print completion candidates: command names and matching snippet ids")
    .action(async (partial: string | undefined) => {
      const store = getStore();
      const prefix = (partial ?? "").trim().toLowerCase();
      const lines: string[] = [];
      if (prefix.length === 0) {
        for (const name of COMMAND_NAMES) lines.push(`${name}\t${name}`);
      } else {
        for (const snippet of store.all()) {
          const idMatch = snippet.id.startsWith(prefix);
          const titleLower = snippet.title.toLowerCase();
          const titleMatch = titleLower.includes(prefix) && prefix.length >= 2;
          if (!idMatch && !titleMatch) continue;
          const label = snippet.title.replace(/\s+/g, " ").slice(0, 60);
          lines.push(`${snippet.id}\t${label}`);
        }
      }
      for (const line of lines.slice(0, 30)) {
        process.stdout.write(`${line}\n`);
      }
    });
  program.addCommand(candidatesCmd);

  program
    .command("completions <shell>")
    .description("print a completion script for bash, zsh or powershell")
    .action(async (shell: "bash" | "zsh" | "powershell") => {
      const script = COMPLETION_SCRIPTS[shell];
      if (!script) {
        throw new StoreError(`Unsupported shell "${String(shell)}". Use bash, zsh or powershell.`, "invalid");
      }
      process.stdout.write(`${script.trim()}\n`);
      printInfoLine(`Install it for your ${shell} session, then restart your shell.`);
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
    .option("-e, --editor <name>", "editor to use (defaults to your config editor, $EDITOR, notepad or vi)")
    .action(async (id: string, options: { editor?: string }) => {
      const store = getStore();
      const userConfig = getUserConfig();
      const snippet = store.resolve(id);
      const edited = editInEditor(snippet.content, options.editor ?? userConfig.editor);
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
    .description("export snippets to a JSON or YAML file, or to stdout with - (optionally filtered)")
    .option("-t, --tag <tags...>", "export only snippets having all these tags")
    .option("-l, --lang <lang>", "export only snippets with this language hint")
    .option("--since <duration>", "export only snippets updated in the last Nm, Nh, Nd or Nw")
    .addOption(
      new Option("-f, --format <format>", "output format (default: inferred from file extension)")
        .choices(["json", "yaml"]),
    )
    .action(async (file: string, options: {
      tag?: string[] | undefined;
      lang?: string | undefined;
      since?: string | undefined;
      format?: "json" | "yaml" | undefined;
    }) => {
      const store = getStore();
      const format = options.format ?? inferFormat(file);
      const lang = options.lang?.trim().toLowerCase();
      let snippets = store.list({
        tags: parseTags(options.tag),
        sort: "created",
        updatedSince: options.since !== undefined ? sinceEpoch(options.since) : undefined,
      });
      if (lang) snippets = snippets.filter((s) => s.language === lang);
      const bundle: ExportBundle = { deugal: TRANSFER_VERSION, exportedAt: new Date().toISOString(), snippets };
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
    .command("dedupe")
    .description("remove snippets with identical content, keeping the most used of each group")
    .option("--dry-run", "show what would be removed without saving")
    .action(async (options: { dryRun?: boolean }) => {
      const store = getStore();
      if (options.dryRun) {
        const data = store.all();
        const seen = new Map<string, number>();
        let potential = 0;
        for (const s of data) {
          const count = seen.get(s.content) ?? 0;
          seen.set(s.content, count + 1);
        }
        for (const count of seen.values()) {
          if (count > 1) potential += count - 1;
        }
        if (potential === 0) {
          printInfoLine("No duplicate content found.");
          return;
        }
        printInfoLine(`${potential} snippet(s) would be removed. Run without --dry-run to apply.`);
        return;
      }
      const result = store.dedupe();
      if (result.removed.length === 0) {
        printInfoLine("No duplicate content found.");
        return;
      }
      for (const removed of result.removed) {
        printInfoLine(`  removed: ${removed.id}  ${removed.title}`);
      }
      printSuccess(`Removed ${result.removed.length} duplicate(s). ${result.kept} snippet(s) remain.`);
    });

  program
    .command("sync")
    .description("commit your store to a local git repo (in DEUGAL_HOME) and push if a remote is set")
    .option("-m, --message <text>", "commit message (default: Sync snippets at <date>)")
    .option("--remote <url>", "set origin to this git url, then push")
    .option("--no-push", "commit locally even when a remote exists")
    .option("--status", "show sync status without changing anything")
    .action(async (options: { message?: string; remote?: string; push?: boolean; status?: boolean }) => {
      const dataDir = loadConfig().dataDir;
      if (options.status) {
        const state = syncStatus(dataDir);
        process.stdout.write(`git available: ${state.gitAvailable ? "yes" : "no"}\n`);
        process.stdout.write(`repo:          ${state.isRepo ? "yes" : "no"}\n`);
        if (state.remote !== undefined) process.stdout.write(`remote:        ${state.remote}\n`);
        if (state.lastCommit !== undefined) process.stdout.write(`last commit:   ${state.lastCommit}\n`);
        process.stdout.write(`uncommitted:   ${state.dirtyCount} file(s)\n`);
        return;
      }
      if (options.remote !== undefined) {
        setRemote(dataDir, options.remote);
        printSuccess(`Remote origin set to ${options.remote}`);
      }
      const result = sync(dataDir, {
        message: options.message,
        push: options.push !== false,
      });
      if (result.initialized) printInfoLine("Initialized a git repository in your data directory.");
      if (result.committed) printSuccess("Committed store changes.");
      else printInfoLine("Nothing to commit.");
      if (result.pushed) printSuccess("Pushed to origin.");
      else if (result.pushError !== undefined) {
        printError(`Push failed: ${result.pushError}`);
        printInfoLine("Check your remote and credentials with: deugal sync --status");
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

  const configCmd = program
    .command("config")
    .description("show or change your preferences (editor, sort, limit)")
    .option("--json", "print JSON");

  configCmd.action(async (options: { json?: boolean }) => {
    const store = getStore();
    const userConfig = getUserConfig();
    const configFilePath = path.join(loadConfig().dataDir, "config.json");
    if (options.json) {
      writeJson({ ...userConfig, path: configFilePath });
      return;
    }
    process.stdout.write(`path:    ${configFilePath}\n`);
    process.stdout.write(`store:   ${store.file}\n`);
    process.stdout.write(`editor:  ${userConfig.editor ?? "(default: $EDITOR, notepad or vi)"}\n`);
    process.stdout.write(`sort:    ${userConfig.sort ?? "(default: recent)"}\n`);
    process.stdout.write(`limit:   ${String(userConfig.limit ?? "(default: none)")}\n`);
    process.stdout.write(`color:   ${userConfig.color ?? "(default: auto)"}\n`);
    process.stdout.write(`snippets: ${store.size()}\n`);
    printInfoLine("Change with: deugal config set editor|sort|limit <value>");
    printInfoLine("Reset with: deugal config reset");
  });

  configCmd
    .command("set <key> <value>")
    .description("set a preference: editor (command name), sort (recent|created|used|alpha), limit (int >= 1)")
    .action(async (key: string, value: string) => {
      if (!CONFIG_KEYS.includes(key as never)) {
        throw new StoreError(`Unknown config key "${key}". Valid keys: ${CONFIG_KEYS.join(", ")}`, "invalid");
      }
      const dataDir = loadConfig().dataDir;
      const next = applyConfigPatch(loadUserConfig(dataDir), key as keyof DeugalUserConfig, value);
      saveUserConfig(dataDir, next);
      printSuccess(`${key} = ${JSON.stringify(next[key as keyof DeugalUserConfig])}`);
    });

  configCmd
    .command("reset")
    .description("remove all saved preferences")
    .action(async () => {
      const dataDir = loadConfig().dataDir;
      saveUserConfig(dataDir, emptyUserConfig());
      printSuccess("Config reset.");
    });

  tag
    .command("rename <old-tag> <new-tag>")
    .description("rename a tag on every snippet that uses it")
    .action(async (oldTag: string, newTag: string) => {
      const store = getStore();
      const result = store.renameTag(oldTag, newTag);
      if (result.renamed === 0) {
        printInfoLine(`No snippet uses the tag "${oldTag}".`);
        return;
      }
      printSuccess(`Renamed "${oldTag}" to "${result.tag}" on ${result.renamed} snippet(s)`);
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
