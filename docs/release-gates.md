# Release Gates

This package publishes to public npm as `@velum-labs/cursorkit` through CI; there are no
manual deploys. `pnpm release:check` is the authoritative deterministic local
release gate. It runs generated baseline drift checks, build, deterministic
tests, formatting, examples typecheck, and package artifact smoke validation,
then writes `.cursor-rpc/release-check/release-summary.json`.

GitHub Actions release automation lives in `.github/workflows/release-packages.yml`. It
validates, tests, and packs the package on a published GitHub Release (and on
`workflow_dispatch` dry runs). Publishing is gated behind a published GitHub
Release (not a bare tag push) so the release notes and tag are reviewed before
anything ships, and the publish step uploads the packed tarball as a workflow
artifact for provenance.

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

- a published GitHub Release whose tag matches `cursorkit-v*`
  (for example `cursorkit-v0.1.0`) or `v*` (for example `v0.1.0`)
- manual `workflow_dispatch` dry runs, with `dry_run: true` by default

Safety guards:

- The release job only runs when
  `github.repository == 'velum-labs/cursorkit'`, so forks cannot publish.
- The publish step only runs on the `release: published` event (reviewed release
  notes + tag) and only when `package.json` has `"private": false`.
- `pnpm release:publish:check` requires:
  - `publishConfig.registry` to be `https://registry.npmjs.org`;
  - `publishConfig.access` to be `public`;
  - `publishConfig.provenance` to be `true`;
  - `package.json` `private` to be `false`;
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
- `@velum-labs/model-fusion-protocol` must be installable from GitHub Packages,
  and its installed protocol metadata must match the pinned schema bundle hash.
- Protobuf/Buf remains outside the v1 release path; the release check expects
  JSON Schema durable records and OpenAPI 3.1 HTTP/API contracts.

Secrets and permissions:

- Dry runs require no custom secret. Publishing to public npm uses OIDC trusted
  publishing (`id-token: write` + `npm publish --provenance`); once a Trusted
  Publisher is configured on npmjs.com no token is needed, and `NPM_TOKEN` is the
  bootstrap fallback for the first publish.
- Installing the `@velum-labs/model-fusion-protocol` devDep from GitHub Packages
  uses `PACKAGES_READ_TOKEN` (falling back to the built-in `GITHUB_TOKEN`).
- Python/private PyPI secrets such as `PRIVATE_PYPI_*` are intentionally not used
  in cursorkit. They belong in fusionkit's protocol-package release workflow.

`pnpm release:check` is the command to trust for deterministic readiness. The
other commands are listed so an operator can reproduce a failing layer directly
or run extra non-deterministic checks before final-gate validation.

Package smoke validates:

- `pnpm pack` succeeds after a build.
- The tarball contains the required `dist/src`, `proto`, `docs`, `README.md`,
  `DISCLAIMER.md`, and `LICENSE` files.
- `examples/` is intentionally excluded from the tarball; source examples are
  typechecked by `pnpm examples:check` against the built package exports.
- A temporary clean project can install the tarball with `pnpm add --offline`.
- The installed `cursorkit` binary can execute `--help`.

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

- `@velum-labs/cursorkit/extensions` and `@velum-labs/cursorkit/providers/openai` are experimental.
- Breaking plugin API changes are allowed while these subpaths remain experimental.
- Add semver guarantees and deprecation windows before marking extension APIs stable.
