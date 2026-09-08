import { readFile } from "node:fs/promises";
import type { Tool, ToolInput, ToolOutput } from "../types.js";

export const readFileTool: Tool = {
  definition: {
    id: "kairos.read-file",
    name: "Read File",
    description: "Reads the text content of a file at the given path.",
    version: "1.0.0",
    capabilities: ["read-local"],
    permission: "restricted",
    risk: "low",
    inputSchema: {
      path: { type: "string", description: "Absolute path to the file." },
    },
    outputSchema: {
      content: { type: "string", description: "File contents as UTF-8 text." },
      path: { type: "string", description: "Path that was read." },
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
      const content = await readFile(path, "utf-8");
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "success",
        result: { content, path },
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }
  },
};