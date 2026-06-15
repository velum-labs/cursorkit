import { fromBinary } from "@bufbuild/protobuf";

import { AgentClientMessageSchema } from "../gen/agent/v1/agent_pb.js";

type ExecClientMessage = NonNullable<
  ReturnType<
    typeof fromBinary<typeof AgentClientMessageSchema>
  >["execClientMessage"]
>;

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
    if ("success" in value && value.success !== undefined) {
      const success = value.success as { content?: unknown };
      if (typeof success.content === "string") {
        return success.content;
      }
    }
    return JSON.stringify(summarizeToolResult(value), null, 2);
  }
  return JSON.stringify(summarizeToolResult(message), null, 2);
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
