import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import {
  cursorOpenAITools,
  cursorToolCallToExecServerMessage,
  summarizeToolArgs,
  validateCursorToolCall,
} from "../src/agentTools/registry.js";
import { formatCursorToolResult } from "../src/agentTools/results.js";
import type { CursorToolError } from "../src/agentTools/results.js";
import {
  DeleteRejectedSchema,
  DeleteResultSchema,
  ExecClientMessageSchema,
  FetchErrorSchema,
  FetchResultSchema,
  GrepErrorSchema,
  GrepResultSchema,
  LsResultSchema,
  LsTimeoutSchema,
  McpRejectedSchema,
  McpResultSchema,
  ReadResultSchema,
  ReadSuccessSchema,
  ShellFailureSchema,
  ShellRejectedSchema,
  ShellResultSchema,
  ShellSuccessSchema,
  ShellTimeoutSchema,
} from "../src/gen/agent/v1/agent_pb.js";
import type { OpenAIToolCall } from "../src/providers/openai.js";

describe("Cursor agent tool runtime", () => {
  it("advertises only safe tools unless all-policy tools are enabled", () => {
    expect(toolNames("safe")).toEqual([
      "read_file",
      "list_dir",
      "grep",
      "fetch_url",
    ]);
    expect(toolNames("all")).toEqual([
      "read_file",
      "list_dir",
      "grep",
      "run_shell",
      "write_file",
      "apply_patch",
      "delete_path",
      "fetch_url",
      "mcp_tool",
    ]);
    expect(toolNames("all")).not.toContain("stream_shell");
    expect(toolNames("all")).not.toContain("read_diagnostics");
    expect(toolNames("all")).not.toContain("git_diff");
    expect(toolNames("all")).not.toContain("subagent");
  });

  it("maps safe OpenAI tool names to Cursor ExecServerMessage fields", () => {
    expect(mappedField("read_file", { path: "README.md" }, "safe")).toEqual({
      field: "readArgs",
      value: expect.objectContaining({
        path: "README.md",
        toolCallId: "call-read_file",
      }),
    });
    expect(mappedField("list_dir", { path: "." }, "safe")).toEqual({
      field: "lsArgs",
      value: expect.objectContaining({
        path: ".",
        toolCallId: "call-list_dir",
      }),
    });
    expect(
      mappedField(
        "grep",
        { pattern: "bridge", path: ".", glob: "*.ts", head_limit: 5 },
        "safe",
      ),
    ).toEqual({
      field: "grepArgs",
      value: expect.objectContaining({
        pattern: "bridge",
        path: ".",
        glob: "*.ts",
        headLimit: 5,
        toolCallId: "call-grep",
      }),
    });
    expect(
      mappedField("fetch_url", { url: "https://example.com" }, "safe"),
    ).toEqual({
      field: "fetchArgs",
      value: expect.objectContaining({
        url: "https://example.com",
        toolCallId: "call-fetch_url",
      }),
    });
  });

  it("maps all-policy OpenAI tool names to Cursor ExecServerMessage fields", () => {
    expect(
      mappedField(
        "run_shell",
        { command: "echo hello", working_directory: "/repo", timeout: 10 },
        "all",
      ),
    ).toEqual({
      field: "shellArgs",
      value: expect.objectContaining({
        command: "echo hello",
        workingDirectory: "/repo",
        timeout: 10,
        toolCallId: "call-run_shell",
      }),
    });
    expect(
      mappedField("write_file", { path: "out.txt", content: "" }, "all"),
    ).toEqual({
      field: "writeArgs",
      value: expect.objectContaining({
        path: "out.txt",
        fileText: "",
        toolCallId: "call-write_file",
      }),
    });
    expect(mappedField("delete_path", { path: "old.txt" }, "all")).toEqual({
      field: "deleteArgs",
      value: expect.objectContaining({
        path: "old.txt",
        toolCallId: "call-delete_path",
      }),
    });
    expect(
      mappedField(
        "mcp_tool",
        {
          provider_identifier: "cursor",
          tool_name: "sample_tool",
          arguments: { query: "hello" },
        },
        "all",
      ),
    ).toEqual({
      field: "mcpArgs",
      value: expect.objectContaining({
        providerIdentifier: "cursor",
        toolName: "sample_tool",
        toolCallId: "call-mcp_tool",
      }),
    });
  });

  it("rejects invalid arguments before Cursor exec mapping", () => {
    expect(validationError(toolCallRaw("read_file", "{"), "safe")).toEqual(
      expect.objectContaining({ code: "invalid_tool_arguments" }),
    );
    expect(validationError(toolCall("read_file", {}), "safe")).toEqual(
      expect.objectContaining({
        code: "invalid_tool_arguments",
        details: ['Missing required argument "path".'],
      }),
    );
    expect(
      validationError(toolCall("read_file", { path: 42 }), "safe"),
    ).toEqual(
      expect.objectContaining({
        code: "invalid_tool_arguments",
        details: ['Argument "path" must be a string.'],
      }),
    );
    expect(
      validationError(
        toolCall("read_file", { path: "README.md", extra: true }),
        "safe",
      ),
    ).toEqual(
      expect.objectContaining({
        code: "invalid_tool_arguments",
        details: ['Unknown argument "extra".'],
      }),
    );
    expect(
      validationError(toolCall("run_shell", { command: "" }), "all"),
    ).toEqual(
      expect.objectContaining({
        code: "invalid_tool_arguments",
        details: ['Argument "command" must not be empty.'],
      }),
    );
  });

  it("rejects unsupported and policy-disabled tools", () => {
    expect(
      validationError(toolCall("run_shell", { command: "echo hello" }), "safe"),
    ).toEqual(expect.objectContaining({ code: "tool_not_enabled" }));
    expect(validationError(toolCall("git_diff", {}), "all")).toEqual(
      expect.objectContaining({ code: "unsupported_tool" }),
    );
    expect(validationError(toolCall("subagent", {}), "all")).toEqual(
      expect.objectContaining({ code: "unsupported_tool" }),
    );
    expect(validationError(toolCall("unknown_tool", {}), "all")).toEqual(
      expect.objectContaining({ code: "unsupported_tool" }),
    );
  });

  it("normalizes success, error, rejection, and timeout result variants", () => {
    expect(
      parsedResult(
        create(ExecClientMessageSchema, {
          readResult: create(ReadResultSchema, {
            success: create(ReadSuccessSchema, { content: "read-ok" }),
          }),
        }),
      ),
    ).toMatchObject({
      status: "success",
      variant: "success",
      result: { content: "read-ok" },
    });
    expect(
      parsedResult(
        create(ExecClientMessageSchema, {
          shellResult: create(ShellResultSchema, {
            failure: create(ShellFailureSchema, {
              command: "false",
              workingDirectory: "/repo",
              exitCode: 1,
              stdout: "",
              stderr: "failed",
            }),
          }),
        }),
      ),
    ).toMatchObject({
      status: "error",
      variant: "failure",
      result: { command: "false", stderr: "failed" },
    });
    expect(
      parsedResult(
        create(ExecClientMessageSchema, {
          grepResult: create(GrepResultSchema, {
            error: create(GrepErrorSchema, { error: "grep failed" }),
          }),
        }),
      ),
    ).toMatchObject({
      status: "error",
      variant: "error",
      result: { error: "grep failed" },
    });
    expect(
      parsedResult(
        create(ExecClientMessageSchema, {
          shellResult: create(ShellResultSchema, {
            rejected: create(ShellRejectedSchema, {
              command: "rm -rf tmp",
              reason: "not approved",
            }),
          }),
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      variant: "rejected",
      result: { command: "rm -rf tmp", reason: "not approved" },
    });
    expect(
      parsedResult(
        create(ExecClientMessageSchema, {
          lsResult: create(LsResultSchema, {
            timeout: create(LsTimeoutSchema),
          }),
        }),
      ),
    ).toMatchObject({ status: "timeout", variant: "timeout" });
    expect(
      parsedResult(
        create(ExecClientMessageSchema, {
          fetchResult: create(FetchResultSchema, {
            error: create(FetchErrorSchema, {
              url: "https://example.com",
              error: "network denied",
            }),
          }),
        }),
      ),
    ).toMatchObject({
      status: "error",
      variant: "error",
      result: { error: "network denied" },
    });
    expect(
      parsedResult(
        create(ExecClientMessageSchema, {
          deleteResult: create(DeleteResultSchema, {
            rejected: create(DeleteRejectedSchema, {
              path: "old.txt",
              reason: "not approved",
            }),
          }),
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      variant: "rejected",
      result: { path: "old.txt", reason: "not approved" },
    });
    expect(
      parsedResult(
        create(ExecClientMessageSchema, {
          mcpResult: create(McpResultSchema, {
            rejected: create(McpRejectedSchema, {
              reason: "auth required",
              isReadonly: true,
            }),
          }),
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      variant: "rejected",
      result: { reason: "auth required", isReadonly: true },
    });
    expect(
      parsedResult(
        create(ExecClientMessageSchema, {
          shellResult: create(ShellResultSchema, {
            timeout: create(ShellTimeoutSchema, {
              command: "sleep 10",
              timeoutMs: 1000,
            }),
          }),
        }),
      ),
    ).toMatchObject({
      status: "timeout",
      variant: "timeout",
      result: { command: "sleep 10", timeoutMs: 1000 },
    });
    expect(
      parsedResult(
        create(ExecClientMessageSchema, {
          shellResult: create(ShellResultSchema, {
            success: create(ShellSuccessSchema, {
              command: "echo ok",
              exitCode: 0,
              stdout: "ok\n",
            }),
          }),
        }),
      ),
    ).toMatchObject({
      status: "success",
      variant: "success",
      result: { command: "echo ok", stdout: "ok\n" },
    });
  });

  it("summarizes tool arguments without logging raw string values", () => {
    expect(
      summarizeToolArgs({
        path: "/Users/example/secret.txt",
        command: "cat ~/.ssh/id_rsa",
        timeout: 1000,
        arguments: { query: "sensitive prompt" },
      }),
    ).toEqual({
      path: { type: "string", chars: 25 },
      command: { type: "string", chars: 17 },
      timeout: 1000,
      arguments: { type: "object", keys: ["query"] },
    });
  });
});

function toolNames(policy: "safe" | "all"): string[] {
  return cursorOpenAITools(policy).map((tool) => tool.function.name);
}

function mappedField(
  name: string,
  args: Record<string, unknown>,
  policy: "safe" | "all",
): { field: string; value: unknown } {
  const validation = validateCursorToolCall(toolCall(name, args), policy);
  expect(validation.ok).toBe(true);
  if (!validation.ok) {
    throw new Error("expected valid tool call");
  }
  const message = cursorToolCallToExecServerMessage(
    2,
    "exec-2",
    validation.name,
    `call-${name}`,
    validation.args,
  );
  expect(message).toBeDefined();
  if (message === undefined) {
    throw new Error("expected mapped tool call");
  }
  for (const field of [
    "readArgs",
    "lsArgs",
    "grepArgs",
    "shellArgs",
    "writeArgs",
    "deleteArgs",
    "fetchArgs",
    "mcpArgs",
  ]) {
    const value = (message as unknown as Record<string, unknown>)[field];
    if (value !== undefined) {
      return { field, value };
    }
  }
  throw new Error("expected an exec server field");
}

function validationError(
  toolCall: OpenAIToolCall,
  policy: "safe" | "all",
): CursorToolError {
  const validation = validateCursorToolCall(toolCall, policy);
  expect(validation.ok).toBe(false);
  if (validation.ok) {
    throw new Error("expected validation error");
  }
  return validation.error;
}

function parsedResult(
  message: Parameters<typeof formatCursorToolResult>[0],
): Record<string, unknown> {
  return JSON.parse(formatCursorToolResult(message)) as Record<string, unknown>;
}

function toolCall(name: string, args: Record<string, unknown>): OpenAIToolCall {
  return toolCallRaw(name, JSON.stringify(args));
}

function toolCallRaw(name: string, args: string): OpenAIToolCall {
  return {
    id: `call-${name}`,
    type: "function",
    function: { name, arguments: args },
  };
}
