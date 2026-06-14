import fs from "node:fs";
import path from "node:path";

import type { ArtifactWriter, ScenarioResult } from "./types.js";

export class FileArtifactStore implements ArtifactWriter {
  readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    fs.mkdirSync(rootDir, { recursive: true });
  }

  pathFor(name: string): string {
    return path.join(this.rootDir, sanitizeArtifactName(name));
  }

  writeText(name: string, contents: string): string {
    const artifactPath = this.pathFor(name);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, contents);
    return artifactPath;
  }

  writeJson(name: string, contents: unknown): string {
    return this.writeText(name, `${JSON.stringify(contents, null, 2)}\n`);
  }
}

export function createRunDirectory(options: {
  cwd: string;
  artifactsDir?: string;
  now?: Date;
}): string {
  if (options.artifactsDir !== undefined) {
    return path.resolve(options.cwd, options.artifactsDir);
  }
  const timestamp = (options.now ?? new Date())
    .toISOString()
    .replace(/[:.]/g, "-");
  return path.join(options.cwd, ".cursor-rpc", "test-runs", timestamp);
}

export function writeRunSummary(
  artifacts: ArtifactWriter,
  results: ScenarioResult[],
): Record<string, string> {
  return {
    json: artifacts.writeJson("summary.json", {
      status: results.some((result) => result.status === "failed")
        ? "failed"
        : "passed",
      results,
    }),
    markdown: artifacts.writeText("summary.md", renderMarkdownSummary(results)),
    junit: artifacts.writeText("junit.xml", renderJunit(results)),
  };
}

function renderMarkdownSummary(results: ScenarioResult[]): string {
  const lines = ["# Harness Summary", ""];
  for (const result of results) {
    lines.push(
      `- ${result.status.toUpperCase()} ${result.id}: ${result.message}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderJunit(results: ScenarioResult[]): string {
  const failures = results.filter((result) => result.status === "failed");
  const skipped = results.filter((result) => result.status === "skipped");
  const testcases = results
    .map((result) => {
      const seconds = (result.durationMs / 1000).toFixed(3);
      if (result.status === "failed") {
        return `  <testcase classname="cursor-rpc.harness" name="${escapeXml(result.id)}" time="${seconds}"><failure message="${escapeXml(result.message)}">${escapeXml(result.failureCode ?? "command_failed")}</failure></testcase>`;
      }
      if (result.status === "skipped") {
        return `  <testcase classname="cursor-rpc.harness" name="${escapeXml(result.id)}" time="${seconds}"><skipped message="${escapeXml(result.message)}" /></testcase>`;
      }
      return `  <testcase classname="cursor-rpc.harness" name="${escapeXml(result.id)}" time="${seconds}" />`;
    })
    .join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuite name="cursor-rpc-harness" tests="${results.length}" failures="${failures.length}" skipped="${skipped.length}">`,
    testcases,
    `</testsuite>`,
    "",
  ].join("\n");
}

function sanitizeArtifactName(name: string): string {
  return name
    .split("/")
    .map((part) => {
      if (part === "." || part === ".." || part.length === 0) {
        return "_";
      }
      return part.replace(/[^A-Za-z0-9._-]/g, "_");
    })
    .join("/");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
