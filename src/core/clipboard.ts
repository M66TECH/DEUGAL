import { spawnSync } from "node:child_process";
import { errorMessage, StoreError } from "./errors.js";

function linuxCommand(): { cmd: string; args: string[] } | undefined {
  for (const candidate of ["wl-copy", "xclip -selection clipboard", "xsel --clipboard --input"]) {
    const check = spawnSync("sh", ["-c", `command -v ${candidate.split(" ")[0]}`], { encoding: "utf8" });
    if (check.status === 0) {
      const [cmd, ...args] = candidate.split(" ");
      return { cmd: cmd!, args };
    }
  }
  return undefined;
}

export function copyToClipboard(text: string): void {
  let cmd: string;
  let args: string[];
  if (process.platform === "win32") {
    cmd = "clip";
    args = [];
  } else if (process.platform === "darwin") {
    cmd = "pbcopy";
    args = [];
  } else {
    const found = linuxCommand();
    if (!found) {
      throw new StoreError(
        "No clipboard tool found. Install wl-copy or xclip, or pipe the output instead.",
        "io",
      );
    }
    ({ cmd, args } = found);
  }
  try {
    const result = spawnSync(cmd, args, { input: text, encoding: "utf8", shell: process.platform === "win32" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new StoreError(`Clipboard command "${cmd}" exited with code ${result.status}`, "io");
    }
  } catch (err) {
    if (err instanceof StoreError) throw err;
    throw new StoreError(`Failed to copy to clipboard: ${errorMessage(err)}`, "io");
  }
}
