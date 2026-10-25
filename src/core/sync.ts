import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { errorMessage, StoreError } from "./errors.js";

export interface GitOutcome {
  ok: boolean;
  output: string;
}

export interface SyncResult {
  initialized: boolean;
  committed: boolean;
  pushed: boolean;
  pushError?: string;
  output: string;
}

export interface SyncStatus {
  gitAvailable: boolean;
  isRepo: boolean;
  remote?: string;
  lastCommit?: string;
  dirtyCount: number;
}

const GIT_IDENTITY = ["-c", "user.name=deugal", "-c", "user.email=deugal@local"];

export function gitAvailable(): boolean {
  try {
    const result = spawnSync("git", ["--version"], { encoding: "utf8" });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

export function git(dataDir: string, args: string[]): GitOutcome {
  try {
    const result = spawnSync("git", args, { cwd: dataDir, encoding: "utf8" });
    if (result.error) {
      return { ok: false, output: errorMessage(result.error) };
    }
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    return { ok: result.status === 0, output };
  } catch (err) {
    return { ok: false, output: errorMessage(err) };
  }
}

function isRepo(dataDir: string): boolean {
  return existsSync(path.join(dataDir, ".git"));
}

function remoteUrl(dataDir: string): string | undefined {
  const result = git(dataDir, ["config", "--get", "remote.origin.url"]);
  const url = result.output.trim();
  return result.ok && url ? url : undefined;
}

function dirtyCount(dataDir: string): number {
  const result = git(dataDir, ["status", "--porcelain"]);
  if (!result.ok) return 0;
  return result.output.split("\n").filter((line) => line.trim().length > 0).length;
}

export function status(dataDir: string): SyncStatus {
  const available = gitAvailable();
  const repo = isRepo(dataDir);
  const status: SyncStatus = {
    gitAvailable: available,
    isRepo: repo,
    dirtyCount: repo ? dirtyCount(dataDir) : 0,
  };
  if (repo && available) {
    const url = remoteUrl(dataDir);
    if (url) status.remote = url;
    const last = git(dataDir, ["log", "-1", "--oneline"]);
    if (last.ok) status.lastCommit = last.output.trim();
  }
  return status;
}

export function init(dataDir: string): SyncResult {
  if (!gitAvailable()) {
    throw new StoreError("git is not installed or not in PATH. Install it to use deugal sync.", "io");
  }
  let initialized = false;
  if (!isRepo(dataDir)) {
    const result = git(dataDir, ["init"]);
    if (!result.ok) {
      throw new StoreError(`git init failed: ${result.output}`, "io");
    }
    initialized = true;
  }
  return { initialized, committed: false, pushed: false, output: "" };
}

export function sync(
  dataDir: string,
  options: { message?: string | undefined; push?: boolean | undefined } = {},
): SyncResult {
  const result = init(dataDir);
  git(dataDir, ["add", "--all", "."]);
  const staged = git(dataDir, ["diff", "--cached", "--name-only"]);
  const hasStaged = staged.ok && staged.output.trim().length > 0;
  if (hasStaged) {
    const message = options.message ?? `Sync snippets at ${new Date().toISOString()}`;
    const commit = git(dataDir, [...GIT_IDENTITY, "commit", "--message", message]);
    if (!commit.ok) {
      throw new StoreError(`git commit failed: ${commit.output}`, "io");
    }
    result.committed = true;
    result.output = commit.output;
  }
  if (options.push && remoteUrl(dataDir)) {
    const push = git(dataDir, ["push", "-u", "origin", "HEAD"]);
    if (push.ok) {
      result.pushed = true;
      result.output += `\n${push.output}`;
    } else {
      result.pushError = push.output;
    }
  }
  return result;
}

export interface HistoryEntry {
  hash: string;
  date: string;
  message: string;
}

export function history(dataDir: string, limit = 20): HistoryEntry[] {
  if (!isRepo(dataDir) || !gitAvailable()) return [];
  const result = git(dataDir, [
    "log",
    `--max-count=${Math.max(1, limit)}`,
    "--date=iso-strict",
    "--pretty=format:%h%x09%ad%x09%s",
  ]);
  if (!result.ok || !result.output.trim()) return [];
  const entries: HistoryEntry[] = [];
  for (const line of result.output.split("\n")) {
    const [hash, date, ...rest] = line.split("\t");
    if (hash === undefined || date === undefined) continue;
    entries.push({ hash, date, message: rest.join("\t") });
  }
  return entries;
}

export function setRemote(dataDir: string, url: string): void {
  if (!gitAvailable()) {
    throw new StoreError("git is not installed or not in PATH. Install it to use deugal sync.", "io");
  }
  init(dataDir);
  const existing = remoteUrl(dataDir);
  const result = existing
    ? git(dataDir, ["remote", "set-url", "origin", url])
    : git(dataDir, ["remote", "add", "origin", url]);
  if (!result.ok) {
    throw new StoreError(`git remote failed: ${result.output}`, "io");
  }
}
