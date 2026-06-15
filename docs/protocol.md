# Observed Protocol

This document records the transport assumptions that the bridge is allowed to rely on. Unknown or unverified behavior must stay on the byte-preserving pass-through path.

See `docs/learnings.md` for the broader set of implementation observations,
debugging lessons, and known unknowns behind these protocol rules.
See `docs/protocol-surface-audit.md` for the gap analysis between the full proto
surface and the routes currently implemented by the bridge. The generated
baseline files `docs/route-contract-manifest.json`,
`docs/implementation-inventory.json`, `docs/test-manifest.json`, and
`docs/release-summary.json` are checked by `pnpm baseline:check`.

## Current Verified Surface

- The default proto files are package-preserving outputs under `proto/`.
- `docs/service-manifest.json` and `docs/type-manifest-summary.json` are generated from the full default proto files.
- Runtime interception is allowlisted in `src/routes.ts`.
- The route/proto contract manifest is generated from `docs/service-manifest.json`, `src/routes.ts`, and `src/config.ts`.
- Cursor Agent CLI model-listing RPCs use raw `application/proto` framing, not Connect envelopes. Model interceptors must preserve the incoming protobuf framing.
- The current interceptable routes are:
  - `/aiserver.v1.AiService/AvailableModels`
  - `/aiserver.v1.AiService/GetUsableModels`
  - `/aiserver.v1.AiService/GetDefaultModelForCli`
  - `/aiserver.v1.AiService/GetDefaultModel`
  - `/aiserver.v1.AiService/NameAgent`
  - `/aiserver.v1.ServerConfigService/GetServerConfig`
  - `/auth/full_stripe_profile`
  - `/auth/stripe_profile`
  - `/agent.v1.AgentService/Run`
  - `/agent.v1.AgentService/RunSSE`
  - `/aiserver.v1.BidiService/BidiAppend`
  - `/aiserver.v1.ChatService/StreamUnifiedChatWithTools`
  - `/aiserver.v1.AnalyticsService/UploadIssueTrace`
- Cursor desktop app support is observe-first. Desktop mode enables redacted route inventory logging, but it does not add desktop-only interceptors until traffic proves the exact RPC and framing.

## Transport Behavior To Capture

Before enabling additional typed routes, capture and sanitize:

- HTTP version and ALPN.
- TLS, SNI, Host, and certificate expectations.
- Exact endpoint path and query strings.
- Request and response content types.
- Connect envelope flags, compressed-frame behavior, and end-stream metadata.
- Response streaming behavior and whether first bytes arrive before the full response is buffered.
- Request abort behavior and upstream cancellation.
- Trailer or trailer-like metadata.
- SSE behavior for `StreamUnifiedChatWithToolsSSE`.

## Default Policy

Every route starts as pass-through-only. A route can become interceptable only when a sanitized fixture proves its method path, body envelope, decoded message type, response shape, and failure behavior.
