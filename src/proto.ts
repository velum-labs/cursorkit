import path from "node:path";
import protobuf from "protobufjs";

const protoPath = path.resolve(process.cwd(), "proto", "aiserver", "v1", "aiserver.proto");

export interface CursorProto {
  AvailableModelsRequest: protobuf.Type;
  AvailableModelsResponse: protobuf.Type;
  StreamUnifiedChatRequestWithTools: protobuf.Type;
  StreamUnifiedChatResponseWithTools: protobuf.Type;
}

export async function loadCursorProto(): Promise<CursorProto> {
  const root = await protobuf.load(protoPath);
  return {
    AvailableModelsRequest: root.lookupType("aiserver.v1.AvailableModelsRequest"),
    AvailableModelsResponse: root.lookupType("aiserver.v1.AvailableModelsResponse"),
    StreamUnifiedChatRequestWithTools: root.lookupType("aiserver.v1.StreamUnifiedChatRequestWithTools"),
    StreamUnifiedChatResponseWithTools: root.lookupType("aiserver.v1.StreamUnifiedChatResponseWithTools"),
  };
}

export function encodeMessage(type: protobuf.Type, value: Record<string, unknown>): Buffer {
  const error = type.verify(value);
  if (error) {
    throw new Error(`${type.fullName} verification failed: ${error}`);
  }
  return Buffer.from(type.encode(type.create(value)).finish());
}

export function decodeMessage(type: protobuf.Type, payload: Uint8Array): Record<string, unknown> {
  return type.toObject(type.decode(payload), {
    defaults: false,
    longs: String,
    enums: Number,
    bytes: Buffer,
  }) as Record<string, unknown>;
}
