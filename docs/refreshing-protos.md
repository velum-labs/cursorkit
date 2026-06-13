# Refreshing Protos

This repo vendors the proto extraction logic under `vendor/extract-cursor-protos`.
The checked-in `proto/` directory is the full extracted proto surface used for
endpoint visibility, runtime decoding, and TypeScript codegen. When Cursor
version drift breaks the bridge, refresh from the installed Cursor app and
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
pnpm install
pnpm extract:protos
```

That command runs:

```bash
cd vendor/extract-cursor-protos
go run . /Applications/Cursor.app ../../proto
```

The output path is the default proto directory used by the project:

```text
proto/
```

The current extraction is summarized in `docs/proto-inventory.md`. Regenerate
the inventory, manifests, and TypeScript code after extraction:

```bash
pnpm proto:inventory
pnpm codegen
```

The Cursor bundle exposes runtime descriptors with package and type names, but
not original `.proto` file metadata. Some descriptors include foreign package
references and nested names that would create invalid protoc import cycles if
written one-file-per-package. The extractor therefore normalizes the full
discovered graph for codegen: nested types are flattened, foreign message shapes
are copied into the consuming package with provenance comments, and service
paths keep their source package names.

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
3. Run `pnpm proto:inventory`.
4. Run `pnpm codegen`.
5. Update `fixtures/` and `docs/protocol.md`.
6. Update bridge routing or translation code only after fixtures prove the field tags
   and streaming event order.

Do not assume a generated proto is sufficient by itself. Cursor’s server
expectations also include headers, Connect envelope framing, endpoint selection,
and version-specific streaming behavior.
