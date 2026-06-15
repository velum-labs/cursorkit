import type { ServerResponse } from "node:http";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import { encodeEnvelope } from "../connectEnvelope.js";
import {
  AgentClientMessageSchema,
  AgentServerMessageSchema,
  DeleteArgsSchema,
  ExecServerMessageSchema,
  FetchArgsSchema,
  GoogleProtobuf_ListValueSchema,
  GoogleProtobuf_StructSchema,
  GoogleProtobuf_ValueSchema,
  type GoogleProtobuf_Value,
  GrepArgsSchema,
  LsArgsSchema,
  McpArgsSchema,
  ReadArgsSchema,
  ShellArgsSchema,
  WriteArgsSchema,
} from "../gen/agent/v1/agent_pb.js";
import type { Logger } from "../logger.js";
import type { OpenAIToolCall } from "../providers/openai.js";
import {
  agentExecClientMessageFields,
  formatCursorToolResult,
} from "./results.js";
export { cursorOpenAITools } from "./schemas.js";
export { agentExecClientMessageFields } from "./results.js";

export interface CursorToolRuntime {
  logger: Logger;
  nextAgentExecId: number;
}

export async function executeCursorToolCall(
  response: ServerResponse,
  runtime: CursorToolRuntime,
  payloads: AsyncIterator<Buffer>,
  toolCall: OpenAIToolCall,
): Promise<string> {
  const parsedArgs = parseToolArguments(toolCall);
  const execId = `cursor-rpc-tool-${toolCall.id}`;
  const id = runtime.nextAgentExecId;
  runtime.nextAgentExecId += 1;
  const execServerMessage = cursorToolCallToExecServerMessage(
    id,
    execId,
    toolCall,
    parsedArgs,
  );
  if (execServerMessage === undefined) {
    return `Unsupported tool call: ${toolCall.function.name}`;
  }

  runtime.logger.info("requested cursor tool execution", {
    id,
    execId,
    toolCallId: toolCall.id,
    toolName: toolCall.function.name,
    toolArgs: parsedArgs,
  });
  response.write(
    encodeEnvelope(
      toBinary(
        AgentServerMessageSchema,
        create(AgentServerMessageSchema, {
          execServerMessage,
        }),
      ),
    ),
  );

  const result = await waitForCursorToolResult(payloads, id, execId);
  runtime.logger.info("received cursor tool result", {
    id,
    execId,
    fields: agentExecClientMessageFields(result),
  });
  return formatCursorToolResult(result);
}

function cursorToolCallToExecServerMessage(
  id: number,
  execId: string,
  toolCall: OpenAIToolCall,
  args: Record<string, unknown>,
): ReturnType<typeof create<typeof ExecServerMessageSchema>> | undefined {
  const name = normalizeToolName(toolCall.function.name);
  const toolCallId = toolCall.id;
  if (name === "read_file") {
    return create(ExecServerMessageSchema, {
      id,
      execId,
      readArgs: create(ReadArgsSchema, {
        path: stringArg(args, "path"),
        toolCallId,
        offset: numberArg(args, "offset"),
        limit: numberArg(args, "limit"),
      }),
    });
  }
  if (name === "list_dir") {
    return create(ExecServerMessageSchema, {
      id,
      execId,
      lsArgs: create(LsArgsSchema, {
        path: stringArg(args, "path"),
        ignore: [],
        toolCallId,
      }),
    });
  }
  if (name === "grep") {
    return create(ExecServerMessageSchema, {
      id,
      execId,
      grepArgs: create(GrepArgsSchema, {
        pattern: stringArg(args, "pattern"),
        path: optionalStringArg(args, "path"),
        glob: optionalStringArg(args, "glob"),
        headLimit: numberArg(args, "head_limit"),
        toolCallId,
      }),
    });
  }
  if (name === "run_shell") {
    const command = stringArg(args, "command");
    return create(ExecServerMessageSchema, {
      id,
      execId,
      shellArgs: create(ShellArgsSchema, {
        command,
        workingDirectory: optionalStringArg(args, "working_directory") ?? "",
        timeout: numberArg(args, "timeout") ?? 60_000,
        toolCallId,
        simpleCommands: shellSimpleCommands(command),
        hasInputRedirect: /<\s*\S/.test(command),
        hasOutputRedirect: />\s*\S/.test(command),
        isBackground: false,
        skipApproval: false,
        closeStdin: true,
        description: optionalStringArg(args, "description"),
      }),
    });
  }
  if (name === "write_file") {
    return create(ExecServerMessageSchema, {
      id,
      execId,
      writeArgs: create(WriteArgsSchema, {
        path: stringArg(args, "path"),
        fileText: stringArg(args, "content"),
        toolCallId,
        returnFileContentAfterWrite:
          booleanArg(args, "return_file_content_after_write") ?? true,
      }),
    });
  }
  if (name === "delete_path") {
    return create(ExecServerMessageSchema, {
      id,
      execId,
      deleteArgs: create(DeleteArgsSchema, {
        path: stringArg(args, "path"),
        toolCallId,
      }),
    });
  }
  if (name === "fetch_url") {
    return create(ExecServerMessageSchema, {
      id,
      execId,
      fetchArgs: create(FetchArgsSchema, {
        url: stringArg(args, "url"),
        toolCallId,
      }),
    });
  }
  if (name === "mcp_tool") {
    const toolName = stringArg(args, "tool_name");
    const providerIdentifier = stringArg(args, "provider_identifier");
    return create(ExecServerMessageSchema, {
      id,
      execId,
      mcpArgs: create(McpArgsSchema, {
        name: optionalStringArg(args, "name") ?? toolName,
        toolName,
        providerIdentifier,
        args: jsonObjectToProtoValueMap(args.arguments),
        toolCallId,
        smartModeApprovalOnly: false,
        skipApproval: false,
      }),
    });
  }
  return undefined;
}

async function waitForCursorToolResult(
  payloads: AsyncIterator<Buffer>,
  id: number,
  execId: string,
): Promise<
  NonNullable<
    ReturnType<
      typeof fromBinary<typeof AgentClientMessageSchema>
    >["execClientMessage"]
  >
> {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    const next = await Promise.race([
      payloads.next(),
      new Promise<{ done: true; value?: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true }), 120_000),
      ),
    ]);
    if (next.done === true || next.value === undefined) {
      break;
    }
    let message: ReturnType<typeof fromBinary<typeof AgentClientMessageSchema>>;
    try {
      message = fromBinary(AgentClientMessageSchema, next.value);
    } catch {
      continue;
    }
    const execMessage = message.execClientMessage;
    if (execMessage === undefined) {
      continue;
    }
    if (execMessage.id === id || execMessage.execId === execId) {
      return execMessage;
    }
  }
  throw new Error(`Timed out waiting for Cursor tool result ${execId}`);
}

function parseToolArguments(toolCall: OpenAIToolCall): Record<string, unknown> {
  try {
    const parsed = JSON.parse(toolCall.function.arguments) as unknown;
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function normalizeToolName(name: string): string {
  const normalized = name.replace(/[-\s]/g, "_").toLowerCase();
  if (["readfile", "read_file", "read"].includes(normalized)) {
    return "read_file";
  }
  if (["ls", "list", "list_dir", "list_directory"].includes(normalized)) {
    return "list_dir";
  }
  if (["grep", "search"].includes(normalized)) {
    return "grep";
  }
  return normalized;
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

function optionalStringArg(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = stringArg(args, key);
  return value.length > 0 ? value : undefined;
}

function numberArg(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function booleanArg(
  args: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}

function shellSimpleCommands(command: string): string[] {
  return command
    .split(/[;&|]+/)
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((part) => part !== undefined && part.length > 0);
}

function jsonObjectToProtoValueMap(
  value: unknown,
): Record<string, GoogleProtobuf_Value> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, GoogleProtobuf_Value> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = jsonToProtoValue(entry);
  }
  return result;
}

function jsonToProtoValue(value: unknown): GoogleProtobuf_Value {
  if (value === null) {
    return create(GoogleProtobuf_ValueSchema, { nullValue: 0 });
  }
  if (typeof value === "number") {
    return create(GoogleProtobuf_ValueSchema, { numberValue: value });
  }
  if (typeof value === "string") {
    return create(GoogleProtobuf_ValueSchema, { stringValue: value });
  }
  if (typeof value === "boolean") {
    return create(GoogleProtobuf_ValueSchema, { boolValue: value });
  }
  if (Array.isArray(value)) {
    return create(GoogleProtobuf_ValueSchema, {
      listValue: create(GoogleProtobuf_ListValueSchema, {
        values: value.map((item) => jsonToProtoValue(item)),
      }),
    });
  }
  if (typeof value === "object") {
    return create(GoogleProtobuf_ValueSchema, {
      structValue: create(GoogleProtobuf_StructSchema, {
        fields: jsonObjectToProtoValueMap(value),
      }),
    });
  }
  return create(GoogleProtobuf_ValueSchema, { stringValue: String(value) });
}
