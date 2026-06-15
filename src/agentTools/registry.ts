import type { ServerResponse } from "node:http";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import { encodeEnvelope } from "../connectEnvelope.js";
import type { AgentToolPolicy } from "../config.js";
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
import { toolEnabledByPolicy } from "./policy.js";
import {
  agentExecClientMessageFields,
  type CursorToolError,
  formatCursorToolError,
  formatCursorToolResult,
} from "./results.js";
import { CURSOR_TOOL_SURFACE } from "./surface.js";
export { cursorOpenAITools } from "./schemas.js";
export { agentExecClientMessageFields } from "./results.js";

export interface CursorToolRuntime {
  logger: Logger;
  nextAgentExecId: number;
  config: {
    agentToolPolicy: AgentToolPolicy;
    toolResultTimeoutMs?: number;
  };
}

interface CursorToolExecutionOptions {
  signal?: AbortSignal;
}

type OpenAIToolArgumentType = "string" | "integer" | "boolean" | "object";

interface OpenAIToolArgumentSchema {
  properties: Record<string, OpenAIToolArgumentType>;
  required: string[];
  nonEmpty?: string[];
}

const TOOL_ARGUMENT_SCHEMAS = {
  read_file: {
    properties: { path: "string", offset: "integer", limit: "integer" },
    required: ["path"],
    nonEmpty: ["path"],
  },
  list_dir: {
    properties: { path: "string" },
    required: ["path"],
    nonEmpty: ["path"],
  },
  grep: {
    properties: {
      pattern: "string",
      path: "string",
      glob: "string",
      head_limit: "integer",
    },
    required: ["pattern"],
    nonEmpty: ["pattern"],
  },
  run_shell: {
    properties: {
      command: "string",
      working_directory: "string",
      timeout: "integer",
      description: "string",
    },
    required: ["command"],
    nonEmpty: ["command"],
  },
  write_file: {
    properties: {
      path: "string",
      content: "string",
      return_file_content_after_write: "boolean",
    },
    required: ["path", "content"],
    nonEmpty: ["path"],
  },
  delete_path: {
    properties: { path: "string" },
    required: ["path"],
    nonEmpty: ["path"],
  },
  fetch_url: {
    properties: { url: "string" },
    required: ["url"],
    nonEmpty: ["url"],
  },
  mcp_tool: {
    properties: {
      provider_identifier: "string",
      tool_name: "string",
      name: "string",
      arguments: "object",
    },
    required: ["provider_identifier", "tool_name"],
    nonEmpty: ["provider_identifier", "tool_name"],
  },
} satisfies Record<string, OpenAIToolArgumentSchema>;

type SupportedOpenAIToolName = keyof typeof TOOL_ARGUMENT_SCHEMAS;

export type CursorToolValidationResult =
  | {
      ok: true;
      name: SupportedOpenAIToolName;
      args: Record<string, unknown>;
    }
  | { ok: false; error: CursorToolError };

export async function executeCursorToolCall(
  response: ServerResponse,
  runtime: CursorToolRuntime,
  payloads: AsyncIterator<Buffer>,
  toolCall: OpenAIToolCall,
  options: CursorToolExecutionOptions = {},
): Promise<string> {
  const validation = validateCursorToolCall(
    toolCall,
    runtime.config.agentToolPolicy,
  );
  if (!validation.ok) {
    runtime.logger.warn("rejected cursor tool call", {
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      errorCode: validation.error.code,
      details: validation.error.details,
    });
    return formatCursorToolError(validation.error);
  }

  const parsedArgs = validation.args;
  const execId = `cursor-rpc-tool-${toolCall.id}`;
  const id = runtime.nextAgentExecId;
  runtime.nextAgentExecId += 1;
  const execServerMessage = cursorToolCallToExecServerMessage(
    id,
    execId,
    validation.name,
    toolCall.id,
    parsedArgs,
  );
  if (execServerMessage === undefined) {
    return formatCursorToolError({
      code: "unsupported_tool",
      toolName: toolCall.function.name,
      toolCallId: toolCall.id,
      message: `Unsupported tool call: ${toolCall.function.name}`,
    });
  }

  runtime.logger.info("requested cursor tool execution", {
    id,
    execId,
    toolCallId: toolCall.id,
    toolName: validation.name,
    toolArgsSummary: summarizeToolArgs(parsedArgs),
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

  let result: Awaited<ReturnType<typeof waitForCursorToolResult>>;
  try {
    result = await waitForCursorToolResult(
      payloads,
      id,
      execId,
      runtime.config.toolResultTimeoutMs ?? 120_000,
      options.signal,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return formatCursorToolError({
      code: "tool_result_timeout",
      toolName: validation.name,
      toolCallId: toolCall.id,
      message,
    });
  }
  runtime.logger.info("received cursor tool result", {
    id,
    execId,
    fields: agentExecClientMessageFields(result),
  });
  return formatCursorToolResult(result);
}

export function validateCursorToolCall(
  toolCall: OpenAIToolCall,
  policy: AgentToolPolicy,
): CursorToolValidationResult {
  const name = toolCall.function.name;
  const schema = toolArgumentSchemaFor(name);
  const surfaceEntry = CURSOR_TOOL_SURFACE.find(
    (entry) => entry.openAIToolName === name,
  );
  if (schema === undefined || surfaceEntry === undefined) {
    return {
      ok: false,
      error: {
        code: "unsupported_tool",
        toolName: name,
        toolCallId: toolCall.id,
        message: `Unsupported tool call: ${name}`,
      },
    };
  }
  if (!toolEnabledByPolicy(surfaceEntry, policy)) {
    return {
      ok: false,
      error: {
        code: "tool_not_enabled",
        toolName: name,
        toolCallId: toolCall.id,
        message: `Tool ${name} is not enabled by the current Cursor tool policy.`,
      },
    };
  }

  const parsed = parseToolArguments(toolCall);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: "invalid_tool_arguments",
        toolName: name,
        toolCallId: toolCall.id,
        message: parsed.message,
      },
    };
  }

  const details = validateToolArguments(parsed.args, schema);
  if (details.length > 0) {
    return {
      ok: false,
      error: {
        code: "invalid_tool_arguments",
        toolName: name,
        toolCallId: toolCall.id,
        message: `Invalid arguments for ${name}.`,
        details,
      },
    };
  }

  return { ok: true, name: name as SupportedOpenAIToolName, args: parsed.args };
}

export function cursorToolCallToExecServerMessage(
  id: number,
  execId: string,
  name: SupportedOpenAIToolName,
  toolCallId: string,
  args: Record<string, unknown>,
): ReturnType<typeof create<typeof ExecServerMessageSchema>> | undefined {
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
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<
  NonNullable<
    ReturnType<
      typeof fromBinary<typeof AgentClientMessageSchema>
    >["execClientMessage"]
  >
> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted === true) {
      throw new Error(`Aborted waiting for Cursor tool result ${execId}`);
    }
    const remainingMs = Math.max(1, timeoutMs - (Date.now() - started));
    const next = await Promise.race([
      payloads.next(),
      new Promise<{ done: true; value?: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true }), remainingMs),
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

export function summarizeToolArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      summary[key] = { type: "string", chars: value.length };
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      summary[key] = value;
      continue;
    }
    if (value !== null && typeof value === "object") {
      summary[key] = {
        type: Array.isArray(value) ? "array" : "object",
        keys: Array.isArray(value) ? value.length : Object.keys(value).sort(),
      };
      continue;
    }
    summary[key] = value;
  }
  return summary;
}

function parseToolArguments(
  toolCall: OpenAIToolCall,
):
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; message: string } {
  try {
    const parsed = JSON.parse(toolCall.function.arguments) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {
        ok: false,
        message: "Tool arguments must be a JSON object.",
      };
    }
    return { ok: true, args: parsed as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `Tool arguments are not valid JSON: ${message}`,
    };
  }
}

function toolArgumentSchemaFor(
  name: string,
): OpenAIToolArgumentSchema | undefined {
  if (Object.hasOwn(TOOL_ARGUMENT_SCHEMAS, name)) {
    return TOOL_ARGUMENT_SCHEMAS[name as SupportedOpenAIToolName];
  }
  return undefined;
}

function validateToolArguments(
  args: Record<string, unknown>,
  schema: OpenAIToolArgumentSchema,
): string[] {
  const details: string[] = [];
  for (const key of Object.keys(args)) {
    if (!Object.hasOwn(schema.properties, key)) {
      details.push(`Unknown argument "${key}".`);
    }
  }
  for (const key of schema.required) {
    if (args[key] === undefined) {
      details.push(`Missing required argument "${key}".`);
    }
  }
  for (const [key, expectedType] of Object.entries(schema.properties)) {
    const value = args[key];
    if (value === undefined) {
      continue;
    }
    if (!valueMatchesToolArgumentType(value, expectedType)) {
      details.push(
        `Argument "${key}" must be ${toolArgumentTypeDescription(expectedType)}.`,
      );
      continue;
    }
    if (
      schema.nonEmpty?.includes(key) === true &&
      typeof value === "string" &&
      value.trim().length === 0
    ) {
      details.push(`Argument "${key}" must not be empty.`);
    }
  }
  return details;
}

function valueMatchesToolArgumentType(
  value: unknown,
  type: OpenAIToolArgumentType,
): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return (
        value !== null && typeof value === "object" && !Array.isArray(value)
      );
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

function toolArgumentTypeDescription(type: OpenAIToolArgumentType): string {
  switch (type) {
    case "string":
      return "a string";
    case "integer":
      return "an integer";
    case "boolean":
      return "a boolean";
    case "object":
      return "an object";
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
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
