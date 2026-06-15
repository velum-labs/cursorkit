import type { AgentToolPolicy } from "../config.js";
import type { OpenAIToolDefinition } from "../providers/openai.js";
import { toolEnabledByPolicy } from "./policy.js";
import { CURSOR_TOOL_SURFACE } from "./surface.js";

export function cursorOpenAITools(
  policy: AgentToolPolicy,
): OpenAIToolDefinition[] {
  return CURSOR_TOOL_SURFACE.filter((entry) =>
    toolEnabledByPolicy(entry, policy),
  ).flatMap((entry) => {
    switch (entry.openAIToolName) {
      case "read_file":
        return [
          tool(
            "read_file",
            "Read a file from the Cursor workspace using Cursor's native file tool.",
            {
              path: { type: "string" },
              offset: { type: "integer" },
              limit: { type: "integer" },
            },
            ["path"],
          ),
        ];
      case "list_dir":
        return [
          tool(
            "list_dir",
            "List a directory from the Cursor workspace using Cursor's native ls tool.",
            { path: { type: "string" } },
            ["path"],
          ),
        ];
      case "grep":
        return [
          tool(
            "grep",
            "Search workspace files using Cursor's native grep tool.",
            {
              pattern: { type: "string" },
              path: { type: "string" },
              glob: { type: "string" },
              head_limit: { type: "integer" },
            },
            ["pattern"],
          ),
        ];
      case "run_shell":
        return [
          tool(
            "run_shell",
            "Run a shell command through Cursor's native shell tool. Cursor handles permissions and approval.",
            {
              command: { type: "string" },
              working_directory: { type: "string" },
              timeout: { type: "integer" },
              description: { type: "string" },
            },
            ["command"],
          ),
        ];
      case "write_file":
        return [
          tool(
            "write_file",
            "Write a file through Cursor's native write tool. Cursor handles permissions and approval.",
            {
              path: { type: "string" },
              content: { type: "string" },
              return_file_content_after_write: { type: "boolean" },
            },
            ["path", "content"],
          ),
        ];
      case "delete_path":
        return [
          tool(
            "delete_path",
            "Delete a path through Cursor's native delete tool. Cursor handles permissions and approval.",
            { path: { type: "string" } },
            ["path"],
          ),
        ];
      case "fetch_url":
        return [
          tool(
            "fetch_url",
            "Fetch a URL through Cursor's native fetch tool.",
            { url: { type: "string" } },
            ["url"],
          ),
        ];
      case "mcp_tool":
        return [
          tool(
            "mcp_tool",
            "Call an MCP tool through Cursor's native MCP execution path.",
            {
              provider_identifier: { type: "string" },
              tool_name: { type: "string" },
              name: { type: "string" },
              arguments: { type: "object" },
            },
            ["provider_identifier", "tool_name"],
          ),
        ];
      default:
        return [];
    }
  });
}

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): OpenAIToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}
