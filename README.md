# cursor-rpc

Unofficial research bridge for experimenting with Cursor's backend protocol from
the server side: keep Cursor's existing UX, but route model inference to a
self-hosted OpenAI-compatible endpoint.

This is personal interoperability research, not a supported Cursor integration.
Read `DISCLAIMER.md` before running it.

## Proto Extraction

The proto extraction logic is vendored in `vendor/extract-cursor-protos`.

```bash
npm install
npm run extract:protos
```

That refreshes `proto/aiserver/v1/aiserver.proto` from the installed Cursor app.
See `docs/refreshing-protos.md` for provenance, custom app paths, and the
fixture workflow required after refreshing.