# cursorkit

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
cursorkit serve
cursorkit doctor
cursorkit desktop-cert
cursorkit desktop-proxy
cursorkit desktop-doctor
cursorkit capture
cursorkit fixtures
cursorkit ck
cursorkit ck test
cursorkit ck --use-default-profile
cursorkit ck --print
cursorkit ck doctor
cursorkit ck cert
cursorkit ck route
cursorkit ck route status
cursorkit ck route rollback
cursorkit ck stop
cursorkit --help
```

`serve` starts the local bridge. `doctor` checks proto loading, upstream config,
TLS status, capture status, and local model registration. The `desktop-*`
commands support explicit Cursor desktop app proxy experiments; see
`docs/cursor-app.md`.

The committed `fixtures/model-fusion-contract/` records are synthetic
compatibility fixtures for the model-fusion roadmap. They validate Cursor-specific
`cursor-run-*` records and generic `harness-run-*` records locally without adding
`handoffkit` as a runtime dependency or changing live Cursor routing behavior.
The importable `@velum-labs/cursorkit/model-fusion` subpath exposes the same fixture-backed
surface as a small structural API: `cursorHarness(...)` and
`runCursorCandidate(...)` produce Cursor-specific records plus mapped generic
harness results. Those records keep requested and observed model IDs separate,
can attach redacted route-inventory artifact refs, and record unsupported Cursor
capabilities explicitly. It does not own fan-out, judge synthesis, lifecycle,
receipts, or live Cursor tool-call replay; desktop routes remain observed-only
until fixture-backed evidence proves stability.

`cursorkit ck` is the recommended desktop test launcher. It starts the desktop
bridge plus a local HTTP CONNECT proxy, opens an isolated Cursor profile with
`--proxy-server`, and reports whether route inventory traffic reaches the
bridge. For isolated desktop UI tests, it also seeds/activates local models
additively in Cursor's settings-backed model picker state. It does not install
certificates, edit `/etc/hosts`, modify `pf`, or kill your normal Cursor app.
Inside this repo, use `pnpm ck`; when installed or linked as a package, use
`cursorkit ck` directly. If the isolated profile cannot complete browser login,
`cursorkit ck --use-default-profile` reuses your current Cursor auth state while
keeping the same non-privileged routing attempt.
Use `cursorkit ck test --use-default-profile` for a bounded desktop smoke test
that reports whether route inventory and the known model-list RPCs reached the
bridge.

The project knowledge base for observed Cursor behavior is `docs/learnings.md`.
Read it before changing route interception, model metadata, or desktop proxy
behavior.
Use `docs/protocol-surface-audit.md` to see which parts of the full generated
proto are implemented, which are only pass-through, and what is missing for full
tool/context support.

Use `docs/testing-harness.md` for the unified test runner that orchestrates
static checks, bridge protocol tests, cursor-agent e2e, local backend probes,
real `cursor-agent` traffic discovery, ACP JSON-RPC probes, and desktop
route-inventory smoke tests.

For app-level evidence, run the experimental desktop UI probe:

```bash
pnpm test:harness -- \
  --suite desktop-ui-experimental \
  --include-experimental \
  --base-url http://127.0.0.1:8080/v1 \
  --model local-qwen \
  --provider-model mlx-community/Qwen3.5-4B-8bit \
  --display-name local-qwen \
  --api-key local
```

It launches an isolated Cursor instance with auth seeded from the logged-in
default profile, waits for Cursor to initialize settings, activates the local
model, opens this repo, attaches to the renderer over CDP, opens the Agent model
picker, and fails unless both the configured local model and built-in Cursor
models are visible.

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
- Cursor desktop app support starts in route-inventory mode so app-specific
  RPCs can be observed before adding typed interceptors.

See `docs/plugin-authoring.md` and the source-checkout `examples/` directory for
the experimental local plugin shape. Examples are typechecked by
`pnpm examples:check`, but they are intentionally excluded from packed tarballs.

## Release Gates

This package is published to public npm as `@velum-labs/cursorkit` under the
Apache License 2.0; see `LICENSE` for the license terms and `DISCLAIMER.md` for
the unofficial-research caveats. See `docs/release-gates.md` for the checks
required before publishing a release or changing the API stability posture.
Use `pnpm baseline:check` to verify generated route/config/docs drift and
`pnpm release:check` for the authoritative deterministic local release gate,
including package artifact smoke validation.
