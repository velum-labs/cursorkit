# Refreshing Protos

This repo vendors the proto extraction logic under `vendor/extract-cursor-protos`.
The checked-in `proto/aiserver/v1/aiserver.proto` is currently a focused,
hand-trimmed slice used by the bridge implementation. When Cursor version drift
breaks the bridge, refresh from the installed Cursor app and then re-trim or
update the runtime code against captured fixtures.

## Source

The extractor was vendored from the public research repository
`unkn0wncode/extract-cursor-protos`, tree
`1932c41e1e53adc8b118fe73cfe462828682a802`. See
`vendor/extract-cursor-protos/UPSTREAM.md`.

No upstream license file was present when vendored, so keep attribution intact
and treat the code as experimental research material.

## Refresh Stable Cursor

```bash
npm install
npm run extract:protos
```

That command runs:

```bash
cd vendor/extract-cursor-protos
go run . /Applications/Cursor.app ../../proto
```

The output path is:

```text
proto/aiserver/v1/aiserver.proto
```

## Refresh Cursor Nightly Or A Custom App Path

```bash
cd vendor/extract-cursor-protos
go run . "/Applications/Cursor Nightly.app" ../../proto
```

The extractor treats app paths containing `nightly` as Nightly builds and uses
the upstream Nightly compatibility path.

## After Refreshing

1. Capture real Cursor traffic again for `AvailableModels` and
   `StreamUnifiedChatWithTools`.
2. Decode the captures with the refreshed proto.
3. Update `fixtures/` and `docs/protocol.md`.
4. Update the bridge translation code only after fixtures prove the field tags
   and streaming event order.

Do not assume a generated proto is sufficient by itself. Cursor’s server
expectations also include headers, Connect envelope framing, endpoint selection,
and version-specific streaming behavior.
