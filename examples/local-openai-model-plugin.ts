import type { CursorExtension } from "cursor-rpc/extensions";
import { OpenAICompatibleProvider } from "cursor-rpc/providers/openai";

const extension: CursorExtension = {
  name: "local-openai-model",
  setup(context) {
    context.models.register({
      id: "example-local-model",
      displayName: "Example Local Model",
      contextTokenLimit: 32768,
      provider: new OpenAICompatibleProvider({
        id: "example-local-model",
        displayName: "Example Local Model",
        baseUrl: "http://localhost:8080/v1",
        apiKey: "",
        contextTokenLimit: 32768,
      }),
    });
  },
};

export default extension;
