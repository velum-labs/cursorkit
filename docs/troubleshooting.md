# Troubleshooting

## `doctor` Warns About Missing Upstream

Set `CURSOR_UPSTREAM_BASE_URL` before using pass-through traffic. Without it, unknown routes cannot be forwarded.

## Cursor Rejects The Bridge Certificate

The bridge does not install trust silently. Set `BRIDGE_USE_TLS=true` and either provide `BRIDGE_CERT_PATH` plus `BRIDGE_KEY_PATH` or use the generated self-signed development certificate. Trust installation is a manual local action.

## Streaming Hangs

Unknown routes are streamed to upstream. Typed local model routes depend on the OpenAI-compatible backend sending `data:` SSE lines and a `[DONE]` event. Run with `BRIDGE_LOG_LEVEL=debug` and verify the model backend independently.

## Local Model Does Not Appear

Run `cursor-rpc doctor` and confirm `local models` includes the expected ID. The bridge appends conservative local model capabilities and does not advertise tools, images, agent mode, Cmd-K, plan mode, or sandboxing by default.

## Capture Safety

Captured traffic can include prompts, paths, cookies, request IDs, and API keys. Do not commit captures unless fixture validation says `redaction.status=sanitized`.
