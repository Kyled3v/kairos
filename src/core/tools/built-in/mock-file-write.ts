import type { Tool, ToolInput, ToolOutput } from "../types.js";

// In-memory write store — no real disk access
const WRITE_STORE = new Map<string, string>();

export const mockFileWriteTool: Tool = {
  definition: {
    id: "kairos.mock-file-write",
    name: "Mock File Write",
    description: "Writes a value to the KAIROS mock file system. No real disk access.",
    version: "1.0.0",
    capabilities: ["write-local"],
    permission: "privileged",
    risk: "medium",
    inputSchema: {
      path: { type: "string", description: "Absolute mock file path." },
      content: { type: "string", description: "Content to write." },
    },
    outputSchema: {
      path: { type: "string" },
      written: { type: "boolean" },
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
        error: "Parameter \"path\" must be a non-empty string.",
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }

    if (typeof content !== "string") {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: "Parameter \"content\" must be a string.",
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }

    WRITE_STORE.set(path, content);

    return {
      toolId: input.toolId,
      requestId: input.requestId,
      status: "success",
      result: { path, written: true },
      executedAt: startedAt,
      durationMs: Date.now() - start,
    };
  },
};

// Exposed for tests only
export function getMockWriteStore(): ReadonlyMap<string, string> {
  return WRITE_STORE;
}

export function clearMockWriteStore(): void {
  WRITE_STORE.clear();
}