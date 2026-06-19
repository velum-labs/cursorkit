export type CursorToolSupport =
  | "supported"
  | "policy-gated"
  | "internal"
  | "not-supported";

export interface CursorToolSurfaceEntry {
  execServerField: string;
  execClientField: string;
  openAIToolName?: string;
  support: CursorToolSupport;
  safety:
    | "read"
    | "network"
    | "interactive"
    | "mutating"
    | "destructive"
    | "subagent"
    | "internal";
  notes: string;
}

export const CURSOR_TOOL_SURFACE: CursorToolSurfaceEntry[] = [
  {
    execServerField: "requestContextArgs",
    execClientField: "requestContextResult",
    support: "internal",
    safety: "internal",
    notes:
      "Bridge uses this to collect native Cursor request context before model execution.",
  },
  {
    execServerField: "readArgs",
    execClientField: "readResult",
    openAIToolName: "read_file",
    support: "supported",
    safety: "read",
    notes: "Read file contents through Cursor permissions.",
  },
  {
    execServerField: "redactedReadArgs",
    execClientField: "redactedReadResult",
    openAIToolName: "redacted_read_file",
    support: "not-supported",
    safety: "read",
    notes:
      "Same arg/result shape as read, but redaction semantics need live traffic validation.",
  },
  {
    execServerField: "lsArgs",
    execClientField: "lsResult",
    openAIToolName: "list_dir",
    support: "supported",
    safety: "read",
    notes: "List directory tree through Cursor permissions.",
  },
  {
    execServerField: "grepArgs",
    execClientField: "grepResult",
    openAIToolName: "grep",
    support: "supported",
    safety: "read",
    notes: "Search workspace files through Cursor grep.",
  },
  {
    execServerField: "diagnosticsArgs",
    execClientField: "diagnosticsResult",
    openAIToolName: "read_diagnostics",
    support: "not-supported",
    safety: "read",
    notes: "Needs result formatting for diagnostics severity/ranges.",
  },
  {
    execServerField: "shellArgs",
    execClientField: "shellResult",
    openAIToolName: "run_shell",
    support: "policy-gated",
    safety: "destructive",
    notes:
      "Mapped, but exposed only through policy because shell execution can mutate state.",
  },
  {
    execServerField: "shellStreamArgs",
    execClientField: "shellStream",
    openAIToolName: "stream_shell",
    support: "not-supported",
    safety: "destructive",
    notes:
      "Streaming shell requires incremental result forwarding and lifecycle management.",
  },
  {
    execServerField: "backgroundShellSpawnArgs",
    execClientField: "backgroundShellSpawnResult",
    openAIToolName: "spawn_background_shell",
    support: "not-supported",
    safety: "destructive",
    notes: "Requires background process tracking and cleanup.",
  },
  {
    execServerField: "writeShellStdinArgs",
    execClientField: "writeShellStdinResult",
    openAIToolName: "write_shell_stdin",
    support: "not-supported",
    safety: "destructive",
    notes: "Requires pairing to a running shell id.",
  },
  {
    execServerField: "writeArgs",
    execClientField: "writeResult",
    openAIToolName: "write_file",
    support: "policy-gated",
    safety: "mutating",
    notes: "Mapped, but exposed only through policy because it mutates files.",
  },
  {
    execServerField: "writeArgs",
    execClientField: "writeResult",
    openAIToolName: "apply_patch",
    support: "policy-gated",
    safety: "mutating",
    notes:
      "Targeted search/replace edit synthesized from a read + write round trip; returns a unified diff. Policy-gated because it mutates files.",
  },
  {
    execServerField: "deleteArgs",
    execClientField: "deleteResult",
    openAIToolName: "delete_path",
    support: "policy-gated",
    safety: "destructive",
    notes: "Mapped, but exposed only through policy because it deletes files.",
  },
  {
    execServerField: "fetchArgs",
    execClientField: "fetchResult",
    openAIToolName: "fetch_url",
    support: "supported",
    safety: "network",
    notes: "Fetch URL through Cursor network/tool policy.",
  },
  {
    execServerField: "mcpArgs",
    execClientField: "mcpResult",
    openAIToolName: "mcp_tool",
    support: "policy-gated",
    safety: "interactive",
    notes:
      "Mapped, but real MCP auth/approval/result variants need per-provider validation.",
  },
  {
    execServerField: "listMcpResourcesExecArgs",
    execClientField: "listMcpResourcesExecResult",
    openAIToolName: "list_mcp_resources",
    support: "not-supported",
    safety: "interactive",
    notes: "Needs MCP resource result schema formatting.",
  },
  {
    execServerField: "readMcpResourceExecArgs",
    execClientField: "readMcpResourceExecResult",
    openAIToolName: "read_mcp_resource",
    support: "not-supported",
    safety: "interactive",
    notes: "Needs download-path handling and resource payload formatting.",
  },
  {
    execServerField: "mcpStateExecArgs",
    execClientField: "mcpStateExecResult",
    openAIToolName: "mcp_state",
    support: "not-supported",
    safety: "interactive",
    notes: "Needs state-specific result handling.",
  },
  {
    execServerField: "recordScreenArgs",
    execClientField: "recordScreenResult",
    openAIToolName: "record_screen",
    support: "not-supported",
    safety: "interactive",
    notes: "Requires media artifact capture/formatting.",
  },
  {
    execServerField: "computerUseArgs",
    execClientField: "computerUseResult",
    openAIToolName: "computer_use",
    support: "not-supported",
    safety: "interactive",
    notes: "Requires UI input action policy and screenshot/result formatting.",
  },
  {
    execServerField: "executeHookArgs",
    execClientField: "executeHookResult",
    openAIToolName: "execute_hook",
    support: "not-supported",
    safety: "mutating",
    notes: "Requires hook policy and side-effect accounting.",
  },
  {
    execServerField: "subagentArgs",
    execClientField: "subagentResult",
    openAIToolName: "subagent",
    support: "not-supported",
    safety: "subagent",
    notes:
      "Requires subagent lifecycle, model selection, and background handling.",
  },
  {
    execServerField: "forceBackgroundSubagentArgs",
    execClientField: "forceBackgroundSubagentResult",
    openAIToolName: "force_background_subagent",
    support: "not-supported",
    safety: "subagent",
    notes: "Requires existing subagent state.",
  },
  {
    execServerField: "subagentAwaitArgs",
    execClientField: "subagentAwaitResult",
    openAIToolName: "subagent_await",
    support: "not-supported",
    safety: "subagent",
    notes: "Requires existing subagent state.",
  },
  {
    execServerField: "gitDiffRequest",
    execClientField: "gitDiffResponse",
    openAIToolName: "git_diff",
    support: "not-supported",
    safety: "read",
    notes: "Needs aiserver git diff request/result formatting.",
  },
  {
    execServerField: "shellAllowlistPrecheckArgs",
    execClientField: "shellAllowlistPrecheckResult",
    support: "not-supported",
    safety: "internal",
    notes: "Precheck flow for shell tools, not exposed directly to model.",
  },
  {
    execServerField: "mcpAllowlistPrecheckArgs",
    execClientField: "mcpAllowlistPrecheckResult",
    support: "not-supported",
    safety: "internal",
    notes: "Precheck flow for MCP tools, not exposed directly to model.",
  },
  {
    execServerField: "webFetchAllowlistPrecheckArgs",
    execClientField: "webFetchAllowlistPrecheckResult",
    support: "not-supported",
    safety: "internal",
    notes: "Precheck flow for web fetch, not exposed directly to model.",
  },
  {
    execServerField: "smartModeClassifierArgs",
    execClientField: "smartModeClassifierResult",
    support: "not-supported",
    safety: "internal",
    notes: "Classifier/precheck flow, not exposed directly to model.",
  },
  {
    execServerField: "canvasDiagnosticsArgs",
    execClientField: "canvasDiagnosticsResult",
    openAIToolName: "canvas_diagnostics",
    support: "not-supported",
    safety: "read",
    notes: "Needs canvas-specific result formatting.",
  },
  {
    execServerField: "forceBackgroundShellArgs",
    execClientField: "forceBackgroundShellResult",
    support: "not-supported",
    safety: "destructive",
    notes: "Requires existing shell state.",
  },
];

export function supportedOpenAIToolNames(): string[] {
  return CURSOR_TOOL_SURFACE.flatMap((entry) =>
    entry.support === "supported" || entry.support === "policy-gated"
      ? entry.openAIToolName === undefined
        ? []
        : [entry.openAIToolName]
      : [],
  );
}
