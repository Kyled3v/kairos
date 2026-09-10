import type { Tool, ToolInput, ToolOutput } from "../types.js";

// A simple in-memory key/value store for deterministic lookups in tests
const DATA_STORE: Readonly<Record<string, unknown>> = {
  "kairos.version": "0.1.0",
  "kairos.status": "operational",
  "kairos.environment": "development",
};

export const dataLookupTool: Tool = {
  definition: {
    id: "kairos.data-lookup",
    name: "Data Lookup",
    description: "Looks up a value from the KAIROS internal data store by key.",
    version: "1.0.0",
    capabilities: ["read-memory"],
    permission: "public",
    risk: "none",
    inputSchema: {
      key: { type: "string", description: "The key to look up." },
    },
    outputSchema: {
      key: { type: "string" },
      value: { description: "The stored value, or null if not found." },
      found: { type: "boolean" },
    },
    enabled: true,
  },

  async execute(input: ToolInput): Promise<ToolOutput> {
    const startedAt = new Date();
    const start = Date.now();
    const key = input.parameters["key"];

    if (typeof key !== "string" || key.trim() === "") {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: "Parameter \"key\" must be a non-empty string.",
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }

    const value = Object.prototype.hasOwnProperty.call(DATA_STORE, key)
      ? DATA_STORE[key]
      : null;

    return {
      toolId: input.toolId,
      requestId: input.requestId,
      status: "success",
      result: { key, value, found: value !== null },
      executedAt: startedAt,
      durationMs: Date.now() - start,
    };
  },
};