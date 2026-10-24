import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { errorMessage, StoreError } from "./errors.js";
import { randomId } from "./id.js";
import type { SortMode } from "./types.js";

export interface DeugalUserConfig {
  editor?: string;
  sort?: SortMode;
  limit?: number;
}

export type ConfigKey = keyof DeugalUserConfig;

export const CONFIG_KEYS: ConfigKey[] = ["editor", "sort", "limit"];
const SORT_MODES: SortMode[] = ["recent", "created", "used", "alpha"];

export function emptyUserConfig(): DeugalUserConfig {
  return {};
}

export function configFilePath(dataDir: string): string {
  return path.join(dataDir, "config.json");
}

export function loadUserConfig(dataDir: string): DeugalUserConfig {
  const file = configFilePath(dataDir);
  if (!existsSync(file)) return emptyUserConfig();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new StoreError(
      `Config file ${file} is not valid JSON: ${errorMessage(err)}. Fix or delete it, or run: deugal config reset`,
      "invalid",
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new StoreError(
      `Config file ${file} must contain a JSON object with keys: ${CONFIG_KEYS.join(", ")}`,
      "invalid",
    );
  }
  const record = parsed as Record<string, unknown>;
  const config: DeugalUserConfig = {};
  if (typeof record.editor === "string" && record.editor.trim()) config.editor = record.editor.trim();
  if (typeof record.sort === "string" && SORT_MODES.includes(record.sort as SortMode)) {
    config.sort = record.sort as SortMode;
  }
  if (typeof record.limit === "number" && Number.isFinite(record.limit) && record.limit >= 1) {
    config.limit = Math.trunc(record.limit);
  }
  return config;
}

export function saveUserConfig(dataDir: string, config: DeugalUserConfig): void {
  const file = configFilePath(dataDir);
  const tmp = `${file}.${process.pid}.${randomId(4)}.tmp`;
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  } catch (err) {
    throw new StoreError(`Cannot write config file ${file}: ${errorMessage(err)}`, "io");
  }
  try {
    renameSync(tmp, file);
  } catch (err) {
    throw new StoreError(`Cannot replace config file ${file}: ${errorMessage(err)}`, "io");
  }
}

export function applyConfigPatch(
  config: DeugalUserConfig,
  key: ConfigKey,
  rawValue: string,
): DeugalUserConfig {
  const next: DeugalUserConfig = { ...config };
  if (key === "editor") {
    const editor = rawValue.trim();
    if (!editor) throw new StoreError("editor must be a non-empty command name", "invalid");
    next.editor = editor;
    return next;
  }
  if (key === "sort") {
    const sort = rawValue.trim().toLowerCase();
    if (!SORT_MODES.includes(sort as SortMode)) {
      throw new StoreError(`sort must be one of: ${SORT_MODES.join(", ")}`, "invalid");
    }
    next.sort = sort as SortMode;
    return next;
  }
  const limit = Number.parseInt(rawValue, 10);
  if (Number.isNaN(limit) || limit < 1) {
    throw new StoreError("limit must be a positive integer", "invalid");
  }
  next.limit = limit;
  return next;
}
