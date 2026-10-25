import { existsSync, readFileSync, statSync } from "node:fs";
import { errorMessage } from "./errors.js";
import { loadUserConfig } from "./userconfig.js";
import { SnippetStore } from "./store.js";
import { backupCount } from "./store.js";
import { status as syncStatus } from "./sync.js";
import type { DeugalConfig } from "./config.js";

export type CheckStatus = "ok" | "warn" | "error";

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

export const MIN_NODE = [22, 12, 0] as const;

export function checkNodeVersion(version: string = process.versions.node): Check {
  const parts = version.split(".").map((p) => Number.parseInt(p, 10));
  const [major = 0, minor = 0, patch = 0] = parts;
  const ok =
    major > MIN_NODE[0] ||
    (major === MIN_NODE[0] && (minor > MIN_NODE[1] || (minor === MIN_NODE[1] && patch >= MIN_NODE[2])));
  return {
    name: "node",
    status: ok ? "ok" : "warn",
    detail: ok
      ? `v${version}`
      : `v${version} is older than the recommended ${MIN_NODE.join(".")}`,
  };
}

export function checkDataDir(config: DeugalConfig): Check {
  if (!existsSync(config.dataDir)) {
    return { name: "data dir", status: "ok", detail: `${config.dataDir} (will be created on first write)` };
  }
  try {
    const stats = statSync(config.dataDir);
    if (!stats.isDirectory()) {
      return { name: "data dir", status: "error", detail: `${config.dataDir} is not a directory` };
    }
    return { name: "data dir", status: "ok", detail: config.dataDir };
  } catch (err) {
    return { name: "data dir", status: "error", detail: errorMessage(err) };
  }
}

export function checkStore(config: DeugalConfig): Check[] {
  const store = new SnippetStore(config.storeFile);
  if (!existsSync(config.storeFile)) {
    return [{ name: "store", status: "ok", detail: "no store yet, it will be created on first add" }];
  }
  try {
    const snippets = store.all();
    const dupes = snippets.length - new Set(snippets.map((s) => s.id)).size;
    const checks: Check[] = [
      { name: "store", status: "ok", detail: `${snippets.length} snippet(s) in ${config.storeFile}` },
    ];
    if (dupes > 0) {
      checks.push({ name: "store ids", status: "error", detail: `${dupes} duplicated id(s)` });
    } else {
      checks.push({ name: "store ids", status: "ok", detail: "all ids are unique" });
    }
    const backups = backupCount(config.storeFile);
    checks.push({
      name: "backups",
      status: backups > 0 ? "ok" : "warn",
      detail: backups > 0 ? `${backups} backup(s) available` : "no backup yet",
    });
    return checks;
  } catch (err) {
    return [{ name: "store", status: "error", detail: errorMessage(err) }];
  }
}

export function checkConfigFile(config: DeugalConfig): Check {
  try {
    const userConfig = loadUserConfig(config.dataDir);
    const keys = Object.keys(userConfig);
    return {
      name: "config",
      status: "ok",
      detail: keys.length === 0 ? "no overrides" : `overrides: ${keys.join(", ")}`,
    };
  } catch (err) {
    return { name: "config", status: "error", detail: errorMessage(err) };
  }
}

export function checkSync(config: DeugalConfig): Check {
  const state = syncStatus(config.dataDir);
  if (!state.gitAvailable) {
    return { name: "sync", status: "warn", detail: "git not found, deugal sync is unavailable" };
  }
  if (!state.isRepo) {
    return { name: "sync", status: "ok", detail: "no git repo yet (deugal sync --init)" };
  }
  const parts = [`repo ready`];
  if (state.remote !== undefined) parts.push(`remote: ${state.remote}`);
  parts.push(`${state.dirtyCount} uncommitted file(s)`);
  return {
    name: "sync",
    status: state.dirtyCount > 0 ? "warn" : "ok",
    detail: parts.join(", "),
  };
}

export function runChecks(config: DeugalConfig, nodeVersion?: string): Check[] {
  const checks: Check[] = [checkNodeVersion(nodeVersion)];
  checks.push(checkDataDir(config));
  checks.push(...checkStore(config));
  checks.push(checkConfigFile(config));
  checks.push(checkSync(config));
  return checks;
}

export function hasErrors(checks: Check[]): boolean {
  return checks.some((c) => c.status === "error");
}

export function readStoreSummary(config: DeugalConfig): string {
  try {
    const raw = readFileSync(config.storeFile, "utf8");
    return `${Math.round(raw.length / 1024)} KB`;
  } catch {
    return "unreadable";
  }
}
