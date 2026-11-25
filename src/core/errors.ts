export class StoreError extends Error {
  readonly kind: "not-found" | "ambiguous" | "invalid" | "io";

  constructor(message: string, kind: StoreError["kind"] = "invalid") {
    super(message);
    this.name = "StoreError";
    this.kind = kind;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
