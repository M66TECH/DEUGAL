import { StoreError } from "./errors.js";

const UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export function parseDuration(input: string): number {
  const value = input.trim().toLowerCase();
  const match = /^(\d+)\s*([mhdw])$/.exec(value);
  if (!match) {
    throw new StoreError(
      `Invalid duration "${input}". Use a number followed by m, h, d or w (for example 30m, 24h, 7d, 2w).`,
      "invalid",
    );
  }
  const amount = Number.parseInt(match[1]!, 10);
  if (amount <= 0) {
    throw new StoreError(`Invalid duration "${input}": the amount must be positive.`, "invalid");
  }
  return amount * UNIT_MS[match[2]!]!;
}

export function sinceEpoch(input: string, now: number = Date.now()): number {
  return now - parseDuration(input);
}

export function formatDuration(ms: number): string {
  const units: Array<[string, number]> = [
    ["w", UNIT_MS.w!],
    ["d", UNIT_MS.d!],
    ["h", UNIT_MS.h!],
    ["m", UNIT_MS.m!],
  ];
  for (const [suffix, size] of units) {
    if (ms >= size) {
      const amount = Math.floor(ms / size);
      return `${amount}${suffix}`;
    }
  }
  return "0m";
}
