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
      currentStatus?: string;
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
  mergeBlocker?: {
    status?: string;
    reason?: string;
    requiredBeforeReady?: string[];
  };
  followUpWorkOutsideCursorkit?: string[];
};

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  modelFusionProtocol?: {
    packageName?: string;
    version?: string;
    schemaBundleHash?: string;
  };
};

const ROOT = process.cwd();
const ORIGIN_MANIFEST_PATH = "docs/model-fusion-protocol-origin.json";
const PROTOCOL_DOC_PATH = "docs/model-fusion-protocol.md";
const PACKAGE_JSON_PATH = "package.json";
const PROTOCOL_PACKAGE_NAME = "@velum-labs/model-fusion-protocol";
const CONTRACT_FIXTURE_ROOT = "fixtures/model-fusion-contract";
const CURSOR_HARNESS_PROTO_PATH = "proto/model_fusion/v1/cursor_harness.proto";
const CURSOR_HARNESS_TS_PATH = "src/gen/model_fusion/v1/cursor_harness_pb.ts";
const CURSOR_HARNESS_OPENAPI_PATH =
  "docs/model-fusion-cursor-harness.openapi.yaml";
const CURSOR_HARNESS_OPENAPI_TS_PATH =
  "src/gen/model_fusion/cursor_harness_openapi.ts";

export function checkModelFusionProtocol(): string[] {
  const errors: string[] = [];
  const manifest = readManifest(errors);
  const packageJson = readPackageJson(errors);
  if (manifest !== undefined) {
    checkManifest(manifest, packageJson, errors);
  }
  checkFixtureBundleHashes(errors);
  checkNoLocalProtocolMirrors(errors);
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

function readPackageJson(errors: string[]): PackageJson | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(resolvePath(PACKAGE_JSON_PATH), "utf8"),
    ) as PackageJson;
  } catch (error) {
    errors.push(
      `${PACKAGE_JSON_PATH}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

function checkManifest(
  manifest: ProtocolOriginManifest,
  packageJson: PackageJson | undefined,
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
  checkPackageConsumptionOrBlocker(manifest, packageJson, errors);
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
  if (
    manifest.packages?.typescript?.name !== "@velum-labs/model-fusion-protocol"
  ) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: TypeScript package target must be @velum-labs/model-fusion-protocol`,
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
  if (cursorBoundary?.openapi !== undefined) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: CursorHarnessHttpApi must not point at a local OpenAPI mirror while @velum-labs/model-fusion-protocol is unavailable`,
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
    "@velum-labs/model-fusion-protocol",
    "velum-model-fusion-protocol wheels",
    "TS OpenAPI client/types",
    "TS durable-record validators/types",
    "Python OpenAPI client/models",
    "JSON Schema/Pydantic validators",
    "JSON Schema bundle metadata",
  ]) {
    if (!followUps.some((item) => item.includes(expected))) {
      errors.push(
        `${ORIGIN_MANIFEST_PATH}: followUpWorkOutsideCursorkit must mention ${expected}`,
      );
    }
  }
}

function checkPackageConsumptionOrBlocker(
  manifest: ProtocolOriginManifest,
  packageJson: PackageJson | undefined,
  errors: string[],
): void {
  const consumedVersion =
    packageJson?.dependencies?.[PROTOCOL_PACKAGE_NAME] ??
    packageJson?.devDependencies?.[PROTOCOL_PACKAGE_NAME];
  if (consumedVersion !== undefined) {
    const pin = packageJson?.modelFusionProtocol;
    if (pin?.packageName !== PROTOCOL_PACKAGE_NAME) {
      errors.push(
        `${PACKAGE_JSON_PATH}: modelFusionProtocol.packageName must be ${PROTOCOL_PACKAGE_NAME}`,
      );
    }
    if (pin?.schemaBundleHash !== manifest.schemaBundleHash) {
      errors.push(
        `${PACKAGE_JSON_PATH}: consumed protocol package schema bundle hash must match ${ORIGIN_MANIFEST_PATH}`,
      );
    }
    if (pin?.version !== consumedVersion.replace(/^[~^]/, "")) {
      errors.push(
        `${PACKAGE_JSON_PATH}: modelFusionProtocol.version must match consumed ${PROTOCOL_PACKAGE_NAME} version`,
      );
    }
    checkInstalledProtocolPackageMetadata(manifest, pin, errors);
    return;
  }

  if (
    manifest.packages?.typescript?.currentStatus !==
    "blocked-missing-registry-package"
  ) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: packages.typescript.currentStatus must document blocked-missing-registry-package when ${PROTOCOL_PACKAGE_NAME} is absent`,
    );
  }
  if (manifest.mergeBlocker?.status !== "blocked") {
    errors.push(`${ORIGIN_MANIFEST_PATH}: mergeBlocker.status must be blocked`);
  }
  if (!manifest.mergeBlocker?.reason?.includes(PROTOCOL_PACKAGE_NAME)) {
    errors.push(
      `${ORIGIN_MANIFEST_PATH}: mergeBlocker.reason must mention ${PROTOCOL_PACKAGE_NAME}`,
    );
  }
  for (const expected of [
    `Publish ${PROTOCOL_PACKAGE_NAME}`,
    `Add ${PROTOCOL_PACKAGE_NAME}`,
    "Replace local model-fusion contract mirrors",
    "schema bundle hash matches",
  ]) {
    if (
      !manifest.mergeBlocker?.requiredBeforeReady?.some((item) =>
        item.includes(expected),
      )
    ) {
      errors.push(
        `${ORIGIN_MANIFEST_PATH}: mergeBlocker.requiredBeforeReady must mention ${expected}`,
      );
    }
  }
}

function checkInstalledProtocolPackageMetadata(
  manifest: ProtocolOriginManifest,
  pin: PackageJson["modelFusionProtocol"] | undefined,
  errors: string[],
): void {
  const packageMetadataPath = resolvePath(
    "node_modules/@velum-labs/model-fusion-protocol/protocol-package.json",
  );
  let metadata: {
    package_name?: string;
    version?: string;
    schema_bundle_hash?: string;
  };
  try {
    metadata = JSON.parse(fs.readFileSync(packageMetadataPath, "utf8")) as {
      package_name?: string;
      version?: string;
      schema_bundle_hash?: string;
    };
  } catch (error) {
    errors.push(
      `${PROTOCOL_PACKAGE_NAME}: installed protocol-package.json is required: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }
  if (metadata.package_name !== PROTOCOL_PACKAGE_NAME) {
    errors.push(
      `${PROTOCOL_PACKAGE_NAME}: protocol-package.json package_name must be ${PROTOCOL_PACKAGE_NAME}`,
    );
  }
  if (metadata.version !== pin?.version) {
    errors.push(
      `${PROTOCOL_PACKAGE_NAME}: protocol-package.json version must match ${PACKAGE_JSON_PATH} modelFusionProtocol.version`,
    );
  }
  if (metadata.schema_bundle_hash !== manifest.schemaBundleHash) {
    errors.push(
      `${PROTOCOL_PACKAGE_NAME}: protocol-package.json schema_bundle_hash must match ${ORIGIN_MANIFEST_PATH}`,
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

function checkNoLocalProtocolMirrors(errors: string[]): void {
  for (const relativePath of [
    CURSOR_HARNESS_PROTO_PATH,
    CURSOR_HARNESS_TS_PATH,
    CURSOR_HARNESS_OPENAPI_PATH,
    CURSOR_HARNESS_OPENAPI_TS_PATH,
  ]) {
    if (fs.existsSync(resolvePath(relativePath))) {
      errors.push(
        `${relativePath}: local model-fusion protocol mirrors are not merge-ready; consume ${PROTOCOL_PACKAGE_NAME} or document the missing-package blocker`,
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
    "@velum-labs/model-fusion-protocol",
    "OpenAPI 3.1 is the source of truth",
    "Service/API clients and request/response models should be generated from OpenAPI specs",
    "Durable record validators and record types should be generated from the JSON Schema bundle",
    "JSON Schema remains the persisted audit and benchmark record format",
    "Protobuf/Buf is reserved for later internal streaming",
    "openapi-typescript",
    "openapi-fetch",
    "openapi-python-client",
    "datamodel-code-generator",
    "Published package consumption",
    "installed as a cursorkit dev dependency",
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
