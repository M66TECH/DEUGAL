import { createColors } from "picocolors";

const palette = createColors(true);

export function detectColorEnabled(env: NodeJS.ProcessEnv = process.env, stdout: { isTTY?: boolean } = process.stdout): boolean {
  if (env.NO_COLOR !== undefined) return false;
  const force = env.FORCE_COLOR;
  if (force !== undefined) return force !== "" && force !== "0";
  return Boolean(stdout.isTTY) && env.TERM !== "dumb";
}

let enabled = detectColorEnabled();

export function setColorEnabled(value: boolean): void {
  enabled = value;
}

export function isColorEnabled(): boolean {
  return enabled;
}

function paint(text: string, apply: (value: string) => string): string {
  return enabled ? apply(text) : text;
}

export function dim(text: string): string {
  return paint(text, palette.dim);
}

export function cyan(text: string): string {
  return paint(text, palette.cyan);
}

export function yellow(text: string): string {
  return paint(text, palette.yellow);
}

export function magenta(text: string): string {
  return paint(text, palette.magenta);
}

export function green(text: string): string {
  return paint(text, palette.green);
}

export function red(text: string): string {
  return paint(text, palette.red);
}
