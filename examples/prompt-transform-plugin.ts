import type { CursorExtension } from "cursor-rpc/extensions";

const extension: CursorExtension = {
  name: "prompt-transform-placeholder",
  setup(context) {
    context.logger.warn(
      "prompt transforms require body-consuming middleware and fixture coverage before use",
    );
  },
};

export default extension;
