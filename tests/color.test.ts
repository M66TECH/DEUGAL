import { afterEach, describe, expect, it } from "vitest";
import { detectColorEnabled, isColorEnabled, setColorEnabled, dim, cyan } from "../src/ui/color.js";

afterEach(() => {
  setColorEnabled(detectColorEnabled());
});

describe("detectColorEnabled", () => {
  it("disables on NO_COLOR regardless of everything else", () => {
    expect(detectColorEnabled({ NO_COLOR: "1", FORCE_COLOR: "3" })).toBe(false);
  });

  it("disables when FORCE_COLOR is 0 or empty", () => {
    expect(detectColorEnabled({ FORCE_COLOR: "0" }, { isTTY: true })).toBe(false);
    expect(detectColorEnabled({ FORCE_COLOR: "" }, { isTTY: true })).toBe(false);
  });

  it("enables when FORCE_COLOR is set even without a TTY", () => {
    expect(detectColorEnabled({ FORCE_COLOR: "1" }, {})).toBe(true);
    expect(detectColorEnabled({ FORCE_COLOR: "2" }, {})).toBe(true);
  });

  it("follows TTY when no env override is present", () => {
    expect(detectColorEnabled({ TERM: "xterm" }, { isTTY: true })).toBe(true);
    expect(detectColorEnabled({ TERM: "xterm" }, {})).toBe(false);
  });

  it("disables for dumb terminals", () => {
    expect(detectColorEnabled({ TERM: "dumb" }, { isTTY: true })).toBe(false);
  });
});

describe("color helpers", () => {
  it("emit plain text when disabled", () => {
    setColorEnabled(false);
    expect(dim("x")).toBe("x");
    expect(cyan("hello")).toBe("hello");
    expect(isColorEnabled()).toBe(false);
  });

  it("emit ANSI codes when enabled", () => {
    setColorEnabled(true);
    expect(dim("x")).toContain("\x1b[");
    expect(isColorEnabled()).toBe(true);
  });
});
