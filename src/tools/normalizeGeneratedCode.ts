import fs from "node:fs";
import path from "node:path";

const GENERATED_ROOT = path.resolve(process.cwd(), "src", "gen");

function normalizeGeneratedFiles(directory: string): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      normalizeGeneratedFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      const content = fs.readFileSync(fullPath, "utf8");
      fs.writeFileSync(fullPath, `${content.trimEnd()}\n`);
    }
  }
}

if (fs.existsSync(GENERATED_ROOT)) {
  normalizeGeneratedFiles(GENERATED_ROOT);
}
