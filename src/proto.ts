import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import protobuf from "protobufjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export interface CursorProto {
  root: protobuf.Root;
  AvailableModelsRequest: protobuf.Type;
  AvailableModelsResponse: protobuf.Type;
  StreamUnifiedChatRequestWithTools: protobuf.Type;
  StreamUnifiedChatResponseWithTools: protobuf.Type;
}

export async function loadCursorProto(): Promise<CursorProto> {
  const root = await protobuf.load(listProtoFiles(resolveProtoDirectory()));
  return {
    root,
    AvailableModelsRequest: root.lookupType(
      "aiserver.v1.AvailableModelsRequest",
    ),
    AvailableModelsResponse: root.lookupType(
      "aiserver.v1.AvailableModelsResponse",
    ),
    StreamUnifiedChatRequestWithTools: root.lookupType(
      "aiserver.v1.StreamUnifiedChatRequestWithTools",
    ),
    StreamUnifiedChatResponseWithTools: root.lookupType(
      "aiserver.v1.StreamUnifiedChatResponseWithTools",
    ),
  };
}

export function resolveProtoDirectory(): string {
  for (const candidate of candidateRoots()) {
    const protoDir = path.join(candidate, "proto");
    if (
      fs.existsSync(path.join(protoDir, "aiserver", "v1", "aiserver.proto"))
    ) {
      return protoDir;
    }
  }
  throw new Error("Unable to locate proto/aiserver/v1/aiserver.proto");
}

export function listProtoFiles(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listProtoFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".proto")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

export function encodeMessage(
  type: protobuf.Type,
  value: Record<string, unknown>,
): Buffer {
  const error = type.verify(value);
  if (error) {
    throw new Error(`${type.fullName} verification failed: ${error}`);
  }
  return Buffer.from(type.encode(type.create(value)).finish());
}

export function decodeMessage(
  type: protobuf.Type,
  payload: Uint8Array,
): Record<string, unknown> {
  return type.toObject(type.decode(payload), {
    defaults: false,
    longs: String,
    enums: Number,
    bytes: Buffer,
  }) as Record<string, unknown>;
}

function candidateRoots(): string[] {
  return [
    process.cwd(),
    path.resolve(currentDir, ".."),
    path.resolve(currentDir, "..", ".."),
    path.resolve(currentDir, "..", "..", ".."),
  ];
}
