# Configuration

Configuration is loaded from environment variables. CLI flags are intentionally minimal for now so startup behavior is easy to audit.

`docs/implementation-inventory.json` contains the generated config inventory
from `src/config.ts`. Run `pnpm baseline:check` before changing config docs or
route policy.

## Core

- `BRIDGE_HOST`: bind host. Defaults to `127.0.0.1`.
- `BRIDGE_PORT`: bind port. Defaults to `9443`.
- `BRIDGE_UNSAFE_ALLOW_NON_LOCALHOST`: required before binding to anything other than `127.0.0.1`, `::1`, or `localhost`.
- `BRIDGE_USE_TLS`: set to `true` to run HTTPS.
- `BRIDGE_CERT_PATH` and `BRIDGE_KEY_PATH`: custom TLS material. Both must be set together.
- `BRIDGE_TLS_HOSTNAMES`: comma-separated hostnames/IPs for generated TLS certificate SANs. Desktop mode defaults to `api2.cursor.sh,api3.cursor.sh,agent.api5.cursor.sh,agentn.api5.cursor.sh,agentn.global.api5.cursor.sh,localhost,127.0.0.1,::1`.
- `BRIDGE_PUBLIC_ORIGIN`: public origin advertised in rewritten server config responses. Desktop mode defaults to `https://api2.cursor.sh`.
- `BRIDGE_AGENT_PUBLIC_ORIGIN`: optional agent-facing origin override for desktop agent compatibility experiments.
- `CURSOR_UPSTREAM_BASE_URL`: upstream Cursor backend base URL for pass-through traffic.
- `CURSOR_UPSTREAM_CONNECT_HOST`: optional physical upstream host/IP to connect to while preserving `CURSOR_UPSTREAM_BASE_URL` for Host and TLS SNI. Use this in desktop proxy mode after redirecting `api2.cursor.sh` to localhost.
- `CURSOR_UPSTREAM_CONNECT_PORT`: optional physical upstream port paired with `CURSOR_UPSTREAM_CONNECT_HOST`.

## Desktop Proxy

- `BRIDGE_DESKTOP_MODE`: enables desktop proxy defaults when set to `true`.
- `BRIDGE_ROUTE_INVENTORY`: logs redacted route metadata for observing Cursor desktop traffic. Desktop mode enables this automatically.
- `BRIDGE_DESKTOP_AGENT_HTTP_PORT`: optional secondary HTTP listener port for desktop agent compatibility experiments.

The `desktop-proxy` CLI command sets desktop defaults without changing the
normal `serve` command. See `docs/cursor-app.md` for certificate, cutover, and
rollback instructions.

## Models

- `MODEL_BASE_URL`: OpenAI-compatible local model endpoint. Defaults to `http://localhost:8080/v1`.
- `MODEL_API_KEY`: optional local model API key.
- `MODEL_NAME`: local model ID exposed to Cursor. Defaults to `local-model`.
- `MODEL_PROVIDER_MODEL`: provider-facing model ID sent to the local backend when different from `MODEL_NAME`.
- `MODEL_CONTEXT_TOKEN_LIMIT`: advertised local context window. Defaults to `128000`.
- `MODEL_REQUEST_TIMEOUT_MS`: optional request deadline for OpenAI-compatible local backend calls.
- `BRIDGE_HARDCODED_RESPONSE`: optional fixed local model response for deterministic experiments.
- `BRIDGE_MODELS_JSON`: JSON array for multiple local models. Each item supports `id`, `displayName`, `providerModel`, `baseUrl`, `apiKey`, `contextTokenLimit`, `requestTimeoutMs`, and `hardcodedResponse`.

## Safety And Diagnostics

- `BRIDGE_FAIL_OPEN`: defaults to `true`. Unknown routes pass through; typed intercept failures return an explicit error after the body has been consumed.
- `BRIDGE_CAPTURE_ENABLED`: defaults to `false`.
- `BRIDGE_CAPTURE_DIR`: defaults to `fixtures/captures`.
- `BRIDGE_LOG_LEVEL`: `debug`, `info`, `warn`, or `error`.
- `BRIDGE_LOG_MODEL_PAYLOADS`: defaults to `summary`; set to `full` only for explicit local debugging.
- `BRIDGE_AGENT_TOOL_POLICY`: defaults to `safe`; set to `all` only to advertise the approved extended local tool set.
- `BRIDGE_PLUGIN_PATH`: future local plugin module path.
- `BRIDGE_MAX_INTERCEPT_BODY_BYTES`: request body limit for typed routes. Defaults to 50 MiB.

Run `cursorkit doctor` after changing config.
