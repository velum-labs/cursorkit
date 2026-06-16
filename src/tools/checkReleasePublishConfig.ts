import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { MODEL_FUSION_SCHEMA_BUNDLE_HASH } from "../fixtures/modelFusion.js";

type PackageJson = {
  name?: string;
  version?: string;
  private?: boolean;
  repository?: {
    type?: string;
    url?: string;
  };
  publishConfig?: {
    registry?: string;
    access?: string;
  };
  modelFusionProtocol?: {
    packageName?: string;
    version?: string;
    schemaBundleHash?: string;
    contracts?: string;
    origin?: string;
  };
};

type ProtocolOriginManifest = {
  schemaBundleHash?: string;
  packages?: {
    typescript?: {
      name?: string;
    };
  };
  serviceIdl?: {
    sourceOfTruth?: string;
  };
  persistedRecordFormat?: {
    sourceOfTruth?: string;
  };
};

const PACKAGE_JSON_PATH = "package.json";
const PROTOCOL_ORIGIN_PATH = "docs/model-fusion-protocol-origin.json";
const GITHUB_PACKAGES_REGISTRY = "https://npm.pkg.github.com";
const CANONICAL_REPOSITORY_URL =
  "git+https://github.com/velum-labs/cursorkit.git";
const PROTOCOL_PACKAGE_NAME = "@velum/model-fusion-protocol";
const PROTOCOL_CONTRACTS = "json-schema+openapi-3.1";

export function checkReleasePublishConfig(repoRoot = process.cwd()): string[] {
  const errors: string[] = [];
  const packageJson = readJson<PackageJson>(
    repoRoot,
    PACKAGE_JSON_PATH,
    errors,
  );
  const protocolOrigin = readJson<ProtocolOriginManifest>(
    repoRoot,
    PROTOCOL_ORIGIN_PATH,
    errors,
  );
  if (packageJson === undefined || protocolOrigin === undefined) {
    return errors;
  }

  checkPackageMetadata(packageJson, errors);
  checkProtocolPin(packageJson, protocolOrigin, errors);
  return errors;
}

function checkPackageMetadata(
  packageJson: PackageJson,
  errors: string[],
): void {
  if (packageJson.repository?.url !== CANONICAL_REPOSITORY_URL) {
    errors.push(
      `${PACKAGE_JSON_PATH}: repository.url must be ${CANONICAL_REPOSITORY_URL}`,
    );
  }
  if (packageJson.publishConfig?.registry !== GITHUB_PACKAGES_REGISTRY) {
    errors.push(
      `${PACKAGE_JSON_PATH}: publishConfig.registry must be ${GITHUB_PACKAGES_REGISTRY}`,
    );
  }
  if (packageJson.publishConfig?.access !== "restricted") {
    errors.push(
      `${PACKAGE_JSON_PATH}: publishConfig.access must be restricted`,
    );
  }

  if (packageJson.private === false) {
    if (!packageJson.name?.startsWith("@velum/")) {
      errors.push(
        `${PACKAGE_JSON_PATH}: publishable GitHub Packages npm packages must use the @velum scope`,
      );
    }
  }
}

function checkProtocolPin(
  packageJson: PackageJson,
  protocolOrigin: ProtocolOriginManifest,
  errors: string[],
): void {
  const pin = packageJson.modelFusionProtocol;
  if (pin === undefined) {
    errors.push(`${PACKAGE_JSON_PATH}: modelFusionProtocol pin is required`);
    return;
  }
  if (pin.packageName !== PROTOCOL_PACKAGE_NAME) {
    errors.push(
      `${PACKAGE_JSON_PATH}: modelFusionProtocol.packageName must be ${PROTOCOL_PACKAGE_NAME}`,
    );
  }
  if (
    pin.version === undefined ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pin.version)
  ) {
    errors.push(
      `${PACKAGE_JSON_PATH}: modelFusionProtocol.version must be a pinned semver version`,
    );
  }
  if (pin.schemaBundleHash !== MODEL_FUSION_SCHEMA_BUNDLE_HASH) {
    errors.push(
      `${PACKAGE_JSON_PATH}: modelFusionProtocol.schemaBundleHash must match ${MODEL_FUSION_SCHEMA_BUNDLE_HASH}`,
    );
  }
  if (pin.schemaBundleHash !== protocolOrigin.schemaBundleHash) {
    errors.push(
      `${PACKAGE_JSON_PATH}: modelFusionProtocol.schemaBundleHash must match ${PROTOCOL_ORIGIN_PATH}`,
    );
  }
  if (pin.packageName !== protocolOrigin.packages?.typescript?.name) {
    errors.push(
      `${PACKAGE_JSON_PATH}: modelFusionProtocol.packageName must match ${PROTOCOL_ORIGIN_PATH}`,
    );
  }
  if (pin.contracts !== PROTOCOL_CONTRACTS) {
    errors.push(
      `${PACKAGE_JSON_PATH}: modelFusionProtocol.contracts must be ${PROTOCOL_CONTRACTS}`,
    );
  }
  if (pin.origin !== "fusionkit") {
    errors.push(
      `${PACKAGE_JSON_PATH}: modelFusionProtocol.origin must be fusionkit`,
    );
  }
  if (protocolOrigin.serviceIdl?.sourceOfTruth !== "openapi-3.1") {
    errors.push(
      `${PROTOCOL_ORIGIN_PATH}: serviceIdl.sourceOfTruth must be openapi-3.1 for v1 release publishing`,
    );
  }
  if (protocolOrigin.persistedRecordFormat?.sourceOfTruth !== "json-schema") {
    errors.push(
      `${PROTOCOL_ORIGIN_PATH}: persistedRecordFormat.sourceOfTruth must be json-schema for v1 release publishing`,
    );
  }
}

function readJson<T>(
  repoRoot: string,
  relativePath: string,
  errors: string[],
): T | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8"),
    ) as T;
  } catch (error) {
    errors.push(
      `${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const errors = checkReleasePublishConfig();
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exitCode = 1;
  }
}
