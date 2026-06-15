import { describe, expect, it } from "vitest";

import {
  buildReleaseCategoryStatuses,
  EXCLUDED_PACKAGE_ENTRY_PREFIXES,
  REQUIRED_PACKAGE_ENTRIES,
  type OptionalLiveSuite,
  type ReleaseGateStatusInput,
} from "../src/tools/releaseCheck.js";

describe("release check metadata", () => {
  it("requires runtime, docs, proto, and generated release files in the package", () => {
    expect(REQUIRED_PACKAGE_ENTRIES).toEqual(
      expect.arrayContaining([
        "package/dist/src/cli.js",
        "package/dist/src/ck.js",
        "package/proto/agent/v1/agent.proto",
        "package/proto/aiserver/v1/aiserver.proto",
        "package/docs/release-gates.md",
        "package/docs/testing-harness.md",
        "package/docs/test-manifest.json",
        "package/docs/release-summary.json",
        "package/README.md",
      ]),
    );
  });

  it("documents source-only examples as excluded from the tarball", () => {
    expect(EXCLUDED_PACKAGE_ENTRY_PREFIXES).toEqual(["package/examples/"]);
  });

  it("keeps optional live gates separate from deterministic release readiness", () => {
    const results: ReleaseGateStatusInput[] = [
      {
        id: "unit-tests",
        status: "passed",
        categories: ["protocol", "mlx", "tool", "reliability-security"],
      },
      {
        id: "package-smoke",
        status: "passed",
        categories: ["packaging", "final-gate"],
      },
    ];
    const optionalSuites: OptionalLiveSuite[] = [
      {
        id: "desktop-live",
        category: "desktop-optional-live",
        status: "skipped_with_reason",
        reason: "Cursor desktop auth is unavailable.",
        command: "pnpm test:harness -- --suite desktop-ui-experimental",
        prerequisites: ["Cursor desktop installed", "Cursor auth available"],
      },
    ];

    expect(buildReleaseCategoryStatuses(results, optionalSuites)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "packaging",
          status: "passed",
          gateIds: ["package-smoke"],
        }),
        expect.objectContaining({
          id: "desktop-optional-live",
          status: "skipped_with_reason",
          gateIds: [],
          optionalSuiteIds: ["desktop-live"],
        }),
      ]),
    );
  });
});
