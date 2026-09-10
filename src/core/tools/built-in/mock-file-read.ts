import type { Tool, ToolInput, ToolOutput } from "../types.js";

// Simulated file system — safe, deterministic, no real disk access
const MOCK_FILES: Readonly<Record<string, string>> = {
  "/kairos/config.json": JSON.stringify({ version: "0.1.0", env: "development" }),
  "/kairos/readme.txt": "KAIROS — Autonomous Intelligence & Reasoning Operating System.",
};

export const mockFileReadTool: Tool = {
  definition: {
    id: "kairos.mock-file-read",
    name: "Mock File Read",
    description: "Reads a file from the KAIROS mock file system. No real disk access.",
    version: "1.0.0",
    capabilities: ["read-local"],
    permission: "restricted",
    risk: "low",
    inputSchema: {
      path: { type: "string", description: "Absolute mock file path." },
    },
    outputSchema: {
      path: { type: "string" },
      content: { type: "string" },
      found: { type: "boolean" },
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
        error: "Parameter \"path\" must be a non-empty string.",
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }

    const content = Object.prototype.hasOwnProperty.call(MOCK_FILES, path)
      ? MOCK_FILES[path]
      : null;

    return {
      toolId: input.toolId,
      requestId: input.requestId,
      status: "success",
      result: { path, content, found: content !== null },
      executedAt: startedAt,
      durationMs: Date.now() - start,
    };
  },
};