import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Tool, ToolInput, ToolOutput } from "../types.js";

export const writeFileTool: Tool = {
  definition: {
    id: "kairos.write-file",
    name: "Write File",
    description: "Writes text content to a file, creating parent directories as needed.",
    version: "1.0.0",
    capabilities: ["write-local"],
    permission: "privileged",
    risk: "medium",
    inputSchema: {
      path: { type: "string", description: "Absolute path to write." },
      content: { type: "string", description: "UTF-8 text to write." },
    },
    outputSchema: {
      path: { type: "string", description: "Path that was written." },
      bytesWritten: { type: "number", description: "Bytes written." },
    },
    enabled: true,
  },

  async execute(input: ToolInput): Promise<ToolOutput> {
    const startedAt = new Date();
    const start = Date.now();
    const path = input.parameters["path"];
    const content = input.parameters["content"];

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

    if (typeof content !== "string") {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: "Parameter 'content' must be a string.",
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }

    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf-8");
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "success",
        result: { path, bytesWritten: Buffer.byteLength(content, "utf-8") },
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }
  },
};