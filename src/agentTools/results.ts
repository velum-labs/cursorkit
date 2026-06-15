import { fromBinary } from "@bufbuild/protobuf";

import { AgentClientMessageSchema } from "../gen/agent/v1/agent_pb.js";

type ExecClientMessage = NonNullable<
  ReturnType<
    typeof fromBinary<typeof AgentClientMessageSchema>
  >["execClientMessage"]
>;

export interface CursorToolError {
  code:
    | "invalid_tool_arguments"
    | "tool_not_enabled"
    | "unsupported_tool"
    | "tool_result_timeout";
  toolName: string;
  toolCallId: string;
  message: string;
  details?: string[];
}

export function formatCursorToolResult(message: ExecClientMessage): string {
  for (const value of [
    message.readResult,
    message.lsResult,
    message.grepResult,
    message.shellResult,
    message.writeResult,
    message.deleteResult,
    message.fetchResult,
    message.mcpResult,
  ]) {
    if (value === undefined) {
      continue;
    }
    return JSON.stringify(normalizeToolResult(value), null, 2);
  }
  return JSON.stringify(
    {
      status: "unknown",
      variant: "exec_client_message",
      result: summarizeToolResult(message),
    },
    null,
    2,
  );
}

export function formatCursorToolError(error: CursorToolError): string {
  return JSON.stringify(
    {
      status: "error",
      error_code: error.code,
      tool_name: error.toolName,
      tool_call_id: error.toolCallId,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
    null,
    2,
  );
}

export function agentExecClientMessageFields(
  message: ExecClientMessage,
): string[] {
  return [
    ["shellResult", message.shellResult],
    ["writeResult", message.writeResult],
    ["deleteResult", message.deleteResult],
    ["grepResult", message.grepResult],
    ["readResult", message.readResult],
    ["lsResult", message.lsResult],
    ["diagnosticsResult", message.diagnosticsResult],
    ["requestContextResult", message.requestContextResult],
    ["mcpResult", message.mcpResult],
    ["shellStream", message.shellStream],
    ["mcpStateExecResult", message.mcpStateExecResult],
    ["fetchResult", message.fetchResult],
    ["gitDiffResponse", message.gitDiffResponse],
  ]
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name as string);
}

function normalizeToolResult(value: unknown): unknown {
  const variant = toolResultVariant(value);
  if (variant === undefined) {
    return {
      status: "unknown",
      variant: "unknown",
      result: summarizeToolResult(value),
    };
  }
  const status =
    variant.name === "success" && mcpSuccessIsError(variant.value)
      ? "error"
      : variant.status;
  return {
    status,
    variant: variant.name,
    result: summarizeToolResult(variant.value),
  };
}

function toolResultVariant(value: unknown):
  | {
      name: string;
      status: "success" | "error" | "rejected" | "timeout";
      value: unknown;
    }
  | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const [name, status] of [
    ["success", "success"],
    ["failure", "error"],
    ["error", "error"],
    ["timeout", "timeout"],
    ["rejected", "rejected"],
    ["spawnError", "error"],
    ["permissionDenied", "rejected"],
    ["fileNotFound", "error"],
    ["notFile", "error"],
    ["fileBusy", "error"],
  ] as const) {
    const variantValue = record[name];
    if (variantValue !== undefined) {
      return { name, status, value: variantValue };
    }
  }
  return undefined;
}

function mcpSuccessIsError(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { isError?: unknown }).isError === true
  );
}

function summarizeToolResult(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((entry) => summarizeToolResult(entry));
  }
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return typeof value === "string" ? value.slice(0, 20_000) : value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "$typeName") {
      continue;
    }
    result[key] = summarizeToolResult(entry);
  }
  return result;
}
