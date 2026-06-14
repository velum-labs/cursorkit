# Configuration

Configuration is loaded from environment variables. CLI flags are intentionally minimal for now so startup behavior is easy to audit.

## Core

- `BRIDGE_HOST`: bind host. Defaults to `127.0.0.1`.
- `BRIDGE_PORT`: bind port. Defaults to `9443`.
- `BRIDGE_UNSAFE_ALLOW_NON_LOCALHOST`: required before binding to anything other than `127.0.0.1`, `::1`, or `localhost`.
- `BRIDGE_USE_TLS`: set to `true` to run HTTPS.
- `BRIDGE_CERT_PATH` and `BRIDGE_KEY_PATH`: custom TLS material. Both must be set together.
- `BRIDGE_TLS_HOSTNAMES`: comma-separated hostnames/IPs for generated TLS certificate SANs. Desktop mode defaults to `api2.cursor.sh,localhost,127.0.0.1,::1`.
- `BRIDGE_PUBLIC_ORIGIN`: public origin advertised in rewritten server config responses. Desktop mode defaults to `https://api2.cursor.sh`.
- `CURSOR_UPSTREAM_BASE_URL`: upstream Cursor backend base URL for pass-through traffic.
- `CURSOR_UPSTREAM_CONNECT_HOST`: optional physical upstream host/IP to connect to while preserving `CURSOR_UPSTREAM_BASE_URL` for Host and TLS SNI. Use this in desktop proxy mode after redirecting `api2.cursor.sh` to localhost.
- `CURSOR_UPSTREAM_CONNECT_PORT`: optional physical upstream port paired with `CURSOR_UPSTREAM_CONNECT_HOST`.

## Desktop Proxy

- `BRIDGE_DESKTOP_MODE`: enables desktop proxy defaults when set to `true`.
- `BRIDGE_ROUTE_INVENTORY`: logs redacted route metadata for observing Cursor desktop traffic. Desktop mode enables this automatically.

The `desktop-proxy` CLI command sets desktop defaults without changing the
normal `serve` command. See `docs/cursor-app.md` for certificate, cutover, and
rollback instructions.

## Models

- `MODEL_BASE_URL`: OpenAI-compatible local model endpoint. Defaults to `http://localhost:8080/v1`.
- `MODEL_API_KEY`: optional local model API key.
- `MODEL_NAME`: local model ID exposed to Cursor. Defaults to `local-model`.
- `MODEL_CONTEXT_TOKEN_LIMIT`: advertised local context window. Defaults to `128000`.
- `BRIDGE_MODELS_JSON`: JSON array for multiple local models. Each item supports `id`, `displayName`, `baseUrl`, `apiKey`, `contextTokenLimit`, and `hardcodedResponse`.

## Safety And Diagnostics

- `BRIDGE_FAIL_OPEN`: defaults to `true`. Unknown routes pass through; typed intercept failures return an explicit error after the body has been consumed.
- `BRIDGE_CAPTURE_ENABLED`: defaults to `false`.
- `BRIDGE_CAPTURE_DIR`: defaults to `fixtures/captures`.
- `BRIDGE_LOG_LEVEL`: `debug`, `info`, `warn`, or `error`.
- `BRIDGE_PLUGIN_PATH`: future local plugin module path.
- `BRIDGE_MAX_INTERCEPT_BODY_BYTES`: request body limit for typed routes. Defaults to 50 MiB.

Run `cursor-rpc doctor` after changing config.
