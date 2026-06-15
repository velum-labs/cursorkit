# Unified Testing Harness

The unified harness orchestrates the existing test layers and writes structured
evidence for each run. It does not replace `pnpm check`, `pnpm e2e:cursor-agent`,
or `pnpm ck test`; it wraps them so failures can be compared with the same
artifact and diagnosis format.

## Commands

Build before running the harness:

```bash
pnpm build
```

Run deterministic local checks:

```bash
pnpm test:harness -- --suite static
pnpm test:harness -- --suite bridge-protocol
pnpm test:harness -- --suite cli
pnpm test:harness -- --suite traffic
pnpm test:harness -- --suite acp
```

Validate a local OpenAI-compatible MLX server:

```bash
pnpm test:harness -- \
  --suite local-backend \
  --base-url http://127.0.0.1:8080/v1 \
  --model mlx-community/Qwen3.5-4B-8bit \
  --display-name local-qwen \
  --api-key local
```

When the Cursor-facing id should be friendlier than the backend id, use both:

```bash
pnpm test:harness -- \
  --suite local-backend,desktop-ui-experimental \
  --include-experimental \
  --base-url http://127.0.0.1:8080/v1 \
  --model local-qwen \
  --provider-model mlx-community/Qwen3.5-4B-8bit \
  --display-name local-qwen \
  --api-key local
```

Run the desktop route-inventory smoke test:

```bash
pnpm test:harness -- \
  --suite desktop \
  --use-default-profile \
  --timeout-ms 30000 \
  --base-url http://127.0.0.1:8080/v1 \
  --model mlx-community/Qwen3.5-4B-8bit \
  --display-name local-qwen \
  --api-key local
```

## Suites

- `static`: runs `pnpm check`.
- `bridge-protocol`: runs focused bridge integration tests for server behavior,
  route inventory, and upstream connection handling.
- `local-backend`: checks `/v1/models` and `/v1/chat/completions` against a
  local OpenAI-compatible server.
- `cursor-agent` or `cli`: runs the real `cursor-agent` e2e smoke test with
  desktop-specific environment variables isolated.
- `cursor-agent-traffic` or `traffic`: starts the bridge with route inventory
  enabled, runs real `cursor-agent --list-models` and `cursor-agent --print`
  commands through the bridge, then writes a redacted route inventory report.
- `cursor-agent-acp-experimental` or `acp`: starts the bridge and drives
  `cursor-agent acp` with newline-delimited JSON-RPC
  `initialize`/`authenticate`/`session/new`/`session/prompt` messages. It checks
  the same local completion and route-inventory evidence as the traffic suite,
  but without PTY automation.
- `desktop` or `desktop-route`: runs `ck test`, then parses desktop route
  inventory logs.
- `desktop-ui-experimental`: launches an isolated Cursor instance with auth rows
  seeded from the logged-in default Cursor profile, opens the current workspace,
  attaches to the Electron renderer through CDP, dismisses safe onboarding
  prompts, waits for Cursor to create its settings state, activates the local
  model in the isolated profile, reloads the workbench, opens a new Agent
  composer, clicks the active model picker trigger, and fails unless the
  configured local model and existing built-in Cursor models are both visible.
  It also attempts to submit a probe prompt, but currently treats Monaco composer
  submission as an explicit gate instead of inferring success from inserted text.

`all` runs the deterministic core suites. Desktop testing stays explicit because
it launches Cursor.

`pnpm release:check` does not run optional live suites. It reports MLX,
real-client, and desktop live gates as `skipped_with_reason` unless an operator
runs them explicitly with the prerequisites above. This keeps deterministic
release readiness separate from final-gate validation on a machine with Cursor
auth, Cursor desktop, and a running MLX backend.

## Artifacts

Every run writes to `.cursor-rpc/test-runs/<timestamp>/` unless
`--artifacts-dir` is provided.

Artifacts include:

- `summary.json`: machine-readable scenario results.
- `summary.md`: human-readable result list.
- `junit.xml`: basic CI-compatible test report.
- `logs/*.log`: command stdout/stderr transcripts.
- scenario-specific JSON reports, such as `local-backend-report.json` and
  `desktop-route-report.json`.
- route reports include `routeSummary`, an aggregated per-path view with count,
  method, status, framing, policy, and outcome sets.
- traffic and ACP reports include `agentRunDiagnostics`, a body-free summary of
  model id, prompt length, context counts, MCP tool count/names, and how many
  context messages were injected into the local OpenAI-compatible request.

## Failure Codes

- `backend_unreachable`: the local MLX/OpenAI-compatible server is not reachable
  or does not expose the requested model.
- `bridge_start_failed`: the bridge did not start or `ck test` failed before
  route evidence.
- `route_missing`: desktop or CLI traffic did not reach the bridge.
- `model_route_missing`: traffic reached the bridge, but known model-list RPCs
  did not.
- `extension_host_route_missing`: desktop traffic reached the bridge, but an
  active Agent prompt did not produce a known agent send route.
- `model_metadata_rejected`: model routes were served, but Cursor did not accept
  or display the local model.
- `local_completion_failed`: model listing worked, but chat completion failed.
- `upstream_passthrough_failed`: unknown route pass-through failed.
- `auth_profile_blocked`: desktop auth/profile state blocked testing before
  route evidence.
- `command_failed`, `timeout`, `not_available`: generic harness-level outcomes.

## Desktop Notes

Desktop testing remains evidence-first, but the model picker itself is
settings-backed. In observed Cursor builds, opening the picker does not
necessarily issue a fresh model-list RPC; it reads cached/activated model state
from the profile. The UI suite therefore activates the local model in the
isolated profile and asserts additive behavior in the real picker. Route
inventory is still captured as supporting evidence for backend traffic, but it
is not required for the picker-visibility assertion.

If the result is `route_missing`, run `pnpm ck route status` and then
`pnpm ck route` before applying the manual routing fallback. The route commands
print operator-reviewed setup and rollback commands only.

Use `desktop-ui-experimental` as the real app-level gate. It is intentionally
strict: CDP attach alone is not enough. The suite opens the picker, confirms the
local model is additive, selects the local model in the active Agent composer,
and attempts to submit a prompt. The first-class CONNECT proxy has been
validated to route desktop traffic through the bridge, including model and
default-model routes. The current failing edge is the app's Monaco-backed
composer input: the harness refuses to report a local response until it can
prove the prompt was submitted and a known Agent send route reached the bridge.

## Traffic Discovery

Use the traffic suite when changing route handling or model metadata:

```bash
pnpm test:harness -- \
  --suite traffic \
  --base-url http://127.0.0.1:8080/v1 \
  --model local-qwen \
  --provider-model mlx-community/Qwen3.5-4B-8bit \
  --display-name local-qwen \
  --api-key local
```

This suite captures route metadata only. It does not persist request or response
bodies. The useful artifact is `traffic-probe-report.json`, which records the
observed paths, `routeSummary`, known model-route coverage, and whether the real
CLI listed and used the configured local model.

Healthy pass-through routes are reported separately from failed routes. A
pass-through entry with HTTP 200 usually means the bridge correctly forwarded an
unknown route to upstream. A failed route means the upstream or interceptor
returned an HTTP error.

## ACP Probe

Use the ACP suite to exercise the same bridge path through the structured Agent
Client Protocol instead of a terminal UI:

```bash
pnpm test:harness -- \
  --suite acp \
  --base-url http://127.0.0.1:8080/v1 \
  --model local-qwen \
  --provider-model mlx-community/Qwen3.5-4B-8bit \
  --display-name local-qwen \
  --api-key local
```

ACP still depends on local Cursor login state, so `auth_profile_blocked` means
`cursor-agent` could not authenticate or create a session before route evidence
was available. When it passes, `acp-probe-report.json` should include
`traffic-probe-ok`, the three known model routes, `RunSSE`, and `BidiAppend`.
