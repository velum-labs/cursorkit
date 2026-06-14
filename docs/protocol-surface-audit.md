# Protocol Surface Audit

The repo has the full generated Cursor proto, but runtime coverage is still a
small allowlist. This file separates schema visibility from implemented mod
surface.

## Implemented Interceptors

- Model discovery:
  `/aiserver.v1.AiService/AvailableModels`,
  `/aiserver.v1.AiService/GetUsableModels`,
  `/aiserver.v1.AiService/GetDefaultModelForCli`
- Session naming/config:
  `/aiserver.v1.AiService/NameAgent`,
  `/aiserver.v1.ServerConfigService/GetServerConfig`
- Agent run path:
  `/agent.v1.AgentService/RunSSE`,
  `/aiserver.v1.BidiService/BidiAppend`
- Chat path:
  `/aiserver.v1.ChatService/StreamUnifiedChatWithTools`

Everything else is byte-preserving pass-through unless a plugin explicitly owns a
route.

## High-Value Gaps

- `agent.v1.AgentService/Run` and `RunPoll`: alternative agent transports. The
  current bridge only handles the `RunSSE` plus `BidiAppend` flow observed in
  CLI/ACP traffic.
- `agent.v1.ControlService/*`: filesystem, shell, diff, artifact, skill reload,
  and plugin reload APIs. This is the major missing surface for local models to
  truly use Cursor tools.
- `agent.v1.AgentServerMessage` tool-call updates: the generated proto has
  `ToolCallStartedUpdate`, `ToolCallDeltaUpdate`, `ToolCallCompletedUpdate`, and
  many concrete tool-call messages. Local OpenAI tool calls need to be translated
  into these messages, then resumed with client tool results.
- `ChatService/StreamUnifiedChatWithToolsSSE`: visible in the proto but not yet
  captured with fixtures. It should stay pass-through until framing and response
  shape are verified.
- Desktop model picker routes: current desktop traffic has not reached the bridge
  without manual routing. Do not guess desktop-specific routes until
  route-inventory logs prove them.
- Dashboard/plugin/skills routes: observed as healthy pass-through in CLI/ACP
  traffic. These are likely extension-management surfaces, but should not be
  intercepted without decoded fixtures and a product reason.

## Current Context/Tool State

The previous local agent implementation forwarded only
`UserMessage.text` to the OpenAI-compatible backend. That made local runs appear
to lack repository context and tool access.

The bridge now forwards already-materialized context when Cursor sends it:

- custom system prompt
- user selected files/code/terminal/context snippets
- hook context
- inline prompt-context tree nodes
- MCP tool names/descriptions as metadata

The bridge also logs `local agent run diagnostics` with body-free counts for
context, MCP tools, and injected context messages. Real traffic currently shows:

- `cursor-agent --print`: no MCP tools and no context in the probe.
- `cursor-agent acp`: 59 MCP tool definitions and one injected context/tool
  metadata message in the probe.

This is not full tool execution. Full tool support needs a loop:

1. Send OpenAI-compatible `tools` definitions for Cursor/MCP tools.
2. Parse streaming `tool_calls` from the local model.
3. Emit Cursor `AgentServerMessage` tool-call started/delta/completed updates.
4. Receive the client-side tool result through the agent protocol.
5. Continue the local model conversation with tool results.

## Desktop Test State

`desktop-ui-experimental` now launches an isolated Cursor app with a Chromium
remote debugging port and captures renderer DOM text through CDP. On this
machine, isolated CDP works and reaches the real Cursor workbench renderer, but
the isolated profile stops at login, so model-picker assertions are blocked by
auth state.

Default-profile launches can reuse auth, but may attach to an already-running
Cursor process and ignore a new debug port. A fully automated picker test needs a
logged-in debuggable profile or a reliable isolated-profile auth flow.
