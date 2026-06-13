# Release Gates

This package is private and local-only for now. Before publishing or sharing a tarball, all gates must pass:

- `pnpm install --frozen-lockfile`
- `pnpm codegen`
- `pnpm build`
- `pnpm test`
- `pnpm format:check`
- `pnpm audit --audit-level moderate`
- `pnpm pack`
- `node dist/src/cli.js --help`
- `go test ./...` from `vendor/extract-cursor-protos`

API stability policy:

- `cursor-rpc/extensions` and `cursor-rpc/providers/openai` are experimental.
- Breaking plugin API changes are allowed before a public package release.
- If this becomes publishable, add semver guarantees and deprecation windows before marking extension APIs stable.
