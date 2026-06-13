# Observed Protocol

This document records the transport assumptions that the bridge is allowed to rely on. Unknown or unverified behavior must stay on the byte-preserving pass-through path.

## Current Verified Surface

- The default proto files are package-preserving outputs under `proto/`.
- `docs/service-manifest.json` and `docs/type-manifest-summary.json` are generated from the full default proto files.
- Runtime interception is allowlisted in `src/routes.ts`.
- The initial interceptable routes are:
  - `/aiserver.v1.AiService/AvailableModels`
  - `/aiserver.v1.ChatService/StreamUnifiedChatWithTools`

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
