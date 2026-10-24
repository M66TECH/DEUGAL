import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main, parseTags } from "../src/cli.js";
import { SnippetStore } from "../src/core/store.js";

let homeDir: string;
let storeFile: string;
const savedEnv = { ...process.env };

beforeEach(() => {
  homeDir = mkdtempSync(path.join(os.tmpdir(), "deugal-cli-"));
  storeFile = path.join(homeDir, "snippets.json");
  process.env.DEUGAL_HOME = homeDir;
});

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) {
    if (key in savedEnv) process.env[key] = savedEnv[key];
    else delete process.env[key];
  }
});

function store(): SnippetStore {
  return new SnippetStore(storeFile);
}

function idByTitle(title: string): string {
  const found = store().all().find((s) => s.title === title);
  if (!found) throw new Error(`test setup error: no snippet titled "${title}"`);
  return found.id;
}

async function capture(run: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  const chunks: string[] = [];
  const errors: string[] = [];
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  const patchedOut = ((chunk: unknown): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  const patchedErr = ((chunk: unknown): boolean => {
    errors.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  }) as typeof process.stderr.write;
  process.stdout.write = patchedOut;
  process.stderr.write = patchedErr;
  try {
    const code = await run();
    return { code, out: chunks.join(""), err: errors.join("") };
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
}

describe("parseTags", () => {
  it("splits commas, trims, lowercases, dedupes", () => {
    expect(parseTags(["Git,hooks", "  git ", "TS", ""])).toEqual(["git", "hooks", "ts"]);
    expect(parseTags(undefined)).toEqual([]);
  });
});

describe("main() CLI flows", () => {
  it("shows version and exits 0", async () => {
    const { code, out } = await capture(() => main(["--version"]));
    expect(code).toBe(0);
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("add creates a snippet in the configured store", async () => {
    const { code } = await capture(() =>
      main(["add", "my snippet", "the content", "-t", "git", "-l", "bash"]),
    );
    expect(code).toBe(0);
    expect(existsSync(storeFile)).toBe(true);
    const snippet = store().all()[0]!;
    expect(snippet.title).toBe("my snippet");
    expect(snippet.content).toBe("the content");
    expect(snippet.tags).toEqual(["git"]);
    expect(snippet.language).toBe("bash");
  });

  it("add fails cleanly when content is missing", async () => {
    const code = await main(["add", "only a title"]);
    expect(code).toBe(1);
  });

  it("add --json prints the created snippet", async () => {
    const { code, out } = await capture(() => main(["add", "json", "pretty", "--json"]));
    expect(code).toBe(0);
    const printed = JSON.parse(out) as { title: string; content: string };
    expect(printed.title).toBe("json");
    expect(printed.content).toBe("pretty");
  });

  it("unknown commands exit 1", async () => {
    const code = await main(["frobnicate"]);
    expect(code).toBe(1);
  });

  it("list prints a table and list --tag filters", async () => {
    await capture(() => main(["add", "one", "1", "-t", "alpha"]));
    await capture(() => main(["add", "two", "2", "-t", "beta"]));
    const { code, out } = await capture(() => main(["list", "--tag", "beta"]));
    expect(code).toBe(0);
    expect(out).toContain("two");
    expect(out).not.toContain(" one ");
    expect(out).toContain("1 snippet(s)");
  });

  it("list --json prints the whole collection", async () => {
    await capture(() => main(["add", "one", "content-uno"]));
    const { code, out } = await capture(() => main(["list", "--json"]));
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as Array<{ title: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.title).toBe("one");
  });

  it("show resolves by prefix and errors for unknown ids", async () => {
    await capture(() => main(["add", "target", "body"]));
    const id = store().all()[0]!.id;
    const { code, out } = await capture(() => main(["show", id.slice(0, 3)]));
    expect(code).toBe(0);
    expect(out).toContain("target");
    expect(out).toContain("body");
    expect(await main(["show", "zzzzzzzz"])).toBe(1);
  });

  it("use --no-track prints without bumping counter", async () => {
    await capture(() => main(["add", "piped", "hello world"]));
    const id = store().all()[0]!.id;
    const { out } = await capture(() => main(["use", id, "--no-track"]));
    expect(out).toBe("hello world\n");
    expect(store().all()[0]!.useCount).toBe(0);
    await capture(() => main(["use", id]));
    expect(store().all()[0]!.useCount).toBe(1);
  });

  it("tag rename renames a tag on every snippet", async () => {
    await capture(() => main(["add", "one", "1", "-t", "kubernets"]));
    await capture(() => main(["add", "two", "2", "-t", "kubernets", "ops"]));
    expect(await main(["tag", "rename", "kubernets", "k8s"])).toBe(0);
    const all = store().all();
    expect(all.find((s) => s.title === "one")?.tags).toEqual(["k8s"]);
    expect(all.find((s) => s.title === "two")?.tags).toEqual(["k8s", "ops"]);
    expect(await main(["tag", "rename", "nothing", "x"])).toBe(0);
  });

  it("candidates lists command names and matching ids", async () => {
    await capture(() => main(["add", "list files", "ls -la"]));
    const id = idByTitle("list files");
    const { out: empty } = await capture(() => main(["candidates"]));
    expect(empty).toContain("search");
    const { out: partial } = await capture(() => main(["candidates", id.slice(0, 3)]));
    expect(partial).toContain("list files");
    const { out: title } = await capture(() => main(["candidates", "list fi"]));
    expect(title).toContain(id);
  });

  it("completions prints a script per shell and rejects the rest", async () => {
    const bash = await capture(() => main(["completions", "bash"]));
    expect(bash.code).toBe(0);
    expect(bash.out).toContain("complete -F _deugal_complete deugal");
    const ps = await capture(() => main(["completions", "powershell"]));
    expect(ps.out).toContain("Register-ArgumentCompleter");
    const zsh = await capture(() => main(["completions", "zsh"]));
    expect(zsh.out).toContain("#compdef deugal");
    expect(await main(["completions", "fish"])).toBe(1);
  });

  it("config color never removes ANSI codes from output", async () => {
    const { out: before } = await capture(() => main(["add", "colorful", "snippet", "--json"]));
    expect(before).not.toContain("\x1b[");
    expect(await main(["config", "set", "color", "never"])).toBe(0);
    const { out: after } = await capture(() => main(["list"]));
    expect(after).not.toContain("\x1b[");
    expect(await main(["config", "set", "color", "always"])).toBe(0);
    const { out: forced } = await capture(() => main(["list"]));
    expect(forced).toContain("\x1b[");
    expect(await main(["config", "reset"])).toBe(0);
  });

  it("config set, get and reset persist preferences", async () => {
    expect(await main(["config", "set", "sort", "alpha"])).toBe(0);
    expect(await main(["config", "set", "limit", "7"])).toBe(0);
    expect(await main(["config", "set", "editor", "notepad"])).toBe(0);
    const { code, out } = await capture(() => main(["config"]));
    expect(code).toBe(0);
    expect(out).toContain("sort:    alpha");
    expect(out).toContain("limit:   7");
    expect(out).toContain("editor:  notepad");
    expect(await main(["config", "set", "nope", "1"])).toBe(1);
    expect(await main(["config", "set", "limit", "zero"])).toBe(1);
    expect(await main(["config", "reset"])).toBe(0);
    const { out: after } = await capture(() => main(["config"]));
    expect(after).toContain("(default: recent)");
  });

  it("list applies the configured sort and limit", async () => {
    await capture(() => main(["add", "aaa", "1"]));
    await capture(() => main(["add", "bbb", "2"]));
    await capture(() => main(["add", "ccc", "3"]));
    expect(await main(["config", "set", "sort", "alpha"])).toBe(0);
    expect(await main(["config", "set", "limit", "2"])).toBe(0);
    const { out } = await capture(() => main(["list"]));
    expect(out).toContain("aaa");
    expect(out).toContain("bbb");
    expect(out).not.toContain("ccc");
    const { out: forced } = await capture(() => main(["list", "--sort", "recent", "--limit", "10"]));
    expect(forced).toContain("ccc");
  });

  it("dedupe removes duplicates with dry-run preview", async () => {
    await capture(() => main(["add", "copy one", "same content"]));
    await capture(() => main(["add", "copy two", "same content"]));
    await capture(() => main(["add", "different", "other"]));
    const { out: dry } = await capture(() => main(["dedupe", "--dry-run"]));
    expect(dry).toContain("1 snippet(s) would be removed");
    expect(store().size()).toBe(3);
    const { out: applied } = await capture(() => main(["dedupe"]));
    expect(applied).toContain("copy two");
    expect(applied).toContain("Removed 1 duplicate(s)");
    expect(store().size()).toBe(2);
    const { out: again } = await capture(() => main(["dedupe"]));
    expect(again).toContain("No duplicate content found");
  });

  it("recover lists and restores backups", async () => {
    await capture(() => main(["add", "keep me", "good"]));
    await capture(() => main(["add", "second", "still good"]));
    const { code: listCode, out: listOut } = await capture(() => main(["recover"]));
    expect(listCode).toBe(0);
    expect(listOut).toContain("bak1");
    const { code: restoreCode, out: restoreOut } = await capture(() => main(["recover", "--from", "1"]));
    expect(restoreCode).toBe(0);
    expect(restoreOut).toContain("Restored");
    expect(store().size()).toBe(1);
  });

  it("list --lang filters by language", async () => {
    await capture(() => main(["add", "bash thing", "echo", "-l", "bash"]));
    await capture(() => main(["add", "sql thing", "SELECT", "-l", "sql"]));
    const { code, out } = await capture(() => main(["list", "--lang", "sql"]));
    expect(code).toBe(0);
    expect(out).toContain("sql thing");
    expect(out).not.toContain(" bash thing ");
  });

  it("rm requires --force", async () => {
    await capture(() => main(["add", "victim", "data"]));
    const id = idByTitle("victim");
    expect(await main(["rm", id])).toBe(1);
    expect(store().size()).toBe(1);
    expect(await main(["rm", id, "--force"])).toBe(0);
    expect(store().size()).toBe(0);
  });

  it("rm handles several ids and reports failures individually", async () => {
    await capture(() => main(["add", "one", "1"]));
    await capture(() => main(["add", "two", "2"]));
    await capture(() => main(["add", "three", "3"]));
    const idOne = idByTitle("one");
    const idTwo = idByTitle("two");
    const badCode = await main(["rm", idOne, "zzzzzzzz", idTwo, "--force"]);
    expect(badCode).toBe(1);
    expect(store().size()).toBe(1);
    const { err } = await capture(() => main(["rm", "zzzzzzzz", "--force"]));
    expect(err).toContain("No snippet matches");
  });

  it("tag add and tag rm round trip", async () => {
    await capture(() => main(["add", "tagged", "c"]));
    const id = store().all()[0]!.id;
    expect(await main(["tag", "add", id, "one", "two"])).toBe(0);
    expect(store().all()[0]!.tags).toEqual(["one", "two"]);
    expect(await main(["tag", "rm", id, "one"])).toBe(0);
    expect(store().all()[0]!.tags).toEqual(["two"]);
  });

  it("pin and unpin move a snippet to the top of lists", async () => {
    await capture(() => main(["add", "first plain", "1"]));
    await capture(() => main(["add", "second plain", "2"]));
    const id = idByTitle("second plain");
    const { out } = await capture(() => main(["pin", id]));
    expect(out).toContain("Pinned");
    const { out: listed } = await capture(() => main(["list"]));
    expect(listed.indexOf("second plain")).toBeLessThan(listed.indexOf("first plain"));
    expect(listed).toContain("* second plain");
    const { out: unpinned } = await capture(() => main(["unpin", id]));
    expect(unpinned).toContain("Unpinned");
  });

  it("recent lists newest creations first with a limit", async () => {
    await capture(() => main(["add", "old one", "1"]));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await capture(() => main(["add", "new one", "2"]));
    const { code, out } = await capture(() => main(["recent", "1"]));
    expect(code).toBe(0);
    expect(out).toContain("new one");
    expect(out).not.toContain(" old one ");
    expect(out).toContain("newest first");
    expect(await main(["recent", "abc"])).toBe(1);
  });

  it("search finds matches", async () => {
    await capture(() => main(["add", "kubernetes apply", "kubectl apply -f .", "-t", "k8s"]));
    const { code, out } = await capture(() => main(["search", "k8s"]));
    expect(code).toBe(0);
    expect(out).toContain("kubernetes apply");
  });

  it("find is an alias of search and fuzzy matches", async () => {
    await capture(() => main(["add", "docker cleanup", "docker system prune -af"]));
    const { code, out } = await capture(() => main(["find", "dkcln"]));
    expect(code).toBe(0);
    expect(out).toContain("docker cleanup");
  });

  it("search --tag narrows results by tags", async () => {
    await capture(() => main(["add", "docker cleanup", "docker prune", "-t", "docker"]));
    await capture(() => main(["add", "docker in prod", "kubectl", "-t", "docker", "prod"]));
    const { code, out } = await capture(() => main(["search", "docker", "-t", "prod"]));
    expect(code).toBe(0);
    expect(out).toContain("docker in prod");
    expect(out).not.toContain("docker cleanup");
  });

  it("related lists snippets sharing tags", async () => {
    await capture(() => main(["add", "one", "c1", "-t", "shared"]));
    await capture(() => main(["add", "two", "c2", "-t", "shared", "other"]));
    const id = idByTitle("one");
    const { code, out } = await capture(() => main(["related", id]));
    expect(code).toBe(0);
    expect(out).toContain("two");
    expect(out).toContain("1 related snippet(s)");
  });

  it("related json output contains the shared tags", async () => {
    await capture(() => main(["add", "one", "c1", "-t", "alpha"]));
    await capture(() => main(["add", "two", "c2", "-t", "alpha"]));
    const id = idByTitle("one");
    const { code, out } = await capture(() => main(["related", id, "--json"]));
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as Array<{ snippet: { title: string }; shared: string[] }>;
    expect(parsed[0]!.snippet.title).toBe("two");
    expect(parsed[0]!.shared).toEqual(["alpha"]);
  });

  it("export - writes the bundle to stdout", async () => {
    await capture(() => main(["add", "streamed", "via pipes", "-t", "io"]));
    const { code, out } = await capture(() => main(["export", "-", "--format", "json"]));
    expect(code).toBe(0);
    const bundle = JSON.parse(out) as { deugal: number; snippets: unknown[] };
    expect(bundle.deugal).toBe(1);
    expect(bundle.snippets).toHaveLength(1);
    const { code: yamlCode, out: yamlOut } = await capture(() => main(["export", "-", "-f", "yaml"]));
    expect(yamlCode).toBe(0);
    expect(yamlOut).toContain("deugal: 1");
  });

  it("import - reads the bundle from piped stdin", async (context) => {
    const distCli = path.join(import.meta.dirname, "..", "dist", "cli.js");
    if (!existsSync(distCli)) {
      context.skip();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [distCli, "import", "-"], {
        env: { ...process.env, DEUGAL_HOME: homeDir },
        stdio: ["pipe", "ignore", "pipe"],
      });
      child.stdin!.end('{"snippets":[{"title":"piped import","content":"works"}]}');
      let stderr = "";
      child.stderr!.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`import failed: ${stderr}`));
      });
    });
    const imported = store().all().find((s) => s.title === "piped import");
    expect(imported?.content).toBe("works");
  });

  it("export then import round trip preserves snippets", async () => {
    await capture(() => main(["add", "round", "trip", "-t", "rt"]));
    const exportFile = path.join(homeDir, "out.json");
    expect(await main(["export", exportFile])).toBe(0);
    const exported = JSON.parse(readFileSync(exportFile, "utf8")) as { deugal: number; snippets: unknown[] };
    expect(exported.deugal).toBe(1);
    expect(exported.snippets).toHaveLength(1);

    const secondHome = mkdtempSync(path.join(os.tmpdir(), "deugal-cli-2-"));
    try {
      process.env.DEUGAL_HOME = secondHome;
      const fresh = new SnippetStore(path.join(secondHome, "snippets.json"));
      expect(await main(["import", exportFile])).toBe(0);
      expect(fresh.all()[0]!.title).toBe("round");
      expect(await main(["import", exportFile])).toBe(0);
      expect(fresh.size()).toBe(1);
      expect(await main(["import", exportFile, "--overwrite"])).toBe(0);
      expect(fresh.size()).toBe(1);
    } finally {
      process.env.DEUGAL_HOME = homeDir;
      rmSync(secondHome, { recursive: true, force: true });
    }
  });

  it("commands succeed on an empty store", async () => {
    expect(await main(["list"])).toBe(0);
    expect(await main(["tags"])).toBe(0);
    expect(await main(["stats"])).toBe(0);
    expect(await main(["search", "anything"])).toBe(0);
  });
});
