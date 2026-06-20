import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  Spinner,
  StepList,
  bold,
  brandHeader,
  cyan,
  glyph,
  green,
  isCI,
  isInteractive,
  supportsColor,
} from "../src/ui/index.js";

const originalNoColor = process.env.NO_COLOR;
const originalForceColor = process.env.FORCE_COLOR;
const originalNoTui = process.env.CURSORKIT_NO_TUI;

beforeEach(() => {
  process.env.NO_COLOR = "1";
  delete process.env.FORCE_COLOR;
});

afterEach(() => {
  vi.restoreAllMocks();
  restore("NO_COLOR", originalNoColor);
  restore("FORCE_COLOR", originalForceColor);
  restore("CURSORKIT_NO_TUI", originalNoTui);
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function captureStderr(work: () => void): string {
  let output = "";
  const write = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      output +=
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      return true;
    });
  try {
    work();
  } finally {
    write.mockRestore();
  }
  return output;
}

describe("ui theme", () => {
  it("no-ops color helpers when NO_COLOR is set", () => {
    expect(supportsColor()).toBe(false);
    expect(bold("hi")).toBe("hi");
    expect(green("ok")).toBe("ok");
    expect(cyan("x")).toBe("x");
  });

  it("emits ANSI codes when color is forced", () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = "1";
    expect(supportsColor()).toBe(true);
    expect(green("ok")).toBe("\u001b[32mok\u001b[39m");
  });

  it("falls back to ASCII glyphs without color", () => {
    expect(glyph.tick()).toBe("[ok]");
    expect(glyph.cross()).toBe("[x]");
    expect(glyph.arrow()).toBe(">");
  });

  it("brands the header with the cursorkit name", () => {
    expect(brandHeader()).toContain("cursorkit");
    expect(brandHeader("subtitle")).toContain("subtitle");
  });
});

describe("ui runtime", () => {
  it("treats the test process as non-interactive (no TTY)", () => {
    expect(isInteractive()).toBe(false);
  });

  it("detects CI from common env flags", () => {
    const original = process.env.CI;
    process.env.CI = "true";
    expect(isCI()).toBe(true);
    restore("CI", original);
  });
});

describe("StepList (non-interactive)", () => {
  it("prints one ordered line per transition with glyph fallbacks", () => {
    const output = captureStderr(() => {
      const steps = new StepList([{ id: "a", label: "Alpha" }]).start();
      steps.setActive("a");
      steps.setDone("a", "ready");
      steps.stop();
    });
    expect(output).toContain("Alpha");
    expect(output).toContain("[ok]");
    expect(output).toContain("ready");
  });
});

describe("Spinner (non-interactive)", () => {
  it("prints a start line and a settled success line", () => {
    const output = captureStderr(() => {
      const spinner = new Spinner("Working").start();
      spinner.succeed("Done");
    });
    expect(output).toContain("Working");
    expect(output).toContain("[ok] Done");
  });
});
