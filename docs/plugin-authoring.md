# Plugin Authoring

The extension API is experimental and local-only. Plugins run as trusted in-process code; remote plugin loading is not supported.

## Minimal Shape

```ts
import type { CursorExtension } from "@velum-labs/cursorkit/extensions";

export default {
  name: "my-extension",
  setup(context) {
    context.logger.info("extension loaded");
  },
} satisfies CursorExtension;
```

## Rules

- Model IDs must be unique.
- Route handlers must be unique per path.
- Middleware is metadata-only unless it explicitly declares `bodyAccess: "consume"`.
- New endpoint work starts observe-only, then decode-only with fixtures, then intercept-capable behind config.
- Experimental APIs may change before the package becomes publishable.
