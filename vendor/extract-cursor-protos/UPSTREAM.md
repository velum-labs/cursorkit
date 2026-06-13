# Vendored Cursor Proto Extractor

This directory vendors the extraction logic from the public research repository:

- Upstream: `https://github.com/unkn0wncode/extract-cursor-protos`
- Tree observed: `1932c41e1e53adc8b118fe73cfe462828682a802`
- Files vendored: `main.go`, `preprocess.js`, `postprocess.js`, `.gitignore`, and upstream README text.

No license file was present in the upstream repository at the time this copy was
made. Treat this code as an attributed research reference, not production
infrastructure.

Local patch:

- `main.go` accepts an optional second argument for the output directory.
- The repo script `pnpm extract:protos` writes refreshed output to `proto/`.
