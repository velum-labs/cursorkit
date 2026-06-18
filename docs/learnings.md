# Implementation Learnings

This document captures behavior discovered while making `cursor-rpc` work with
`cursor-agent` and preparing a safe path for the Cursor desktop app. Treat these
as observed implementation notes, not a stable Cursor contract.

## Guiding Rule

Unknown Cursor backend behavior must remain pass-through. A route should become
typed/intercepted only after we know its path, framing, decoded protobuf type,
response shape, and failure behavior. The full generated proto is the schema
source of truth, but the route allowlist is still deliberately narrow.

## Proto And Codegen

- The checked-in `proto/` directory is the default full extracted proto surface.
- Generated TypeScript lives under `src/gen/` and should be regenerated from the
  full proto rather than hand-written or reduced to a slice.
- Runtime interception is not determined by proto presence. It is determined by
  `src/routes.ts` and `docs/route-policy.json`.
- When Cursor version drift breaks decoding, refresh the proto, regenerate
  inventory/codegen, then validate affected routes with real traffic.

## CLI Endpoint Behavior

- `cursor-agent` supports an explicit backend override with `--endpoint`.
- The desktop app has no known supported equivalent of `cursor-agent --endpoint`.
- The CLI and desktop app should be treated as different integration targets,
  even when they share some RPCs.
- ACP (`agent acp`) is available locally and uses newline-delimited JSON-RPC over
  stdio. Endpoint and model options can be passed on the root command before
  `acp`, and the harness now drives
  `initialize`/`authenticate`/`session/new`/`session/prompt` directly.

## Routing The Local Model Backend At A Fusion Gateway

The bridge's local-model backend (`MODEL_BASE_URL`) can point at any
OpenAI-compatible endpoint, including a model-fusion gateway. This has been
verified end to end: real `cursor-agent acp` → this bridge → HandoffKit's Fusion
Harness Gateway → a multi-model fusion run → the synthesized answer streamed
back to `cursor-agent` via `session/update`.

Observed requirements for that flow:

- Start the bridge with `MODEL_BASE_URL=<gateway>/v1`, `MODEL_NAME=<local id>`,
  and `MODEL_PROVIDER_MODEL=<model sent upstream>`. The bridge calls
  `<MODEL_BASE_URL>/chat/completions` with `model = MODEL_PROVIDER_MODEL`.
- Interception only happens when `cursor-agent --model` equals the registered
  local id (`MODEL_NAME`). Other models pass upstream.
- `BRIDGE_HARDCODED_RESPONSE` short-circuits the backend. The `acp`/`traffic`
  harness suites set it, so they prove connectivity and route inventory, not real
  backend content. To prove a real backend (fusion or otherwise) flows through,
  omit `BRIDGE_HARDCODED_RESPONSE`.
- ACP still depends on a logged-in Cursor session. `authenticate` uses
  `methodId: "cursor_login"`; without login the flow is `auth_profile_blocked`,
  not a hard failure.

The gateway side (dialect translation, streaming, fusion synthesis) lives in
HandoffKit. Cursorkit's role is unchanged: intercept the local model route and
proxy it to the configured OpenAI-compatible backend.

## Framing

- Cursor backend RPCs can use Connect envelopes or raw protobuf payloads.
- Cursor Agent model routes have been observed using raw `application/proto`.
- Other routes, including chat streaming paths, can use `application/connect+proto`.
- Interceptors must preserve the incoming framing. If the request came in as raw
  protobuf, the response should be raw protobuf. If it came in as Connect, the
  response should be Connect-framed.
- A route decoder that only works for Connect envelopes can still fail in the CLI
  because the CLI often expects raw protobuf.

## Current Intercepted Routes

The verified allowlist currently includes:

- `/aiserver.v1.AiService/AvailableModels`
- `/aiserver.v1.AiService/GetUsableModels`
- `/aiserver.v1.AiService/GetDefaultModelForCli`
- `/aiserver.v1.AiService/GetDefaultModel`
- `/aiserver.v1.AiService/NameAgent`
- `/aiserver.v1.ServerConfigService/GetServerConfig`
- `/agent.v1.AgentService/RunSSE`
- `/aiserver.v1.BidiService/BidiAppend`
- `/aiserver.v1.ChatService/StreamUnifiedChatWithTools`

Everything else should pass through unchanged unless a plugin explicitly handles
it.

## Model Listing And Picker Behavior

- `--list-models` and the interactive `/model` picker do not rely on exactly the
  same client-side state.
- Seeing a model in `cursor-agent --list-models` does not guarantee it will
  appear in the interactive picker.
- The interactive picker relies on metadata from `AvailableModels`, not only the
  flat usable-model list.
- Local models need conservative picker metadata, including:
  - `clientDisplayName`
  - `inputboxShortModelName`
  - `namedModelSectionIndex`
  - `vendorName` / `vendor`
  - `legacySlugs`
  - `idAliases`
  - at least one default non-max variant
  - `displayNameOutsidePicker`
  - `variantStringRepresentation`
  - `legacySlug`
  - `tooltipData`
  - at least one parameter definition and matching variant parameter value
- The CLI's model picker can be sensitive to punctuation-heavy model IDs. A full
  model ID such as `mlx-community/Qwen3.5-4B-8bit` may fail as a filter while
  partial filters such as `qwen` or `mlx-community` work.
- Use a stable display alias such as `local-qwen` for Cursor-facing display and
  selection, while keeping the real OpenAI-compatible model ID for backend calls.
- The bridge now supports that split directly: `id` is the Cursor-facing id,
  while `providerModel` is the model name sent to the OpenAI-compatible backend.
- The picker can briefly show no matches before its model list settles. E2E tests
  should distinguish "model is listed" from "model is already selected".

## Usable Models

- Cursor Agent reads `/aiserver.v1.AiService/GetUsableModels` for its usable
  model list.
- Local usable-model entries need `apiKeyCredentials.baseUrl`; otherwise the CLI
  can treat the model as unavailable.
- `GetDefaultModelForCli` should preserve an upstream default when available, but
  fall back to the first local model when upstream is absent or unusable.

## Server Config

- Cursor clients can negotiate HTTP/2 over TLS in desktop proxy mode. The bridge
  now starts a TLS HTTP/2 server with `allowHTTP1` for desktop mode, so existing
  HTTP/1 clients and HTTP/2 desktop calls share the same route handlers.
- HTTP/2 requests include pseudo-headers such as `:method` and `:path`. These
  must be stripped before proxying to Node's HTTP/1 upstream client.
- `agentUrlConfig.agentUrl` and `agentUrlConfig.agentnUrl` should point back to
  the bridge origin.
- For desktop proxy mode, the public origin should be `https://api2.cursor.sh`,
  not `https://127.0.0.1:9443`, because the app believes it is talking to the
  real backend host.
- Upstream server config decoding can fail because upstream content/framing can
  be unexpected. The bridge should synthesize a minimal local server config
  rather than making local model routing fail.

## Agent Run Flow

- Cursor Agent opens `/agent.v1.AgentService/RunSSE` for an agent run.
- In observed CLI behavior, actual run request details can arrive through
  `/aiserver.v1.BidiService/BidiAppend`.
- `BidiAppend.data` can contain a hex-encoded `AgentClientMessage` protobuf.
- The bridge tracks pending agent runs by request ID so `RunSSE` can wait for the
  corresponding `BidiAppend` payload.
- Local agent responses use `AgentServerMessage` frames with text deltas followed
  by a turn-ended update.

## Cursor Agent Traffic Probe

- The unified harness `traffic` suite runs real `cursor-agent --list-models` and
  `cursor-agent --print` commands through the bridge with route inventory
  enabled.
- In a Qwen MLX probe, `--list-models` exercised all known model-list routes:
  `/aiserver.v1.AiService/AvailableModels`,
  `/aiserver.v1.AiService/GetUsableModels`, and
  `/aiserver.v1.AiService/GetDefaultModelForCli`.
- A normal `--print` prompt exercised `/agent.v1.AgentService/RunSSE` and
  `/aiserver.v1.BidiService/BidiAppend`; `RunSSE` used Connect protobuf framing
  while `BidiAppend` used raw protobuf framing.
- The CLI also made healthy pass-through calls to dashboard, analytics, and
  `/v1/traces` routes. These should remain pass-through unless a typed
  interceptor has a clear product reason and decoded request/response fixtures.
- Treat pass-through HTTP 200 route inventory as discovery evidence, not a
  failure. Only HTTP error statuses should be reported as failed routes.
- Route reports now include an aggregated `routeSummary` with per-path count,
  method, status, framing, policy, and outcome sets. Prefer this summary over
  scanning duplicate raw log lines.

## Cursor Agent ACP Probe

- The unified harness `acp` suite starts the bridge and drives
  `cursor-agent acp` over JSON-RPC instead of a PTY.
- A verified local run against `mlx-community/Qwen3.5-4B-8bit` on port 8080
  completed `initialize`, `authenticate`, `session/new`, and `session/prompt`,
  then returned `traffic-probe-ok`.
- The ACP prompt exercised the same core local routes as the PTY traffic probe:
  all three known model-list RPCs, `/agent.v1.AgentService/RunSSE`, and
  `/aiserver.v1.BidiService/BidiAppend`.
- ACP is now the preferred structured smoke path for non-interactive agent runs,
  but it does not replace the TUI e2e test for interactive `/model` picker
  behavior.
- ACP carries a much richer agent surface than plain `cursor-agent --print` in
  current probes. A real ACP run sent 59 MCP tool definitions; the plain traffic
  probe sent zero.
- Local agent translation now forwards Cursor-provided selected context, inline
  prompt context, custom system prompts, hook context, and MCP tool metadata into
  the OpenAI-compatible request when those fields are present.
- Live tool execution is not complete yet. Implementing that requires translating
  OpenAI tool calls into `AgentServerMessage` tool-call updates, receiving
  Cursor/client tool results, and continuing the local model loop. Treat
  `agentRunDiagnostics.mcpToolCount > 0` as evidence that tool definitions were
  present, not evidence that the local model can execute tools.

## Chat Flow

- `StreamUnifiedChatWithTools` is intercepted only when the selected model is
  registered locally.
- Non-local model requests should pass upstream.
- Local chat responses stream `StreamUnifiedChatResponseWithTools` messages in
  Connect envelopes.
- The OpenAI-compatible backend must emit `data:` SSE lines and a `[DONE]` event
  for the current parser.

## Upstream Robustness

- Upstream model or server-config payloads can be unavailable, unauthorized, or
  decodable under a different framing than expected.
- Local model availability should not depend on successfully decoding upstream
  model lists. When upstream model decoding fails, merge against an empty local
  response and log a warning.
- Local server config should similarly fall back to a minimal safe config when
  upstream config is unavailable or undecodable.
- Once `api2.cursor.sh` is redirected to localhost for desktop experiments, the
  bridge's own upstream connection can loop back into itself. Desktop mode needs
  a separate physical upstream connection target.
- `CURSOR_UPSTREAM_CONNECT_HOST` and `CURSOR_UPSTREAM_CONNECT_PORT` allow the
  bridge to connect to a real upstream address while preserving Host and TLS SNI
  from `CURSOR_UPSTREAM_BASE_URL`.

## Desktop App Proxy

- The desktop app path is not the CLI path. Start with route observation, not
  guessed interceptors.
- Desktop proxy mode makes the bridge present itself as Cursor backend hosts
  locally. Observed desktop resource traffic can use `api3.cursor.sh`, while
  model/agent backend defaults still use `api2.cursor.sh`.
- The local certificate must include `api2.cursor.sh` and `api3.cursor.sh` in
  the SAN list.
- The CLI should never silently edit `/etc/hosts`, install trust, or install
  `pf` rules. It should print commands and leave privileged changes to the user.
- `ck` is the safe launcher path for desktop testing. It owns only the bridge
  child process and an isolated Cursor profile under `.cursor-rpc/ck/`.
- `ck` now uses a first-class local HTTP CONNECT proxy for isolated desktop
  launches. Cursor is launched with `--proxy-server=http://127.0.0.1:<proxyPort>`.
  CONNECT requests for Cursor backend hosts are tunneled into the bridge; other
  hosts pass through normally.
- The CONNECT proxy path was validated to route desktop startup, auth,
  telemetry, model-list, default-model, dashboard, MCP discovery, and normal
  pass-through traffic through the bridge without privileged system changes.
- `--host-resolver-rules` is still useful historical context and a fallback
  primitive, but it is no longer the preferred isolated `ck` path.
- Chromium `--host-resolver-rules` can map ports, e.g.
  `MAP api2.cursor.sh 127.0.0.1:<bridgePort>`. This fixes renderer traffic for
  isolated non-privileged launches; a host-only mapping silently leaves HTTPS on
  port 443 and misses an unprivileged bridge.
- Agent execution in current desktop builds should be tested through the CONNECT
  proxy path first. The old renderer-only route-resolver failure is solved for
  observed desktop traffic; the remaining harness gap is reliable programmatic
  submission into Cursor's Monaco-backed Agent composer.
- `NODE_OPTIONS=--require` was tested as a non-privileged extension-host hook
  path and did not load in Cursor/Electron helper processes. Do not rely on it
  for desktop Agent routing.
- Browser login redirects are handled by macOS through Cursor's registered URL
  handler, and that callback does not necessarily preserve the isolated
  `--user-data-dir` flags. If an isolated `ck` window stays on the login screen
  after browser confirmation, use `ck --use-default-profile` to reuse existing
  Cursor auth state for the routing test.
- Desktop app testing should distinguish backend routing from picker
  visibility. `ck test` watches route inventory and reports whether any desktop
  traffic, and specifically the known model-list RPCs, reached the bridge.
  `desktop-ui-experimental` verifies the real model picker through CDP.
- `ck route`, `ck route status`, and `ck route rollback` are the non-mutating
  operator workflow for the manual routing fallback. They print/check commands
  but do not run `sudo`, trust certs, edit `/etc/hosts`, configure `pf`, or kill
  Cursor.
- Run `ck route` before redirecting `api2.cursor.sh` so the current real upstream
  address can be captured for `CURSOR_UPSTREAM_CONNECT_HOST`. Once DNS points to
  localhost, automatic upstream detection is no longer reliable.
- `ck --debug-port` and the `desktop-ui-experimental` harness suite provide a
  real Cursor desktop app automation surface through Chromium CDP. This works for
  isolated profiles; default-profile launches may attach to an existing Cursor
  process and ignore the new debug port.
- `ck --seed-auth-from-default` seeds only `cursorAuth/*` rows from the logged-in
  default Cursor profile into the isolated test profile. This gets the isolated
  CDP run past login without copying the whole profile.
- The desktop model picker is settings-backed in observed builds. Opening the
  picker did not issue a fresh model-list request through renderer HTTP; renderer
  resource timing showed WorkOS assets and `api3.cursor.sh` telemetry, while the
  picker contents came from cached profile state.
- Simply appending to `availableDefaultModels2` is not enough. The model also
  needs to be activated in settings state, including `aiSettings.userAddedModels`
  and visibility/fallback model lists. This matches the Settings UI behavior
  where models can be toggled on before appearing in the picker.
- The strict desktop UI probe now waits for Cursor to initialize the isolated
  profile, merges the local model additively into the settings-backed model
  state, reloads the workbench, dismisses safe onboarding prompts, opens a new
  Agent composer, clicks the active model picker trigger, and asserts both the
  local model and built-in Cursor models are visible.
- A desktop cutover needs:
  - trusted local cert for `api2.cursor.sh`
  - local routing of `api2.cursor.sh:443` to the bridge
  - a non-looping upstream connect target
  - route inventory logging enabled
- Rollback should be known before testing: quit Cursor, stop the bridge, remove
  the hosts entry, disable any redirect, then reopen Cursor.

## Route Inventory

- Desktop mode enables redacted route inventory logs automatically.
- Route inventory records metadata only:
  - method
  - path
  - content type
  - status
  - framing
  - route policy
  - handling outcome
- It must not capture bodies by default. Bodies can include prompts, file paths,
  cookies, tokens, and workspace data.

## Security And Safety

- Bind to localhost by default.
- Require `BRIDGE_UNSAFE_ALLOW_NON_LOCALHOST=true` before binding to a
  non-localhost host.
- Do not commit `.cursor-rpc/`, generated certs, keys, captures, or unsanitized
  traffic.
- Redact authorization, cookies, API keys, and token-like query values in logs.
- Prefer explicit local-only docs over convenience automation for privileged
  networking and trust-store changes.

## Testing Lessons

- `pnpm check` should remain the baseline: TypeScript build, unit/integration
  tests, and formatting.
- `pnpm e2e:cursor-agent` catches real CLI regressions that unit tests miss,
  especially picker state and framing behavior.
- The e2e harness should tolerate the model already being selected, because the
  TUI footer and picker state can differ.
- Regression tests now cover:
  - desktop config defaults
  - generated cert SANs
  - route inventory metadata
  - upstream connect host preserving Host and SNI
  - malformed upstream model payload fallback
  - malformed upstream server config fallback
  - HTTPS typed model and chat interception
  - harness suite expansion for ACP
  - route inventory aggregation for report artifacts
  - agent-run context injection into local OpenAI-compatible requests
  - `ck` debug-port and isolated instance launch planning
  - isolated Cursor auth seeding from default profile `cursorAuth/*` rows
  - strict desktop model picker CDP automation

## Known Unknowns

- The desktop app's full model-picker and chat route set is not yet verified.
- The desktop app may use routes beyond the current CLI-derived allowlist.
- More app-specific model metadata may be required after observing real desktop
  traffic.
- HTTP/2 and ALPN behavior for the desktop app should be observed before adding
  HTTP/2 support.
- `StreamUnifiedChatWithToolsSSE` remains a route to capture before enabling any
  typed behavior around it.
