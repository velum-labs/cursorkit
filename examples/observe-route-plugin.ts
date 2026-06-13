import type { CursorExtension } from "cursor-rpc/extensions";

const extension: CursorExtension = {
  name: "observe-route",
  setup(context) {
    context.middleware.register({
      kind: "request",
      bodyAccess: "metadata-only",
      run(request) {
        context.logger.info("observed request", {
          method: request.method,
          url: request.url,
        });
      },
    });
  },
};

export default extension;
