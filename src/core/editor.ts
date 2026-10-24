import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { errorMessage, StoreError } from "./errors.js";

export function defaultEditor(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.EDITOR?.trim() || env.VISUAL?.trim();
  if (fromEnv) return fromEnv;
  return process.platform === "win32" ? "notepad" : "vi";
}

export function editInEditor(initial: string, editor?: string): string {
  const chosen = editor?.trim() || defaultEditor();
  let dir: string | undefined;
  try {
    dir = mkdtempSync(path.join(os.tmpdir(), "deugal-edit-"));
    const file = path.join(dir, "snippet.md");
    writeFileSync(file, initial, "utf8");
    const result = spawnSync(chosen, [file], { stdio: "inherit", shell: process.platform === "win32" });
    if (result.error) {
      throw new StoreError(
        `Failed to start editor "${chosen}": ${errorMessage(result.error)}. Set EDITOR to a command in your PATH.`,
        "io",
      );
    }
    if (result.status !== 0) {
      throw new StoreError(`Editor "${chosen}" exited with code ${result.status}`, "io");
    }
    return readFileSync(file, "utf8");
  } catch (err) {
    if (err instanceof StoreError) throw err;
    throw new StoreError(`Editor failed: ${errorMessage(err)}`, "io");
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}
