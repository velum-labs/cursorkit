import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { MODEL_FUSION_SCHEMA_BUNDLE_HASH } from "../fixtures/modelFusion.js";

type ProtocolOriginManifest = {
  schemaVersion: number;
  schemaBundleHash: string;
  persistedJsonSchemas: string[];
  packages?: {
    typescript?: {
      name?: string;
      registry?: string;
    };
    python?: {
      preferredPrivateIndexes?: string[];
      shortTermOptions?: string[];
    };
  };
  serviceBoundaries?: Array<{
    service?: string;
    proto?: string;
    generatedTypescript?: string;
  }>;
};

const ROOT = process.cwd();
const ORIGIN_MANIFEST_PATH = "docs/model-fusion-protocol-origin.json";
const PROTOCOL_DOC_PATH = "docs/model-fusion-protocol.md";
const CONTRACT_FIXTURE_ROOT = "fixtures/model-fusion-contract";
const CURSOR_HARNESS_PROTO_PATH = "proto/model_fusion/v1/cursor_harness.proto";
const CURSOR_HARNESS_TS_PATH = "src/gen/model_fusion/v1/cursor_harness_pb.ts";

export function checkModelFusionProtocol(): string[] {
  const errors: string[] = [];
  const manifest = readManifest(errors);
  if (manifest !== undefined) {
    checkManifest(manifest, errors);
  }
  checkFixtureBundleHashes(errors);
  checkCursorHarnessIdl(errors);
  checkProtocolDocs(errors);
  return errors;
}

function readManifest(errors: string[]): ProtocolOriginManifest | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(resolvePath(ORIGIN_MANIFEST_PATH), "utf8"),
    ) as ProtocolOriginManifest;
  } catch (error) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

function checkManifest(
  manifest: ProtocolOriginManifest,
  errors: string[],
): void {
  if (manifest.schemaVersion !== 1) {
    errors.push(`${ORIGIN_MANIFEST_PATH}: schemaVersion must be 1`);
  }
  if (manifest.schemaBundleHash !== MODEL_FUSION_SCHEMA_BUNDLE_HASH) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: schemaBundleHash ${manifest.schemaBundleHash} does not match MODEL_FUSION_SCHEMA_BUNDLE_HASH ${MODEL_FUSION_SCHEMA_BUNDLE_HASH}`,
    );
  }
  for (const schema of [
    "harness-run-request.v1",
    "harness-run-result.v1",
    "cursor-run-request.v1",
    "cursor-run-result.v1",
  ]) {
    if (!manifest.persistedJsonSchemas.includes(schema)) {
      errors.push(
        `${ORIGIN_MANIFEST_PATH}: missing persisted JSON schema ${schema}`,
      );
    }
  }
  if (manifest.packages?.typescript?.name !== "@velum/model-fusion-protocol") {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: TypeScript package target must be @velum/model-fusion-protocol`,
    );
  }
  const pythonIndexes =
    manifest.packages?.python?.preferredPrivateIndexes ?? [];
  for (const index of ["Cloudsmith", "CodeArtifact", "Gemfury"]) {
    if (!pythonIndexes.includes(index)) {
      errors.push(
        `${ORIGIN_MANIFEST_PATH}: Python private index plan must include ${index}`,
      );
    }
  }
  const shortTermOptions = manifest.packages?.python?.shortTermOptions ?? [];
  if (
    !shortTermOptions.includes("GitHub Releases wheels") ||
    !shortTermOptions.includes("uv git deps")
  ) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: Python short-term plan must include GitHub Releases wheels and uv git deps`,
    );
  }
  const cursorBoundary = manifest.serviceBoundaries?.find(
    (boundary) => boundary.service === "model_fusion.v1.CursorHarnessService",
  );
  if (cursorBoundary?.proto !== CURSOR_HARNESS_PROTO_PATH) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: CursorHarnessService proto path must be ${CURSOR_HARNESS_PROTO_PATH}`,
    );
  }
  if (cursorBoundary?.generatedTypescript !== CURSOR_HARNESS_TS_PATH) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: CursorHarnessService generated TypeScript path must be ${CURSOR_HARNESS_TS_PATH}`,
    );
  }
}

function checkFixtureBundleHashes(errors: string[]): void {
  for (const fixturePath of listJsonFiles(resolvePath(CONTRACT_FIXTURE_ROOT))) {
    const relativePath = path.relative(ROOT, fixturePath);
    const parsed = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
      schema_bundle_hash?: string;
    };
    if (parsed.schema_bundle_hash !== MODEL_FUSION_SCHEMA_BUNDLE_HASH) {
      errors.push(
        `${relativePath}: schema_bundle_hash ${String(parsed.schema_bundle_hash)} does not match ${MODEL_FUSION_SCHEMA_BUNDLE_HASH}`,
      );
    }
  }
}

function checkCursorHarnessIdl(errors: string[]): void {
  const proto = readRequiredText(CURSOR_HARNESS_PROTO_PATH, errors);
  const generated = readRequiredText(CURSOR_HARNESS_TS_PATH, errors);
  if (proto !== undefined) {
    for (const expected of [
      "package model_fusion.v1;",
      "service CursorHarnessService",
      "rpc RunCursorHarness",
      "cursor_run_request_json",
      "harness_run_result_json",
    ]) {
      if (!proto.includes(expected)) {
        errors.push(`${CURSOR_HARNESS_PROTO_PATH}: missing ${expected}`);
      }
    }
  }
  if (generated !== undefined) {
    for (const expected of [
      "file_model_fusion_v1_cursor_harness",
      "CursorHarnessRunRequestSchema",
      "CursorHarnessRunResultSchema",
      "CursorHarnessService",
      "runCursorHarness",
    ]) {
      if (!generated.includes(expected)) {
        errors.push(`${CURSOR_HARNESS_TS_PATH}: missing ${expected}`);
      }
    }
  }
}

function checkProtocolDocs(errors: string[]): void {
  const doc = readRequiredText(PROTOCOL_DOC_PATH, errors);
  if (doc === undefined) {
    return;
  }
  const normalizedDoc = doc.replace(/\s+/g, " ");
  for (const expected of [
    "fusionkit",
    "@velum/model-fusion-protocol",
    "Cloudsmith",
    "CodeArtifact",
    "Gemfury",
    "GitHub Releases wheels",
    "uv",
    "HarnessExecutorService",
    "CursorHarnessService",
    "MlxProviderService",
    "Benchmark execution",
    "JSON Schema remains the persisted audit format",
  ]) {
    if (!normalizedDoc.includes(expected)) {
      errors.push(`${PROTOCOL_DOC_PATH}: missing ${expected}`);
    }
  }
}

function readRequiredText(
  relativePath: string,
  errors: string[],
): string | undefined {
  try {
    return fs.readFileSync(resolvePath(relativePath), "utf8");
  } catch (error) {
    errors.push(
      `${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

function listJsonFiles(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
  });
}

function resolvePath(relativePath: string): string {
  return path.resolve(ROOT, relativePath);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const errors = checkModelFusionProtocol();
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exitCode = 1;
  }
}
