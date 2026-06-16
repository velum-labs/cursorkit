# Model Fusion Protocol Consumption

`fusionkit` remains the model-fusion contract and IDL origin. Cursorkit should
consume stable generated artifacts from that origin instead of copying contract
shapes across repositories. This repo keeps a narrow compatibility mirror only
for the Cursor adapter seam until those packages are published.

## Package targets

- TypeScript consumers should depend on `@velum/model-fusion-protocol` from npm
  or GitHub Packages once fusionkit publishes it.
- Python consumers need a private PyPI-compatible path. Preferred options are
  Cloudsmith, CodeArtifact, or Gemfury. Short-term fallback options are GitHub
  Releases wheels or `uv` git dependencies; GitHub Packages alone is not enough
  for Python package consumption.

## JSON records vs service IDL

- JSON Schema remains the persisted audit format for records such as
  `cursor-run-request.v1`, `cursor-run-result.v1`, `harness-run-request.v1`, and
  `harness-run-result.v1`.
- Protobuf/Buf IDL is for service and transport boundaries. It should carry
  validated JSON records across services rather than replacing those persisted
  audit records.

## Service boundaries

The minimum model-fusion protocol surface is:

- `HarnessExecutorService`: fusionkit to handoffkit coding-task execution.
- `CursorHarnessService`: fusionkit to cursorkit adapter output.
- `MlxProviderService`: provider capability and model-call metadata.
- Benchmark execution/join envelopes: fusionkit benchmark orchestration and eval
  joins.

This repo implements only the cursorkit-relevant `CursorHarnessService` mirror in
`proto/model_fusion/v1/cursor_harness.proto`. The generated TypeScript binding is
checked in at `src/gen/model_fusion/v1/cursor_harness_pb.ts`.

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

When `@velum/model-fusion-protocol` and the Python wheel are available, replace
local contract mirrors with package imports and keep this check as the guard that
the consumed package version, generated bindings, and JSON schema bundle hash
agree.
