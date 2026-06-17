# Model Fusion Protocol Consumption

`fusionkit` remains the model-fusion contract origin. For v1, JSON Schema is the
source of truth for durable audit and benchmark records, and OpenAPI 3.1 is the
source of truth for HTTP/JSON service APIs. Cursorkit should consume stable
generated artifacts from fusionkit instead of copying contract shapes across
repositories. Cursorkit consumes the published
`@velum-labs/model-fusion-protocol` package and verifies its protocol metadata
against the local schema-bundle pin.

## Package targets

- TypeScript consumers should depend on `@velum-labs/model-fusion-protocol` from
  GitHub Packages. Cursorkit pins version `0.1.0` as a dev dependency and checks
  its `protocol-package.json` metadata.
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

Cursorkit does not own the v1 model-fusion OpenAPI source. Fusionkit owns the
canonical OpenAPI 3.1 source and generated SDK package. Cursorkit consumes the
published package for protocol metadata and keeps fixture-only local validators
with schema-bundle provenance until the runtime adapter is switched to generated
package imports.

## Published package consumption

`@velum-labs/model-fusion-protocol@0.1.0` is published in GitHub Packages and is
installed as a cursorkit dev dependency. The protocol check reads the installed
package's `protocol-package.json` and verifies:

1. package name is `@velum-labs/model-fusion-protocol`;
2. package version matches `package.json#modelFusionProtocol.version`;
3. schema bundle hash matches `MODEL_FUSION_SCHEMA_BUNDLE_HASH`.

## Drift checks

Run:

```bash
corepack pnpm model-fusion:protocol:check
```

The check verifies:

- the local schema bundle hash matches
  `docs/model-fusion-protocol-origin.json`;
- committed model-fusion JSON fixtures use the same schema bundle hash;
- local OpenAPI/protobuf mirrors are not present as the v1 contract path;
- `@velum-labs/model-fusion-protocol` is installed and its package metadata,
  version, and schema bundle hash match the local manifest;
- the Python packaging plan remains documented until fusionkit publishes a
  private PyPI-compatible wheel.
- the docs state the corrected v1 decision: JSON Schema for durable records,
  OpenAPI 3.1 for HTTP/JSON APIs, and protobuf/Buf future-facing only.

When the runtime adapter moves from fixture validators to generated package
imports, keep this check as the guard that the consumed package version,
OpenAPI/JSON Schema contracts, and JSON schema bundle hash agree.

## Follow-up outside cursorkit

These items belong in fusionkit or the shared release infrastructure, not in this
PR:

- move the canonical Cursor harness OpenAPI 3.1 source into fusionkit-owned
  protocol source;
- maintain the `@velum-labs/model-fusion-protocol` TypeScript package release;
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
