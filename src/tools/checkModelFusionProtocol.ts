import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { MODEL_FUSION_SCHEMA_BUNDLE_HASH } from "../fixtures/modelFusion.js";

type ProtocolOriginManifest = {
  schemaVersion: number;
  canonicalSpec?: string;
  schemaBundleHash: string;
  persistedJsonSchemas: string[];
  serviceIdl?: {
    sourceOfTruth?: string;
    openapi?: string;
    localCursorkitStatus?: string;
  };
  protobufBuf?: {
    v1Required?: boolean;
    status?: string;
  };
  persistedRecordFormat?: {
    sourceOfTruth?: string;
  };
  packages?: {
    typescript?: {
      name?: string;
      registry?: string;
      generatedFrom?: string;
    };
    python?: {
      preferredPrivateIndexes?: string[];
      shortTermOptions?: string[];
      generatedFrom?: string;
    };
  };
  serviceBoundaries?: Array<{
    service?: string;
    openapi?: string;
    canonicalSource?: string;
  }>;
  followUpWorkOutsideCursorkit?: string[];
};

const ROOT = process.cwd();
const ORIGIN_MANIFEST_PATH = "docs/model-fusion-protocol-origin.json";
const PROTOCOL_DOC_PATH = "docs/model-fusion-protocol.md";
const CURSOR_HARNESS_OPENAPI_PATH =
  "docs/model-fusion-cursor-harness.openapi.yaml";
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
  checkCursorHarnessOpenApi(errors);
  checkNoV1ProtoMirror(errors);
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
  if (
    manifest.canonicalSpec !==
    "https://github.com/velum-labs/openclaw-shared/blob/main/spec/2026-06-16-model-fusion-protocol-packaging-spec.md"
  ) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: canonicalSpec must point at the shared protocol packaging spec`,
    );
  }
  if (manifest.schemaBundleHash !== MODEL_FUSION_SCHEMA_BUNDLE_HASH) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: schemaBundleHash ${manifest.schemaBundleHash} does not match MODEL_FUSION_SCHEMA_BUNDLE_HASH ${MODEL_FUSION_SCHEMA_BUNDLE_HASH}`,
    );
  }
  if (manifest.serviceIdl?.sourceOfTruth !== "openapi-3.1") {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: serviceIdl.sourceOfTruth must be openapi-3.1`,
    );
  }
  if (manifest.serviceIdl?.openapi !== "v1-http-json-source-of-truth") {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: serviceIdl.openapi must be v1-http-json-source-of-truth`,
    );
  }
  if (manifest.protobufBuf?.v1Required !== false) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: protobufBuf.v1Required must be false`,
    );
  }
  if (
    manifest.protobufBuf?.status !==
    "reserved-for-future-internal-streaming-connect-grpc"
  ) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: protobufBuf.status must reserve protobuf/Buf for future internal streaming/Connect/gRPC`,
    );
  }
  if (manifest.persistedRecordFormat?.sourceOfTruth !== "json-schema") {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: persistedRecordFormat.sourceOfTruth must be json-schema`,
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
  if (
    manifest.packages?.typescript?.generatedFrom !==
    "fusionkit JSON Schema and OpenAPI 3.1 contracts"
  ) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: TypeScript package must be generated from fusionkit JSON Schema and OpenAPI 3.1 contracts`,
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
  if (
    manifest.packages?.python?.generatedFrom !==
    "fusionkit JSON Schema and OpenAPI 3.1 contracts"
  ) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: Python package must be generated from fusionkit JSON Schema and OpenAPI 3.1 contracts`,
    );
  }
  const cursorBoundary = manifest.serviceBoundaries?.find(
    (boundary) => boundary.service === "CursorHarnessHttpApi",
  );
  if (cursorBoundary?.openapi !== CURSOR_HARNESS_OPENAPI_PATH) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: CursorHarnessHttpApi OpenAPI path must be ${CURSOR_HARNESS_OPENAPI_PATH}`,
    );
  }
  if (cursorBoundary?.canonicalSource !== "fusionkit") {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: CursorHarnessHttpApi canonicalSource must be fusionkit`,
    );
  }
  const followUps = manifest.followUpWorkOutsideCursorkit ?? [];
  for (const expected of [
    "OpenAPI 3.1 source",
    "@velum/model-fusion-protocol",
    "velum-model-fusion-protocol wheels",
    "SDKs from fusionkit JSON Schema/OpenAPI",
    "JSON Schema bundle metadata",
  ]) {
    if (!followUps.some((item) => item.includes(expected))) {
      errors.push(
        `${ORIGIN_MANIFEST_PATH}: followUpWorkOutsideCursorkit must mention ${expected}`,
      );
    }
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

function checkCursorHarnessOpenApi(errors: string[]): void {
  const openApi = readRequiredText(CURSOR_HARNESS_OPENAPI_PATH, errors);
  if (openApi === undefined) {
    return;
  }
  for (const expected of [
    "openapi: 3.1.0",
    "/model-fusion/v1/cursor-harness:run",
    "operationId: runCursorHarness",
    "CursorHarnessRunRequest",
    "CursorHarnessRunResult",
    "CursorRunRequestV1",
    "CursorRunResultV1",
    "HarnessRunRequestV1",
    "HarnessRunResultV1",
    "x-model-fusion-origin: fusionkit",
  ]) {
    if (!openApi.includes(expected)) {
      errors.push(`${CURSOR_HARNESS_OPENAPI_PATH}: missing ${expected}`);
    }
  }
}

function checkNoV1ProtoMirror(errors: string[]): void {
  for (const relativePath of [
    CURSOR_HARNESS_PROTO_PATH,
    CURSOR_HARNESS_TS_PATH,
  ]) {
    if (fs.existsSync(resolvePath(relativePath))) {
      errors.push(
        `${relativePath}: protobuf/Buf is not a required v1 model-fusion path; remove or keep out of the v1 guard`,
      );
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
    "OpenAPI 3.1 is the source of truth",
    "JSON Schema remains the persisted audit and benchmark record format",
    "Protobuf/Buf is reserved for later internal streaming",
    "Cloudsmith",
    "CodeArtifact",
    "Gemfury",
    "GitHub Releases wheels",
    "uv",
    "HarnessExecutorService",
    "Cursor harness OpenAPI",
    "MlxProviderService",
    "Benchmark execution",
    "Follow-up outside cursorkit",
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
