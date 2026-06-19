import type { CursorExtension } from "@velum-labs/cursorkit/extensions";
import { OpenAICompatibleProvider } from "@velum-labs/cursorkit/providers/openai";

const extension: CursorExtension = {
  name: "local-openai-model",
  manifest: {
    apiVersion: "cursor-rpc/v1",
    trusted: "local",
    permissions: ["models:register"],
  },
  setup(context) {
    const modelConfig = {
      id: "example-local-model",
      displayName: "Example Local Model",
      providerModel: "example-local-model",
      baseUrl: "http://localhost:8080/v1",
      apiKey: "",
      contextTokenLimit: 32768,
    };
    context.models.register({
      id: modelConfig.id,
      displayName: modelConfig.displayName,
      baseUrl: modelConfig.baseUrl,
      apiKey: modelConfig.apiKey,
      contextTokenLimit: modelConfig.contextTokenLimit,
      provider: new OpenAICompatibleProvider(modelConfig),
    });
  },
};

export default extension;
