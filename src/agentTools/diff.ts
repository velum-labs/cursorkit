interface DiffOp {
  type: "equal" | "delete" | "insert";
  line: string;
}

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split("\n");
}

function diffLines(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", line: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "delete", line: a[i] });
      i += 1;
    } else {
      ops.push({ type: "insert", line: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: "delete", line: a[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: "insert", line: b[j] });
    j += 1;
  }
  return ops;
}

export interface DiffStats {
  added: number;
  removed: number;
}

export function diffStats(before: string, after: string): DiffStats {
  let added = 0;
  let removed = 0;
  for (const op of diffLines(splitLines(before), splitLines(after))) {
    if (op.type === "insert") {
      added += 1;
    } else if (op.type === "delete") {
      removed += 1;
    }
  }
  return { added, removed };
}

/**
 * Produce a git-style unified diff with a single hunk covering the whole file.
 * The bridge synthesizes apply_patch from a read + write round trip, so this is
 * the evidence we surface back to the model (and to model-fusion artifacts).
 */
export function unifiedDiff(
  path: string,
  before: string,
  after: string,
): string {
  const a = splitLines(before);
  const b = splitLines(after);
  const ops = diffLines(a, b);
  const lines: string[] = [`--- a/${path}`, `+++ b/${path}`];
  const aStart = a.length === 0 ? 0 : 1;
  const bStart = b.length === 0 ? 0 : 1;
  lines.push(`@@ -${aStart},${a.length} +${bStart},${b.length} @@`);
  for (const op of ops) {
    switch (op.type) {
      case "equal":
        lines.push(` ${op.line}`);
        break;
      case "delete":
        lines.push(`-${op.line}`);
        break;
      case "insert":
        lines.push(`+${op.line}`);
        break;
      default: {
        const exhaustive: never = op.type;
        throw new Error(`unreachable diff op: ${String(exhaustive)}`);
      }
    }
  }
  return lines.join("\n");
}
