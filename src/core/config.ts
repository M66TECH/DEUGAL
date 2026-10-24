import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";

export interface DeugalConfig {
  dataDir: string;
  storeFile: string;
}

export function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.DEUGAL_HOME?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(os.homedir(), ".deugal");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DeugalConfig {
  const dataDir = resolveDataDir(env);
  return { dataDir, storeFile: path.join(dataDir, "snippets.json") };
}

export function ensureDataDir(config: DeugalConfig): void {
  mkdirSync(config.dataDir, { recursive: true });
}
