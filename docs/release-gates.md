# Release Gates

This package is private and local-only for now. `pnpm release:check` is the
authoritative deterministic local release gate. It runs generated baseline drift
checks, build, deterministic tests, formatting, examples typecheck, and package
artifact smoke validation, then writes
`.cursor-rpc/release-check/release-summary.json`.

Before publishing or sharing a tarball, all gates must pass:

- `pnpm install --frozen-lockfile`
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
