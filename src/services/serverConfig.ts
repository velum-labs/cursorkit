import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import {
  AgentUrlConfigSchema,
  GetServerConfigResponseSchema,
  Http2Config,
  type GetServerConfigResponse,
} from "../gen/aiserver/v1/aiserver_pb.js";

export function rewriteServerConfigAgentUrls(
  upstreamPayload: Buffer,
  bridgeOrigin: string,
): Buffer {
  const upstream = fromBinary(GetServerConfigResponseSchema, upstreamPayload);
  return encodeServerConfig(upstream, bridgeOrigin);
}

export function buildLocalServerConfig(bridgeOrigin: string): Buffer {
  return encodeServerConfig(
    create(GetServerConfigResponseSchema),
    bridgeOrigin,
  );
}

function encodeServerConfig(
  upstream: GetServerConfigResponse,
  bridgeOrigin: string,
): Buffer {
  return Buffer.from(
    toBinary(GetServerConfigResponseSchema, {
      ...upstream,
      http2Config: Http2Config.HTTP2_CONFIG_FORCE_ALL_DISABLED,
      agentUrlConfig: create(AgentUrlConfigSchema, {
        agentUrl: bridgeOrigin,
        agentnUrl: bridgeOrigin,
      }),
    }),
  );
}
