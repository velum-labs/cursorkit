# Troubleshooting

For the full set of observed CLI, desktop, model-picker, and proxy lessons, see
`docs/learnings.md`.

## `doctor` Warns About Missing Upstream

Set `CURSOR_UPSTREAM_BASE_URL` before using pass-through traffic. Without it, unknown routes cannot be forwarded.

## Cursor Rejects The Bridge Certificate

The bridge does not install trust silently. Set `BRIDGE_USE_TLS=true` and either provide `BRIDGE_CERT_PATH` plus `BRIDGE_KEY_PATH` or use the generated self-signed development certificate. Trust installation is a manual local action.

For the Cursor desktop app, the certificate must cover `api2.cursor.sh`. Run `cursorkit desktop-cert`, trust the generated certificate manually, then start with the printed `BRIDGE_CERT_PATH` and `BRIDGE_KEY_PATH` values.

## Streaming Hangs

Unknown routes are streamed to upstream. Typed local model routes depend on the OpenAI-compatible backend sending `data:` SSE lines and a `[DONE]` event. Run with `BRIDGE_LOG_LEVEL=debug` and verify the model backend independently.

## Local Model Does Not Appear

Run `cursorkit doctor` and confirm `local models` includes the expected ID. The bridge appends conservative local model capabilities and does not advertise tools, images, agent mode, Cmd-K, plan mode, or sandboxing by default.

For Cursor Agent CLI, run with `BRIDGE_LOG_LEVEL=debug` and confirm `/aiserver.v1.AiService/GetUsableModels` is intercepted. The CLI model picker is populated from this route; seeing only `/aiserver.v1.AiService/AvailableModels` intercepted is not enough.

If `GetUsableModels` is intercepted but the picker still appears empty, decode the response and confirm the local model includes `api_key_credentials.base_url`. Cursor Agent CLI treats this route as a usable model list, not just a display list.

Cursor Agent CLI model routes use raw `application/proto` responses. If a local decoder using `application/connect+proto` works but `cursor-agent --list-models` prints no models, check that the bridge is not wrapping raw CLI responses in Connect envelopes.

The interactive `/model` picker uses picker metadata from `AvailableModels`, not only the flat model list. Local models need named-picker fields such as `named_model_section_index`, `vendor`, and at least one default non-max variant to show up when filtering in interactive mode.

For Cursor desktop app experiments, start with `cursorkit desktop-proxy` and `BRIDGE_LOG_LEVEL=debug`. Confirm the logs contain `desktop route inventory` entries for model and chat routes before adding new interceptors. If the app does not call the same model routes as `cursor-agent`, use the logged route inventory to decode and add typed support from the generated proto.

## Capture Safety

Captured traffic can include prompts, paths, cookies, request IDs, and API keys. Do not commit captures unless fixture validation says `redaction.status=sanitized`.
