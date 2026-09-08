import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Tool, ToolInput, ToolOutput } from "../types.js";

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".java", ".cs", ".cpp", ".c", ".h",
  ".md", ".json", ".yaml", ".yml", ".toml",
]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "coverage", ".next"]);

interface CodeMatch {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

async function searchDir(
  dir: string,
  pattern: RegExp,
  matches: CodeMatch[],
  maxMatches: number,
): Promise<void> {
  if (matches.length >= maxMatches) return;
  let names: string[];
  try { names = await readdir(dir); } catch { return; }

  for (const name of names) {
    if (matches.length >= maxMatches) break;
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let s: Awaited<ReturnType<typeof stat>>;
    try { s = await stat(full); } catch { continue; }

    if (s.isDirectory()) {
      await searchDir(full, pattern, matches, maxMatches);
    } else if (s.isFile()) {
      const ext = name.includes(".") ? `.${name.split(".").pop() ?? ""}` : "";
      if (!CODE_EXTENSIONS.has(ext)) continue;
      try {
        const content = await readFile(full, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
          const line = lines[i];
          if (line !== undefined && pattern.test(line)) {
            matches.push({ file: full, line: i + 1, text: line.trim() });
          }
        }
      } catch { /* skip unreadable */ }
    }
  }
}

export const searchCodeTool: Tool = {
  definition: {
    id: "kairos.search-code",
    name: "Search Code",
    description: "Searches for a text or regex pattern across source files in a directory.",
    version: "1.0.0",
    capabilities: ["read-local"],
    permission: "restricted",
    risk: "low",
    inputSchema: {
      path: { type: "string", description: "Root directory to search." },
      pattern: { type: "string", description: "Text or regex pattern to match." },
      maxMatches: { type: "number", description: "Maximum matches to return (default 50)." },
    },
    outputSchema: {
      matches: { type: "array", description: "Matching lines with file and line number." },
      totalMatches: { type: "number", description: "Number of matches found." },
    },
    enabled: true,
  },

  async execute(input: ToolInput): Promise<ToolOutput> {
    const startedAt = new Date();
    const start = Date.now();
    const path = input.parameters["path"];
    const pattern = input.parameters["pattern"];
    const maxMatchesRaw = input.parameters["maxMatches"];
    const maxMatches =
      typeof maxMatchesRaw === "number" && maxMatchesRaw > 0 ? maxMatchesRaw : 50;

    if (typeof path !== "string" || path.trim() === "") {
      return {
        toolId: input.toolId, requestId: input.requestId,
        status: "failure", error: "Parameter 'path' must be a non-empty string.",
        executedAt: startedAt, durationMs: Date.now() - start,
      };
    }

    if (typeof pattern !== "string" || pattern.trim() === "") {
      return {
        toolId: input.toolId, requestId: input.requestId,
        status: "failure", error: "Parameter 'pattern' must be a non-empty string.",
        executedAt: startedAt, durationMs: Date.now() - start,
      };
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      return {
        toolId: input.toolId, requestId: input.requestId,
        status: "failure", error: `Invalid regex pattern: ${pattern}`,
        executedAt: startedAt, durationMs: Date.now() - start,
      };
    }

    try {
      const matches: CodeMatch[] = [];
      await searchDir(path, regex, matches, maxMatches);
      return {
        toolId: input.toolId, requestId: input.requestId,
        status: "success",
        result: { path, pattern, matches, totalMatches: matches.length },
        executedAt: startedAt, durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolId: input.toolId, requestId: input.requestId,
        status: "failure",
        error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
        executedAt: startedAt, durationMs: Date.now() - start,
      };
    }
  },
};