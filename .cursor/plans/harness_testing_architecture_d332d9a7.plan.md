---
name: Harness testing architecture
overview: "Deterministic, hermetic verification that FusionKit's plumbing is correct — dialect translation, config injection, panel fanout/capture, the TS-Python fuse contract, sessions, passthrough, failover, tracing — via one scenario vocabulary, with full migration of the existing test suite onto it as a committed, ledger-tracked goal. Value measurement (fusion beats single model) is explicitly out of scope; evals/hillclimb own it."
todos:
  - id: taxonomy-doc
    content: Write docs/testing.md defining the plumbing contract (10 invariants), the vocabulary (Scenario, Tier, FrontDoor, Stack, Script, Fixture, Check, Outcome), and tier gating for TS and Python
    status: pending
  - id: testkit-scripted-provider
    content: "Build ScriptedProvider + role-based script() builder (panel/judge/synth roles, SSE, tool_calls, 429/error_category injection, strict mode, raw-wire steps for chunk-split/early-close SSE)"
    status: pending
  - id: testkit-fixtures-runner
    content: Build the TaskRepo fixture library (one format, absorbing testkit makeRepo, the four materializeRepo copies, gateway-e2e inline repos) and the scenario() runner as node:test subtests with default Checks per tier
    status: pending
  - id: run-artifacts
    content: "Every scenario run writes a self-contained artifact dir (wire transcript via trajectory-capture, trace JSONL, repo state, CLI JSON event log, script playhead, report.json); failures print the divergence timeline"
    status: pending
  - id: unify-outcomes
    content: Adopt the acceptance Outcome type (passed/failed/skipped_with_reason/blocked) as the one result vocabulary
    status: pending
  - id: t1-dialect-goldens
    content: "Record wire goldens by running real CLIs against a fully scripted stack (no live providers needed); re-home front-door-acceptance as the T1 conformance suite"
    status: pending
  - id: t2-codex-frontdoor
    content: "T2 codex front-door scenarios driven via codex exec --json: fusion turn, passthrough model, tool-loop repo-green, multi-turn session, pre-stream and mid-stream failover per error_category (CLI absent => skipped_with_reason); warm-stack reuse via portless identity"
    status: pending
  - id: t2-panel-capture
    content: "T2 panel-side scenarios: real harness CLIs as panel members in worktrees against ScriptedProvider — worktree isolation, per-candidate CODEX_HOME injection, capture-gateway trajectory reconstruction, panel failure isolation"
    status: pending
  - id: t2-claude-cursor
    content: Extend front-door matrix to claude (claude -p stream-json) and cursor; probe the product ACP doors (generic acp-agent, cursor-acp) to clear their blocked acceptance status
    status: pending
  - id: plumbing-invariant-checks
    content: "Cross-cutting Checks: trace/provenance header propagation, SSE terminal-usage + fusion-extension shape, budget-gate 402, session TTL (needs injectable clock seam in fusion-backend/session-store)"
    status: pending
  - id: t3-provider-smoke
    content: "Minimal env-gated live smoke (~3 scenarios): real OpenAI + Anthropic auth, real SSE framing, reasoning_content quirks — plumbing only, no value claims; replaces scripts/fusion-*-e2e.mjs"
    status: pending
  - id: parity-power
    content: "Power-parity features required for full migration: injectable clock seam (fusion-backend/session-store), concurrency combinators (parallel clients, deterministic turn barriers), white-box ScenarioRun handles (session store, cost ledger, provenance buffers)"
    status: pending
  - id: migration-ledger
    content: "Migration ledger: map all 52 TS test files (and Python server/streaming/tool-resume tests) to their disposition — scenario id that subsumes it, T0-on-kit-primitives, or delete-as-duplicate — with per-file assertion inventory"
    status: pending
  - id: migrate-model-gateway
    content: "Rewrite packages/model-gateway tests onto scenarios/T0 primitives (largest cluster: fusion-backend*, adapters, sse, session, cost, trace); old file deleted in the same PR its replacement lands"
    status: pending
  - id: migrate-cli-ensemble-tools
    content: "Rewrite packages/cli, ensemble, tool-codex, tool-claude, tool-cursor tests; then Python server-side tests onto the mirrored pytest vocabulary"
    status: pending
  - id: taxonomy-guard
    content: "check-repo.mjs guard: forbid http.createServer / inline git-repo fixtures in ALL test files (ratcheted allowlist that only shrinks as migration proceeds; empty at completion)"
    status: pending
isProject: false
---

# Plumbing-Correctness Testing for FusionKit Harnesses

## Scope: plumbing, not value

Out of scope here, owned by `python/fusionkit-evals` + the hillclimb/audit skills: whether fusion beats a single model, judge quality, uplift, benchmarks. In scope: **is every pipe connected correctly** — injection, proxying, translation, fanout, capture, sessions, failover. In a scripted world the model is a constant, so any red test is a plumbing bug by construction.

## The plumbing contract

The testable invariants. The scenario matrix is a coverage map of this list; each row below names its primary seam.

1. **Dialect translation** — Codex Responses / Claude Messages / OpenAI Chat requests and SSE are translated losslessly by the gateway adapters (`adapters/responses.ts`, `adapters/anthropic.ts`), including streaming, tool_calls, and narration-as-reasoning.
2. **Config injection** — ephemeral `CODEX_HOME` config.toml, model catalog, profiles, `ANTHROPIC_BASE_URL` env: the launched CLI actually talks to our gateway and can select fused + passthrough models ([packages/tool-codex/src/launch.ts](packages/tool-codex/src/launch.ts)).
3. **Panel fanout + capture** — `runFusionPanels` spawns each member CLI in an isolated worktree with a per-candidate capture gateway; native trajectories are reconstructed correctly from wire traffic; one member failing does not poison the panel ([packages/tool-codex/src/harness.ts](packages/tool-codex/src/harness.ts), `trajectory-capture.ts`).
4. **Fuse-step contract (TS ↔ Python)** — candidates + conversation + tools POSTed to `/v1/fusion/trajectories:fuse` produce a valid OpenAI completion (buffered and SSE, with the `fusion` extension and terminal usage chunk). Today every TS test fakes this endpoint; running the real engine makes cross-language drift a test failure.
5. **Session/turn semantics** — panel runs once per turn; tool-loop continuations reuse cached candidates; follow-up user messages advance the turn; resume/TTL/rehydration work.
6. **Passthrough routing** — selecting a native model proxies to the router with the model id rewritten, no fusion invoked (strict scripts prove the *absence* of fanout).
7. **Failover taxonomy** — every `error_category` (transient, quota_exhausted, auth_permanent, unknown) triggers the specified behavior, pre-stream and mid-stream (requires chunk-level SSE control: the WS5 code peeks SSE heads).
8. **Trace/provenance propagation** — `x-velum-trace-id`, `x-velum-model-call-id`, provenance sinks appear end-to-end across both languages.
9. **Cost/usage plumbing** — usage parsed from SSE, turns metered, budget gate returns 402 before spend.
10. **Tool-loop round-trips** — gateway-returned `tool_calls` are executed by the real CLI and results re-enter the same turn (the known-unproven "tool-calling E2E on `fusionkit codex`" gap; repoGreen is its end-to-end witness: scripted patch via tool call ⇒ repo tests pass ⇒ the whole loop worked).

## The vocabulary

Eight nouns, used identically in TS, Python, docs, and CI:

- **Scenario** — declarative test case: FrontDoor + Stack + Fixture + Script + Checks. Data, so the matrix is enumerable and auditable against the contract list.
- **Tier** — execution mode: T0 unit, T1 wire conformance, T2 hermetic full stack, T3 minimal live smoke.
- **FrontDoor** — HTTP dialect probe | real CLI (`codex exec --json`, `claude -p --output-format stream-json`, `cursor-agent`) | product ACP doors.
- **Stack** — what's real behind the gateway: scripted backend | real gateway + real Python engine + ScriptedProvider | live. Includes the **panel axis**: injected PanelRunner stub vs real harness CLIs in worktrees (invariant 3 needs the latter).
- **Script** — deterministic model behavior against *fusion roles* (`panel.<id>`, `judge`, `synth`), compiled onto endpoints by the testkit. `.strict()` fails on any unscripted request — the absence assertion that catches double fanout and cache breaks. Raw-wire steps (chunk splits, early close, malformed frames) cover invariant 7.
- **Fixture** — TaskRepo: data dir + manifest (task, failing command, solution patch); one format for TS, Python, and `benchmarks/dirty-dozen`.
- **Check** — reusable assertion over a typed `ScenarioRun` (wire log, traces, repo handle, session-store/cost-ledger handles): `repoGreen`, `toolLoop`, `sessionTurns`, `traceInvariants`, `costLedger`, `noFanout`.
- **Outcome** — `passed | failed | skipped_with_reason | blocked` (from `front-door-acceptance.ts`), adopted everywhere; missing CLI ⇒ `skipped_with_reason`, never a silent skip.

## What a test reads like

```ts
scenario("codex tool loop: fused patch lands and turn reuses cached panel", {
  frontDoor: { kind: "cli", tool: "codex" },          // codex exec --json
  stack: { panel: "real-harness-cli" },               // members in worktrees, ScriptedProvider behind
  fixture: fixtures.cartDiscount,
  script: script()
    .panel("alpha", (m) => m.reply("subtract percent"))
    .panel("beta", (m) => m.reply("multiply by (1 - percent/100)"))
    .judge((m) => m.pick("beta"))
    .synth((m) => m.toolCall("shell", { command: "npm test" })
                   .then((r) => r.patch(fixtures.cartDiscount.solution))
                   .done("fixed"))
    .strict(),
  checks: [checks.repoGreen(), checks.toolLoop({ minRoundTrips: 2 }),
           checks.sessionTurns(1), checks.traceInvariants()]
});
```

DX decisions: `scenario()` registers as node:test subtests (watch mode, name filtering, IDE run buttons work untouched; pytest mirrors the nouns). Defaults per tier keep the smallest scenario at ~3 lines. Every run writes a self-contained artifact dir (wire transcript via the existing `trajectory-capture.ts`, trace JSONL, repo state, CLI JSON events, script playhead, `report.json`); a failing Check prints a divergence timeline. T2 reuses a warm Python engine via the existing portless identity-keyed discover-or-spawn ([packages/cli/src/shared/portless.ts](packages/cli/src/shared/portless.ts)); ScriptedProvider signals turn completion so there are no sleeps.

## Tiers

- **T0 — unit (exists, keep as-is)**: pure-function tests stay plain node:test/pytest. No migration project; old mocks migrate only when touched.
- **T1 — wire conformance (offline, free)**: golden request/SSE fixtures per dialect replayed against the gateway adapters. **Goldens are recorded by running the real CLI against a fully scripted stack** — the CLI generates the wire bytes, not the model, so no live providers are needed and re-recording after a CLI version bump is free. `front-door-acceptance.ts` re-homes here.
- **T2 — hermetic full stack (the main build)**: real CLI, real gateway, real Python engine, real panel harness CLIs in worktrees; only the LLM tokens are scripted. Zero product-code changes needed (the engine speaks `provider: openai-compatible`; `startFusionStack` accepts pre-running `endpoints` + `synthesisUrl`). Covers invariants 2–10 deterministically, including the 14 kernel-migration parity scenarios.
- **T3 — provider-quirk smoke (minimal, env-gated)**: ~3 scenarios against real OpenAI + Anthropic proving auth plumbing, real SSE framing, and `reasoning_content` quirks. Plumbing only — no uplift claims. Replaces and deletes the four `scripts/fusion-*-e2e.mjs`.

## Deliberate cuts (audited against the plumbing goal)

- **No record-from-live pipeline.** Hand-written role scripts are better plumbing tests than recordings (explicit intent); the one thing recording was needed for — T1 goldens — falls out of running real CLIs against the scripted stack, free.
- **No ACP drivers for codex/claude.** `codex-acp`/`claude-code-acp` are different binaries from what users run; testing through them tests a client nobody ships. The real paths already emit structured JSON (`codex exec --json`, `claude -p stream-json`) for event-level assertions. ACP is covered only where it *is* product surface: the generic `acp-agent.ts` door and `cursor-acp` (both currently `blocked` in acceptance).
- **No value measurement.** Judge accuracy, uplift, benchmarks stay in `fusionkit-evals`; the testkit never asserts on answer quality, only on structure and effects.

## Full migration (committed goal)

Every existing test is rewritten onto the unified language, tracked to completion. "Rewritten" means one of three dispositions, recorded per file in a **migration ledger** before any file is touched:

- **Subsumed** — a strict T2/T1 scenario covers the invariant more strongly; the old file is deleted, the ledger names the scenario that replaced it and accounts for each original assertion.
- **Rewritten as scenario** — behavioral tests translated onto `scenario()` with `.strict()` default; the old file is deleted **in the same PR** its replacement lands, so there is never a period of dual ownership.
- **T0 on kit primitives** — pure-function tests keep their shape (plain node:test/pytest) but any hand-rolled mock server, inline git fixture, or bespoke fake is replaced by ScriptedProvider / TaskRepo / FakeModelClient. At completion, zero hand-rolled test infrastructure exists anywhere.

Safeguards that keep "as strict or stricter" true under a full rewrite:

- **Assertion inventory per file**: the ledger lists each original assertion and where it lives afterward (a Check, a strict-script constraint, or an explicit "dropped because X" entry that requires review sign-off).
- **Power parity built first** (todo `parity-power`): injectable clock (session TTL), concurrency combinators, white-box `ScenarioRun` handles, raw-wire script steps — the features the strictest existing tests depend on land *before* their migrations, never as a follow-up.
- **Ratcheted guard**: the `check-repo.mjs` rule starts with an allowlist of the current 14 mock files and only shrinks; CI fails if it grows. Completion is machine-checkable: empty allowlist.
- **Order**: model-gateway first (largest cluster, most duplicated mocks, and the package whose contracts the scenarios exercise anyway), then cli/ensemble/tool-*, then the Python server-side tests onto the mirrored pytest vocabulary. New-coverage scenarios (invariants 3, 4, 7-mid-stream, 10) land before migration starts, so the new suite is proven on real gaps before it inherits the old suite's responsibilities.

## Disposition of existing abstractions

- `FakeModelClient` (Python) — keep: T0 in-process fake.
- `createMockHarness` (ensemble) — keep, re-export as the injected-panel stub.
- 14 hand-rolled `http.createServer` mocks — replaced by ScriptedProvider via the migration ledger; ratcheted `check-repo.mjs` allowlist shrinks to empty.
- `makeRepo` + four `materializeRepo` copies + inline repos — fold into the TaskRepo library.
- `front-door-acceptance.ts` — re-home as T1; its Outcome type becomes universal.
- `scripts/fusion-*-e2e.mjs` — replaced by T3 smoke, deleted.
- `@fusionkit/testkit` — left to the legacy warrant stack (per `docs/scope.md`); fusion-testkit is the product-scope kit.
- evals fixtures/flags — untouched; different concern.

## Why this is the right shape for fusion specifically

Every distinctive risk of this product is an *integration* risk: three wire dialects times two directions, two languages sharing one contract, CLIs injected via config files, candidates captured off the wire, state keyed by turn. None of that is testable with unit mocks alone (they fake the very seams under test), and none of it needs live models (the model is irrelevant to whether the pipes connect). A scripted, strict, full-stack scenario is the exact instrument for "is the plumbing correct" — and the contract list above keeps the matrix honest about what plumbing means.
