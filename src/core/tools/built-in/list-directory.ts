import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Tool, ToolInput, ToolOutput } from "../types.js";

interface DirectoryEntry {
  readonly name: string;
  readonly type: "file" | "directory";
  readonly sizeBytes: number;
}

export const listDirectoryTool: Tool = {
  definition: {
    id: "kairos.list-directory",
    name: "List Directory",
    description: "Lists the files and directories at the given path.",
    version: "1.0.0",
    capabilities: ["read-local"],
    permission: "restricted",
    risk: "low",
    inputSchema: {
      path: { type: "string", description: "Absolute directory path to list." },
    },
    outputSchema: {
      entries: { type: "array", description: "Directory entries." },
      totalEntries: { type: "number", description: "Total entry count." },
    },
    enabled: true,
  },

  async execute(input: ToolInput): Promise<ToolOutput> {
    const startedAt = new Date();
    const start = Date.now();
    const path = input.parameters["path"];

    if (typeof path !== "string" || path.trim() === "") {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: "Parameter 'path' must be a non-empty string.",
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }

    try {
      const names = await readdir(path);
      const entries: DirectoryEntry[] = [];

      for (const name of names) {
        const full = join(path, name);
        try {
          const s = await stat(full);
          entries.push({
            name,
            type: s.isDirectory() ? "directory" : "file",
            sizeBytes: s.isFile() ? s.size : 0,
          });
        } catch {
          // skip entries we cannot stat
        }
      }

      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "success",
        result: { path, entries, totalEntries: entries.length },
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: `Failed to list directory: ${error instanceof Error ? error.message : String(error)}`,
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }
  },
};