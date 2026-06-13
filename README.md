# cursor-rpc

Unofficial research bridge for experimenting with Cursor's backend protocol from
the server side: keep Cursor's existing UX, but route model inference to a
self-hosted OpenAI-compatible endpoint.

This is personal interoperability research, not a supported Cursor integration.
Read `DISCLAIMER.md` before running it.

## First Run

```bash
pnpm install
pnpm build
pnpm dev -- serve
```

In another terminal:

```bash
pnpm exec tsx src/cli.ts doctor
```

The bridge binds to `127.0.0.1:9443` by default. Set
`CURSOR_UPSTREAM_BASE_URL` before expecting unknown Cursor backend traffic to
pass through to an upstream. See `docs/configuration.md` for all config.

## CLI

```bash
cursor-rpc serve
cursor-rpc doctor
cursor-rpc capture
cursor-rpc fixtures
cursor-rpc --help
```

`serve` starts the local bridge. `doctor` checks proto loading, upstream config,
TLS status, capture status, and local model registration.

## Proto Extraction

The proto extraction logic is vendored in `vendor/extract-cursor-protos`.

```bash
pnpm install
pnpm extract:protos
pnpm proto:inventory
pnpm codegen
```

That refreshes the full default proto files under `proto/` from the installed
Cursor app, regenerates `docs/proto-inventory.md`,
`docs/service-manifest.json`, `docs/type-manifest-summary.json`, and writes
generated TypeScript schemas and service descriptors under `src/gen/`.

The extractor normalizes nested and foreign type references so the full
discovered surface is codegen-valid. It does not hand-maintain a reduced route
slice; runtime interception is still controlled by route policy.
See `docs/refreshing-protos.md` for provenance, custom app paths, and the
fixture workflow required after refreshing.
See `docs/proto-inventory.md` for the generated service inventory.

## Extension Surface

The current typed extension surface is deliberately narrow:

- Unknown routes proxy upstream by default.
- `AvailableModels` can append conservative local model entries.
- `StreamUnifiedChatWithTools` is intercepted only when the selected model is
  registered locally; normal Cursor models pass upstream.

See `docs/plugin-authoring.md` and `examples/` for the experimental local plugin
shape.

## Release Gates

This package remains private and local-only. See `docs/release-gates.md` for the
checks required before sharing a tarball or changing the API stability posture.
