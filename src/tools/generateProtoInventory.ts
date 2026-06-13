import fs from "node:fs";
import path from "node:path";

import { listProtoFiles, resolveProtoDirectory } from "../proto.js";

interface ServiceMethod {
  packageName: string;
  service: string;
  method: string;
  inputType: string;
  outputType: string;
  serverStreaming: boolean;
}

interface TypeEntry {
  packageName: string;
  kind: "message" | "enum";
  name: string;
}

export function generateProtoInventory(repoRoot = process.cwd()): void {
  const protoDir = resolveProtoDirectory();
  const serviceMethods: ServiceMethod[] = [];
  const types: TypeEntry[] = [];

  for (const file of listProtoFiles(protoDir)) {
    const content = fs.readFileSync(file, "utf8");
    const packageName =
      /^package\s+([a-zA-Z0-9_.]+);/m.exec(content)?.[1] ?? "unknown";
    for (const match of content.matchAll(/^message\s+([A-Za-z0-9_]+)\s+\{/gm)) {
      types.push({ packageName, kind: "message", name: match[1] ?? "unknown" });
    }
    for (const match of content.matchAll(/^enum\s+([A-Za-z0-9_]+)\s+\{/gm)) {
      types.push({ packageName, kind: "enum", name: match[1] ?? "unknown" });
    }
    for (const serviceMatch of content.matchAll(
      /^service\s+([A-Za-z0-9_]+)\s+\{([\s\S]*?)^}/gm,
    )) {
      const service = serviceMatch[1] ?? "unknown";
      const body = serviceMatch[2] ?? "";
      for (const rpcMatch of body.matchAll(
        /^\s*rpc\s+([A-Za-z0-9_]+)\(([^)]+)\)\s+returns\s+\((stream\s+)?([^)]+)\)/gm,
      )) {
        serviceMethods.push({
          packageName,
          service,
          method: rpcMatch[1] ?? "unknown",
          inputType: rpcMatch[2] ?? "unknown",
          outputType: rpcMatch[4] ?? "unknown",
          serverStreaming: rpcMatch[3] !== undefined,
        });
      }
    }
  }

  const docsDir = path.join(repoRoot, "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(
    path.join(docsDir, "service-manifest.json"),
    `${JSON.stringify(serviceMethods, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(docsDir, "type-manifest-summary.json"),
    `${JSON.stringify(types, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(docsDir, "proto-inventory.md"),
    renderInventory(protoDir, serviceMethods, types),
  );
}

function renderInventory(
  protoDir: string,
  serviceMethods: ServiceMethod[],
  types: TypeEntry[],
): string {
  const services = new Map<string, ServiceMethod[]>();
  for (const method of serviceMethods) {
    const key = `${method.packageName}.${method.service}`;
    services.set(key, [...(services.get(key) ?? []), method]);
  }

  const streamingMethods = serviceMethods.filter(
    (method) => method.serverStreaming,
  ).length;
  const messages = types.filter((type) => type.kind === "message").length;
  const enums = types.filter((type) => type.kind === "enum").length;
  const lines = [
    "# Proto Inventory",
    "",
    `Generated from the default proto directory: \`${path.relative(process.cwd(), protoDir)}\`.`,
    "",
    "## Extraction Summary",
    "",
    `- Services: ${services.size} total`,
    `- RPC methods: ${serviceMethods.length} total`,
    `- Server-streaming RPC methods: ${streamingMethods} total`,
    `- Top-level messages: ${messages}`,
    `- Top-level enums: ${enums}`,
    `- Proto files: ${listProtoFiles(protoDir)
      .map((file) => `\`${path.relative(process.cwd(), file)}\``)
      .join(", ")}`,
    "",
    "## Important Caveats",
    "",
    "- Runtime interception remains route-policy allowlisted and fixture-backed.",
    "- Unknown endpoints pass through unchanged by default.",
    "- The extractor still logs a non-fatal Cursor bundle `TypeError` after processing services, then writes proto files successfully.",
    "",
    "## Services",
    "",
  ];

  let index = 1;
  for (const [service, methods] of Array.from(services.entries()).sort()) {
    lines.push(
      `${index}. \`${service}\`: ${methods.length} RPCs${methods.some((method) => method.serverStreaming) ? `, ${methods.filter((method) => method.serverStreaming).length} streaming` : ""}`,
    );
    index++;
  }

  lines.push("", "## Service Methods", "");
  for (const [service, methods] of Array.from(services.entries()).sort()) {
    lines.push(`### \`${service}\``, "");
    for (const method of methods) {
      lines.push(
        `- \`${method.method}(${method.inputType}) returns (${method.serverStreaming ? "stream " : ""}${method.outputType})\``,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateProtoInventory();
}
