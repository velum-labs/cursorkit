# Cursor Protobuf Extractor

Vendored from `https://github.com/unkn0wncode/extract-cursor-protos`.

This tool extracts Protobuf definitions from the Cursor application. Some of
the upstream project's code is based on work from `everestmz/cursor-rpc`, but
that extractor reportedly no longer works with recent Cursor versions.

## Requirements

- Go 1.21+
- Node.js and npm
- Prettier. In this repo, run through `npm run extract:protos` so
  `node_modules/.bin/prettier` is on PATH.

## Usage From This Repo

```bash
npm run extract:protos
```

Or run the vendored tool directly:

```bash
go run ./vendor/extract-cursor-protos /Applications/Cursor.app proto
```

The first argument is the Cursor app path. The optional second argument is the
output root. This repo defaults to `proto/`, producing:

```text
proto/aiserver/v1/aiserver.proto
```

## Upstream Compatibility Notes

The upstream extractor targets latest stable Cursor releases and Cursor Nightly
builds around `2.4.0-pre.14.patch.0`. It detects multiple service registries,
including `aiserver.v1` and `agent.v1`, and merges them.
