# Cursor Desktop App Proxy

The Cursor desktop app does not expose the same `--endpoint` flag that
`cursor-agent` supports. Desktop proxy mode makes `cursorkit` look like the
Cursor backend host locally, then passes unknown routes through to the real
backend while logging route metadata and serving registered local models on
typed, allowlisted routes.

This is macOS-first and intentionally operator-controlled. The CLI does not
edit `/etc/hosts`, install certificates, or change `pf` rules for you.

Before changing desktop proxy behavior, read `docs/learnings.md`; it records the
route, framing, DNS, TLS, and upstream-loop lessons learned from the CLI and
desktop proxy work.

For a unified runner that includes desktop route-inventory smoke tests, local
backend probes, and cursor-agent e2e, see `docs/testing-harness.md`.

## Recommended: Launch With `ck`

Use `ck` for the non-privileged desktop test path:

```bash
pnpm ck
```

If the isolated window asks you to log in and the browser confirmation does not
complete inside that window, use your already-authenticated Cursor profile for
the test:

```bash
pnpm ck --use-default-profile
```

That mode is less isolated because it reuses your normal Cursor auth state, but
it is still non-privileged and keeps `ck` from editing system routing or trust
settings.

`ck` does the safe parts automatically:

- generates `.cursor-rpc/certs/api2.cursor.sh.crt` and `.key` if needed
- starts `cursorkit desktop-proxy` with desktop defaults and debug logging
- starts a local HTTP CONNECT proxy and launches isolated Cursor with
  `--proxy-server`, so renderer and extension/plugin helper traffic can be
  routed without `/etc/hosts` or `pf`
- opens a separate Cursor instance with isolated `--user-data-dir` and
  `--extensions-dir` by default
- routes `api2.cursor.sh`, `api3.cursor.sh`, `agent.api5.cursor.sh`, and
  `agentn.global.api5.cursor.sh` CONNECT tunnels into the bridge while allowing
  non-Cursor hosts to pass through normally
- watches for `desktop route inventory` logs
- for isolated profiles, seeds the configured local models into Cursor's model
  settings so they are enabled additively rather than replacing built-in models

It does not run `sudo`, install certificate trust, edit `/etc/hosts`, modify
`pf`, bind privileged ports, or kill your normal Cursor instance.

Set `CK_WORKSPACE_PATH=<repo>` to make the launched Cursor open a specific
project while ck keeps its certs/state/logs under the current directory. This is
how an embedding launcher (for example `fusionkit cursor --ide`) opens the
user's repo without writing a `.cursor-rpc/` folder into it.

Useful commands:

```bash
pnpm ck test --use-default-profile
pnpm ck --print
pnpm ck --use-default-profile --print
pnpm ck --debug-port 9333 --instance-id ui-test --seed-auth-from-default
pnpm ck doctor
pnpm ck cert
pnpm ck route
pnpm ck route status
pnpm ck route rollback
pnpm ck stop
```

If no route inventory arrives, inspect the `CONNECT proxy log` printed by
`pnpm ck --print` or written under `.cursor-rpc/ck/<instance>/`. The isolated
path should now show `desktop connect proxy` events before any manual routing is
needed. `ck route` remains a non-mutating fallback for operator-reviewed system
routing.

For app-level automation evidence, run:

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

This launches an isolated Cursor instance with `--remote-debugging-port`, seeds
`cursorAuth/*` auth rows from the logged-in default profile, waits for Cursor to
initialize its settings state, enables the configured local model in the isolated
profile, reloads the workbench, opens the current repo, attaches to the Electron
renderer through CDP, dismisses safe onboarding prompts, opens a new Agent
composer, clicks the active model picker trigger, selects the local model in the
active composer, submits a test prompt, and asserts both:

- `local-qwen` appears in the real model picker.
- Existing Cursor models such as `Auto`, `Composer`, `GPT`, or `Sonnet` still
  appear, proving the local model was added rather than replacing the catalog.

Use `--model` for the Cursor-facing id and `--provider-model` for the real
OpenAI-compatible backend model id when they differ.

Important: isolated `ck` now uses a first-class CONNECT proxy instead of relying
only on Chromium `--host-resolver-rules`. In validation, this routes desktop
startup, auth, telemetry, model-list, default-model, dashboard, MCP, and
pass-through traffic through the bridge without privileged system changes. The
remaining `desktop-ui-experimental` gap is reliable CDP submission into Cursor's
Monaco-backed Agent composer; the harness deliberately fails rather than
claiming a local-model response when the prompt was not actually submitted.

## Automated Desktop Smoke Test

For the local MLX server:

```bash
BRIDGE_MODELS_JSON='[{"id":"local-qwen","displayName":"local-qwen","providerModel":"mlx-community/Qwen3.5-4B-8bit","baseUrl":"http://127.0.0.1:8080/v1","apiKey":"local","contextTokenLimit":128000}]' \
pnpm ck test --use-default-profile --timeout-ms 30000
```

`ck test` starts the bridge, launches Cursor, watches route inventory for the
timeout, prints a report, writes `.cursor-rpc/ck/bridge.log`, updates
`.cursor-rpc/ck/state.json`, and stops only the bridge process it started.

Interpret the report this way:

- `route inventory: no` means Cursor desktop traffic did not reach the bridge.
  The likely next step is manual routing below.
- `route inventory: yes` but `model routes seen: none` means desktop reached the
  bridge, but not through the known CLI-derived model-list RPCs.
- `model routes seen` includes `AvailableModels` or `GetUsableModels` but
  `local-qwen` is missing in the UI means the bridge is on the path and the next
  task is app-specific route/metadata discovery, not DNS or login debugging.
- `failed routes` greater than zero means inspect `.cursor-rpc/ck/bridge.log`
  for HTTP errors.
- `pass-through routes` greater than zero is expected for non-intercepted
  backend calls and helps discover which routes Cursor is using.

## Generate And Trust A Local Certificate

```bash
pnpm exec tsx src/cli.ts desktop-cert
```

The command writes a local certificate and key under `.cursor-rpc/certs/` with
SANs for `api2.cursor.sh`, `api3.cursor.sh`, `localhost`, `127.0.0.1`, and
`::1`. It also prints the exact `security add-trusted-cert` command to run
manually.

After trusting the certificate, start the proxy with the generated paths:

```bash
BRIDGE_CERT_PATH=.cursor-rpc/certs/api2.cursor.sh.crt \
BRIDGE_KEY_PATH=.cursor-rpc/certs/api2.cursor.sh.key \
BRIDGE_MODELS_JSON='[{"id":"local-qwen","displayName":"local-qwen","providerModel":"mlx-community/Qwen3.5-4B-8bit","baseUrl":"http://127.0.0.1:8080/v1","apiKey":"local","contextTokenLimit":128000}]' \
pnpm exec tsx src/cli.ts desktop-proxy
```

`desktop-proxy` defaults to:

- `BRIDGE_DESKTOP_MODE=true`
- `BRIDGE_USE_TLS=true`
- `CURSOR_UPSTREAM_BASE_URL=https://api2.cursor.sh`
- `BRIDGE_PUBLIC_ORIGIN=https://api2.cursor.sh`
- `BRIDGE_ROUTE_INVENTORY=true`

## Check The Setup

```bash
BRIDGE_CERT_PATH=.cursor-rpc/certs/api2.cursor.sh.crt \
BRIDGE_KEY_PATH=.cursor-rpc/certs/api2.cursor.sh.key \
pnpm exec tsx src/cli.ts desktop-doctor
```

`desktop-doctor` prints TLS hostname coverage, current DNS resolution for
`api2.cursor.sh`, upstream config, route-inventory status, upstream
reachability, and local model backend reachability.

Important: after you redirect `api2.cursor.sh` to localhost, the bridge must
still be able to reach the real Cursor backend. Set
`CURSOR_UPSTREAM_CONNECT_HOST` to a real upstream address captured before
cutover, or use your own split-DNS setup. The bridge preserves Host and TLS SNI
as `api2.cursor.sh` while connecting to that physical address.

## Route Cursor To The Proxy

Pick one local cutover method.

The preferred starting point is:

```bash
pnpm ck route status
pnpm ck route
```

Run `pnpm ck route` before changing `/etc/hosts` so it can capture the current
real `api2.cursor.sh` address for `CURSOR_UPSTREAM_CONNECT_HOST`. After cutover,
use:

```bash
pnpm ck route rollback
```

to print the rollback commands.

### Option A: Bind Directly To Port 443

Run the proxy on `127.0.0.1:443` and point `api2.cursor.sh` at localhost:

```bash
sudo sh -c 'printf "\n127.0.0.1 api2.cursor.sh\n" >> /etc/hosts'

BRIDGE_PORT=443 \
CURSOR_UPSTREAM_CONNECT_HOST=<real-api2-address> \
BRIDGE_CERT_PATH=.cursor-rpc/certs/api2.cursor.sh.crt \
BRIDGE_KEY_PATH=.cursor-rpc/certs/api2.cursor.sh.key \
pnpm exec tsx src/cli.ts desktop-proxy
```

Binding port `443` may require privilege. Prefer using the minimum shell scope
needed for your machine.

### Option B: Use A Temporary pf Redirect

Keep the bridge on its unprivileged default port and redirect local port `443`
traffic to it with your own temporary `pf` rule.

```bash
BRIDGE_PORT=9443 \
CURSOR_UPSTREAM_CONNECT_HOST=<real-api2-address> \
BRIDGE_CERT_PATH=.cursor-rpc/certs/api2.cursor.sh.crt \
BRIDGE_KEY_PATH=.cursor-rpc/certs/api2.cursor.sh.key \
pnpm exec tsx src/cli.ts desktop-proxy
```

Then install a temporary local redirect from `127.0.0.1:443` to
`127.0.0.1:9443` using your preferred `pf` workflow.

## Verify Desktop App Traffic

1. Start the proxy with `BRIDGE_LOG_LEVEL=debug`.
2. Quit and reopen Cursor.
3. Confirm logs include `desktop route inventory` entries.
4. Open the model picker and look for the local display name, for example
   `local-qwen`.
5. Send a small prompt through the local model.

The first pass is observe-first. If Cursor desktop uses model or chat RPCs not
already allowlisted in `src/routes.ts`, add typed interceptors only after the
route appears in the inventory and is decoded against the generated proto.

## Rollback

Before experimenting, know your rollback path:

1. Quit Cursor.
2. Stop `cursorkit`.
3. Remove the `api2.cursor.sh` line from `/etc/hosts`.
4. Disable any temporary `pf` redirect.
5. Reopen Cursor and confirm it reaches the real backend normally.
