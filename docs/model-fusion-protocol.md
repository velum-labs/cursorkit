# Model Fusion Protocol Consumption

`fusionkit` remains the model-fusion contract and IDL origin. Protobuf/Buf is the
source of truth for service and SDK boundaries; OpenAPI must be generated from
that IDL rather than hand-authored in consumers. Cursorkit should consume stable
generated artifacts from fusionkit instead of copying contract shapes across
repositories. This repo keeps a narrow compatibility mirror only for the Cursor
adapter seam until those packages are published.

## Package targets

- TypeScript consumers should depend on `@velum/model-fusion-protocol` from npm
  or GitHub Packages once fusionkit publishes it.
- Python consumers need a private PyPI-compatible path. Preferred options are
  Cloudsmith, CodeArtifact, or Gemfury. Short-term fallback options are GitHub
  Releases wheels or `uv` git dependencies; GitHub Packages alone is not enough
  for Python package consumption.

## JSON records vs service IDL

- JSON Schema remains the persisted audit and benchmark record format for records
  such as
  `cursor-run-request.v1`, `cursor-run-result.v1`, `harness-run-request.v1`, and
  `harness-run-result.v1`.
- Protobuf/Buf IDL is the source of truth for service, transport, and generated
  SDK boundaries. It should carry validated JSON records across services rather
  than replacing those persisted audit records.
- OpenAPI, when needed, must be generated from the protobuf/Buf source of truth.
  Do not hand-author OpenAPI for model-fusion protocol boundaries in cursorkit.

## Service boundaries

The minimum model-fusion protocol surface is:

- `HarnessExecutorService`: fusionkit to handoffkit coding-task execution.
- `CursorHarnessService`: fusionkit to cursorkit adapter output.
- `MlxProviderService`: provider capability and model-call metadata.
- Benchmark execution/join envelopes: fusionkit benchmark orchestration and eval
  joins.

This repo implements only the cursorkit-relevant `CursorHarnessService`
compatibility mirror in `proto/model_fusion/v1/cursor_harness.proto`. Fusionkit
should own the canonical source proto. The generated TypeScript binding is
checked in at `src/gen/model_fusion/v1/cursor_harness_pb.ts` so cursorkit has a
typed seam until it can import the package generated from fusionkit.

## Drift checks

Run:

```bash
corepack pnpm model-fusion:protocol:check
```

The check verifies:

- the local schema bundle hash matches
  `docs/model-fusion-protocol-origin.json`;
- committed model-fusion JSON fixtures use the same schema bundle hash;
- the Cursor harness proto and generated TypeScript binding exist and expose
  `model_fusion.v1.CursorHarnessService`;
- the Python packaging plan remains documented until fusionkit publishes a
  private PyPI-compatible wheel.
- the docs state the canonical .proto/OpenAPI decision: Buf/protobuf is source of
  truth and OpenAPI is generated-only.

When `@velum/model-fusion-protocol` and the Python wheel are available, replace
local contract mirrors with package imports and keep this check as the guard that
the consumed package version, generated bindings, and JSON schema bundle hash
agree.

## Follow-up outside cursorkit

These items belong in fusionkit or the shared release infrastructure, not in this
PR:

- move the canonical `model_fusion.v1.CursorHarnessService` proto into
  fusionkit-owned protocol source;
- publish `@velum/model-fusion-protocol` for TypeScript consumers;
- publish `velum-model-fusion-protocol` wheels through a private
  PyPI-compatible index, or use GitHub Releases wheels plus `uv` git dependencies
  as a short-term bridge;
- generate OpenAPI from protobuf/Buf IDL in fusionkit if REST documentation or
  clients are needed;
- publish JSON Schema bundle metadata with generated packages so consumers can
  verify schema bundle hashes instead of copying validators by hand.
