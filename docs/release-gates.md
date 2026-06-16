# Release Gates

This package is private and local-only for now. `pnpm release:check` is the
authoritative deterministic local release gate. It runs generated baseline drift
checks, build, deterministic tests, formatting, examples typecheck, and package
artifact smoke validation, then writes
`.cursor-rpc/release-check/release-summary.json`.

GitHub Actions release automation lives in `.github/workflows/release.yml`. It
validates, tests, and packs the package on explicit release tags and
workflow-dispatch dry runs. Because `package.json` is still `private: true`, the
workflow is safe by default: it uploads the packed tarball as a workflow artifact
and skips npm publish until the package is intentionally made publishable.

Before publishing or sharing a tarball, all gates must pass:

- `pnpm install --frozen-lockfile`
- `pnpm release:publish:check`
- `pnpm release:check`
- `pnpm baseline:check`
- `pnpm build`
- `pnpm test`
- `pnpm format:check`
- `pnpm examples:check`
- `pnpm audit --audit-level moderate`
- `pnpm pack`
- `node dist/src/cli.js --help`
- `go test ./...` from `vendor/extract-cursor-protos`

## Release publish workflow

Triggers:

- `cursorkit-v*` tags, for example `cursorkit-v0.1.0`
- `v*` tags, for example `v0.1.0`
- manual `workflow_dispatch` dry runs, with `dry_run: true` by default

Safety guards:

- The release job only runs when
  `github.repository == 'velum-labs/cursorkit'`, so forks cannot publish.
- The publish step only runs on tags and only when `package.json` has
  `"private": false`.
- `pnpm release:publish:check` requires:
  - `publishConfig.registry` to be `https://npm.pkg.github.com`;
  - `publishConfig.access` to be `restricted`;
  - publishable packages to use the `@velum-labs/` npm scope;
  - the model-fusion protocol package pin to name
    `@velum-labs/model-fusion-protocol`;
  - the pinned model-fusion protocol schema bundle hash to match the local
    JSON Schema/OpenAPI protocol manifest.
- Model-fusion service clients/types must come from the generated
  `@velum-labs/model-fusion-protocol` OpenAPI package once fusionkit publishes it.
- Durable record validators/types must come from the fusionkit JSON Schema bundle
  in the generated protocol package. Cursorkit's local record validators are
  temporary fixture validators with schema-bundle provenance until that package
  is published.
- If `@velum-labs/model-fusion-protocol` is not published, this remains a documented
  blocker and the PR must stay draft.
- Protobuf/Buf remains outside the v1 release path; the release check expects
  JSON Schema durable records and OpenAPI 3.1 HTTP/API contracts.

Secrets and permissions:

- No custom secret is required for dry runs or GitHub Packages publishing.
- The workflow uses the built-in `GITHUB_TOKEN` with `packages: write` and
  `id-token: write`; npm publish uses `--provenance` and the GitHub Packages
  registry.
- Python/private PyPI secrets such as `PRIVATE_PYPI_*` are intentionally not used
  in cursorkit. They belong in fusionkit's protocol-package release workflow.

`pnpm release:check` is the command to trust for deterministic readiness. The
other commands are listed so an operator can reproduce a failing layer directly
or run extra non-deterministic checks before final-gate validation.

Package smoke validates:

- `pnpm pack` succeeds after a build.
- The tarball contains the required `dist/src`, `proto`, `docs`, `README.md`,
  and `DISCLAIMER.md` files.
- `examples/` is intentionally excluded from the tarball; source examples are
  typechecked by `pnpm examples:check` against the built package exports.
- A temporary clean project can install the tarball with `pnpm add --offline`.
- The installed `cursor-rpc` binary can execute `--help`.

Optional live suites are not part of deterministic release readiness. The
release summary reports them as `skipped_with_reason` until prerequisites such
as a running MLX backend, Cursor auth, or Cursor desktop are available.

Generated baseline artifacts:

- `docs/route-contract-manifest.json`: route/proto contract entries generated
  from `docs/service-manifest.json`, `src/routes.ts`, and `src/config.ts`.
- `docs/implementation-inventory.json`: route, config, and uncertainty
  inventory for the current implementation.
- `docs/test-manifest.json`: deterministic and optional-live suite inventory,
  release-check behavior, prerequisites, and artifact outputs.
- `docs/release-summary.json`: baseline completion metrics and remaining
  blockers for the next production phases, grouped by protocol, MLX, tool,
  desktop optional-live, reliability/security, packaging, and final gate status.

API stability policy:

- `cursor-rpc/extensions` and `cursor-rpc/providers/openai` are experimental.
- Breaking plugin API changes are allowed before a public package release.
- If this becomes publishable, add semver guarantees and deprecation windows before marking extension APIs stable.
