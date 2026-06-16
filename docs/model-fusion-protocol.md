# Model Fusion Protocol Consumption

`fusionkit` remains the model-fusion contract origin. For v1, JSON Schema is the
source of truth for durable audit and benchmark records, and OpenAPI 3.1 is the
source of truth for HTTP/JSON service APIs. Cursorkit should consume stable
generated artifacts from fusionkit instead of copying contract shapes across
repositories. This repo keeps a narrow OpenAPI compatibility mirror only for the
Cursor adapter seam until those packages are published.

## Package targets

- TypeScript consumers should depend on `@velum/model-fusion-protocol` from npm
  or GitHub Packages once fusionkit publishes it.
- Python consumers need a private PyPI-compatible path. Preferred options are
  Cloudsmith, CodeArtifact, or Gemfury. Short-term fallback options are GitHub
  Releases wheels or `uv` git dependencies; GitHub Packages alone is not enough
  for Python package consumption.

## Durable records vs service APIs

- JSON Schema remains the persisted audit and benchmark record format for records
  such as
  `cursor-run-request.v1`, `cursor-run-result.v1`, `harness-run-request.v1`, and
  `harness-run-result.v1`.
- OpenAPI 3.1 describes the v1 HTTP/JSON service surfaces and should reference
  or embed those JSON Schema record contracts.
- Service/API clients and request/response models should be generated from
  OpenAPI specs. The TypeScript package should use generated OpenAPI
  client/types, for example `openapi-typescript` paired with `openapi-fetch`.
  Python should use generated OpenAPI client/models, for example
  `openapi-python-client`.
- Durable record validators and record types should be generated from the JSON
  Schema bundle. Python packages should expose JSON Schema/Pydantic validators,
  for example via `datamodel-code-generator` where appropriate.
- Protobuf/Buf is reserved for later internal streaming, Connect, or gRPC paths
  if a service boundary hardens. It is not required for v1 package or HTTP/JSON
  consumption in cursorkit.

## Service boundaries

The minimum model-fusion protocol surface is:

- `HarnessExecutorService`: fusionkit to handoffkit coding-task execution.
- `CursorHarnessHttpApi`: fusionkit to cursorkit adapter output over HTTP/JSON.
- `MlxProviderService`: provider capability and model-call metadata.
- Benchmark execution/join envelopes: fusionkit benchmark orchestration and eval
  joins.

This repo implements only the cursorkit-relevant Cursor harness OpenAPI
compatibility mirror in `docs/model-fusion-cursor-harness.openapi.yaml`.
Fusionkit should own the canonical OpenAPI 3.1 source and generated SDK package.
The local mirror exists so cursorkit can review the HTTP/JSON seam without
blocking on a published package.

The local OpenAPI mirror generates TypeScript request/response types at
`src/gen/model_fusion/cursor_harness_openapi.ts` using `openapi-typescript`.
This is a temporary consumer-side compatibility artifact, not a replacement for
the fusionkit-owned generated protocol package. Cursorkit's local JSON record
validators remain temporary fixture validators with schema-bundle provenance
until fusionkit publishes generated JSON Schema validators/types.

## Drift checks

Run:

```bash
corepack pnpm model-fusion:protocol:check
```

The check verifies:

- the local schema bundle hash matches
  `docs/model-fusion-protocol-origin.json`;
- committed model-fusion JSON fixtures use the same schema bundle hash;
- the Cursor harness OpenAPI 3.1 compatibility mirror exists and exposes
  `POST /model-fusion/v1/cursor-harness:run`;
- `corepack pnpm model-fusion:openapi:check` regenerates the OpenAPI TypeScript
  artifact and fails if it drifts;
- the Python packaging plan remains documented until fusionkit publishes a
  private PyPI-compatible wheel.
- the docs state the corrected v1 decision: JSON Schema for durable records,
  OpenAPI 3.1 for HTTP/JSON APIs, and protobuf/Buf future-facing only.

When `@velum/model-fusion-protocol` and the Python wheel are available, replace
local contract mirrors with generated package imports and keep this check as the
guard that the consumed package version, OpenAPI/JSON Schema contracts, and JSON
schema bundle hash agree.

## Follow-up outside cursorkit

These items belong in fusionkit or the shared release infrastructure, not in this
PR:

- move the canonical Cursor harness OpenAPI 3.1 source into fusionkit-owned
  protocol source;
- publish `@velum/model-fusion-protocol` for TypeScript consumers;
- publish `velum-model-fusion-protocol` wheels through a private
  PyPI-compatible index, or use GitHub Releases wheels plus `uv` git dependencies
  as a short-term bridge;
- generate TypeScript OpenAPI client/types with `openapi-typescript` plus
  `openapi-fetch` from fusionkit OpenAPI contracts;
- generate TypeScript durable-record validators/types from the fusionkit JSON
  Schema bundle;
- generate Python OpenAPI client/models and JSON Schema/Pydantic validators from
  fusionkit contracts;
- publish JSON Schema bundle metadata with generated packages so consumers can
  verify schema bundle hashes instead of copying validators by hand.
