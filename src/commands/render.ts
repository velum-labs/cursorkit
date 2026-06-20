import { dim, glyph, gray, green, red, yellow } from "../ui/index.js";

/**
 * A single diagnostic line. `ok === undefined` renders as a neutral bullet
 * (informational), while `true`/`false` render as a tick/cross. A `hint` is
 * shown on the next line only for failed checks.
 */
export type Check = {
  label: string;
  ok?: boolean;
  detail?: string;
  hint?: string;
};

export function renderCheck(check: Check): string {
  const mark =
    check.ok === undefined
      ? gray(glyph.bullet())
      : check.ok
        ? green(glyph.tick())
        : red(glyph.cross());
  const detail = check.detail !== undefined ? ` ${dim(check.detail)}` : "";
  const hint =
    check.ok === false && check.hint !== undefined
      ? `\n    ${yellow(glyph.arrow())} ${check.hint}`
      : "";
  return `${mark} ${check.label}${detail}${hint}`;
}

/** A yellow advisory line (non-fatal warnings). */
export function warningLine(message: string): string {
  return `${yellow(glyph.warn())} ${message}`;
}
