import { describe, expect, it } from "vitest";

import {
  BASELINE_ARTIFACT_PATHS,
  buildBaselineArtifacts,
  checkBaselineArtifacts,
} from "../src/tools/baselineInventory.js";
import { INTERCEPTABLE_ROUTE_PATHS } from "../src/routes.js";

describe("baseline inventory", () => {
  it("keeps generated artifacts checked in", async () => {
    await expect(checkBaselineArtifacts()).resolves.toEqual([]);
  });

  it("covers every interceptable route with a route contract", () => {
    const artifacts = buildBaselineArtifacts();
    const manifest = artifacts.routeContractManifest as {
      routes: Array<{ path: string; policy: string; protoBacked: boolean }>;
    };
    const interceptRoutes = manifest.routes
      .filter((route) => route.policy === "intercept")
      .map((route) => route.path);

    expect(interceptRoutes).toEqual(INTERCEPTABLE_ROUTE_PATHS);
    expect(manifest.routes).toHaveLength(INTERCEPTABLE_ROUTE_PATHS.length);
    expect(
      manifest.routes.filter((route) => route.path.startsWith("/auth/")),
    ).toEqual([
      expect.objectContaining({ protoBacked: false }),
      expect.objectContaining({ protoBacked: false }),
    ]);
    expect(
      manifest.routes.filter((route) => !route.path.startsWith("/auth/")),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ protoBacked: true })]),
    );
  });

  it("aligns route policy docs with the route contract", () => {
    const artifacts = buildBaselineArtifacts();
    const manifest = artifacts.routeContractManifest as {
      routes: Array<{ path: string }>;
    };
    const routePolicy = artifacts.routePolicy as Array<{ path: string }>;

    expect(routePolicy.map((entry) => entry.path)).toEqual([
      ...manifest.routes.map((route) => route.path),
      "*",
    ]);
  });

  it("lists deterministic and optional release gates by category", () => {
    const artifacts = buildBaselineArtifacts();
    const testManifest = artifacts.testManifest as {
      suites: Array<{
        id: string;
        deterministic: boolean;
        status: string;
        categories: string[];
        releaseCheck: string;
      }>;
    };

    expect(BASELINE_ARTIFACT_PATHS).toContain("docs/test-manifest.json");
    expect(testManifest.suites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "baseline-drift",
          deterministic: true,
          status: "implemented",
        }),
        expect.objectContaining({
          id: "pack-smoke",
          deterministic: true,
          status: "implemented",
          categories: expect.arrayContaining(["packaging", "final-gate"]),
          releaseCheck: "required",
        }),
        expect.objectContaining({
          id: "mlx-live",
          deterministic: false,
          status: "optional_live",
          releaseCheck: "reported_skipped_with_reason",
        }),
      ]),
    );
  });

  it("summarizes release status categories for the final gate", () => {
    const artifacts = buildBaselineArtifacts();
    const releaseSummary = artifacts.releaseSummary as {
      categories: Array<{
        id: string;
        deterministicSuites: string[];
        optionalLiveSuites: string[];
        releaseCheckStatus: string;
      }>;
    };

    expect(releaseSummary.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "protocol",
          deterministicSuites: expect.arrayContaining([
            "baseline-drift",
            "unit-tests",
          ]),
        }),
        expect.objectContaining({
          id: "desktop-optional-live",
          deterministicSuites: [],
          optionalLiveSuites: ["desktop-live"],
          releaseCheckStatus:
            "skipped_with_reason_until_prerequisites_available",
        }),
        expect.objectContaining({
          id: "packaging",
          deterministicSuites: expect.arrayContaining([
            "examples-typecheck",
            "pack-smoke",
          ]),
          releaseCheckStatus: "required",
        }),
      ]),
    );
  });
});
