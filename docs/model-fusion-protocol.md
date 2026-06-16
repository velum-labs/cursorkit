# Model Fusion Protocol Consumption

`fusionkit` remains the model-fusion contract origin. For v1, JSON Schema is the
source of truth for durable audit and benchmark records, and OpenAPI 3.1 is the
source of truth for HTTP/JSON service APIs. Cursorkit should consume stable
generated artifacts from fusionkit instead of copying contract shapes across
repositories. This PR must stay draft until `@velum-labs/model-fusion-protocol` is
published and cursorkit consumes it, or until the missing package is explicitly
accepted as a blocker.

## Package targets

- TypeScript consumers should depend on `@velum-labs/model-fusion-protocol` from npm
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

Cursorkit does not own the v1 model-fusion OpenAPI source. Fusionkit should own
the canonical OpenAPI 3.1 source and generated SDK package. Until
`@velum-labs/model-fusion-protocol` exists, cursorkit may keep fixture-only local
validators with schema-bundle provenance, but must not treat local OpenAPI,
protobuf, or hand-written service types as the merge-ready model-fusion
contract.

## Current blocker

`@velum-labs/model-fusion-protocol` is not published in the configured registry yet.
This blocks merge-ready cross-repo protocol consumption because cursorkit cannot
consume generated OpenAPI client/types or JSON Schema validators from fusionkit.

Before this PR is marked ready:

1. Publish `@velum-labs/model-fusion-protocol` from fusionkit.
2. Add the package as a dependency or devDependency in cursorkit.
3. Replace local model-fusion contract mirrors with generated package imports
   where applicable.
4. Verify the consumed package schema bundle hash matches
   `MODEL_FUSION_SCHEMA_BUNDLE_HASH`.

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
- if `@velum-labs/model-fusion-protocol` is present in package metadata, the package
  pin and schema bundle hash match the local manifest;
- if `@velum-labs/model-fusion-protocol` is absent, the missing package is documented
  as an explicit merge blocker;
- the Python packaging plan remains documented until fusionkit publishes a
  private PyPI-compatible wheel.
- the docs state the corrected v1 decision: JSON Schema for durable records,
  OpenAPI 3.1 for HTTP/JSON APIs, and protobuf/Buf future-facing only.

When `@velum-labs/model-fusion-protocol` and the Python wheel are available, replace
local contract mirrors with generated package imports and keep this check as the
guard that the consumed package version, OpenAPI/JSON Schema contracts, and JSON
schema bundle hash agree.

## Follow-up outside cursorkit

These items belong in fusionkit or the shared release infrastructure, not in this
PR:

- move the canonical Cursor harness OpenAPI 3.1 source into fusionkit-owned
  protocol source;
- publish `@velum-labs/model-fusion-protocol` for TypeScript consumers;
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
