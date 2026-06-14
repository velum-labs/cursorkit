import { create, toBinary } from "@bufbuild/protobuf";

import { AgentV1_NameAgentResponseSchema } from "../gen/aiserver/v1/aiserver_pb.js";

export function buildLocalNameAgentResponse(): Buffer {
  return Buffer.from(
    toBinary(
      AgentV1_NameAgentResponseSchema,
      create(AgentV1_NameAgentResponseSchema, {
        name: "Local model chat",
      }),
    ),
  );
}
