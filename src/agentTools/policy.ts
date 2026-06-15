import type { AgentToolPolicy } from "../config.js";
import type { CursorToolSurfaceEntry } from "./surface.js";

export function toolEnabledByPolicy(
  entry: CursorToolSurfaceEntry,
  policy: AgentToolPolicy,
): boolean {
  if (entry.openAIToolName === undefined) {
    return false;
  }
  if (entry.support === "supported") {
    return true;
  }
  if (entry.support === "policy-gated") {
    return policy === "all";
  }
  return false;
}
