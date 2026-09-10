import type { Tool, ToolInput, ToolOutput } from "../types.js";

// Canned responses — no real network access
const MOCK_RESPONSES: Readonly<Record<string, unknown>> = {
  "https://api.kairos.local/status": { status: "ok", version: "0.1.0" },
  "https://api.kairos.local/health": { healthy: true },
};

export const mockHttpTool: Tool = {
  definition: {
    id: "kairos.mock-http",
    name: "Mock HTTP",
    description: "Makes a mock HTTP GET request. No real network access.",
    version: "1.0.0",
    capabilities: ["read-network"],
    permission: "restricted",
    risk: "low",
    inputSchema: {
      url: { type: "string", description: "URL to request." },
    },
    outputSchema: {
      url: { type: "string" },
      statusCode: { type: "number" },
      body: { description: "Response body." },
    },
    enabled: true,
  },

  async execute(input: ToolInput): Promise<ToolOutput> {
    const startedAt = new Date();
    const start = Date.now();
    const url = input.parameters["url"];

    if (typeof url !== "string" || url.trim() === "") {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: "Parameter \"url\" must be a non-empty string.",
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }

    const body = Object.prototype.hasOwnProperty.call(MOCK_RESPONSES, url)
      ? MOCK_RESPONSES[url]
      : null;

    const statusCode = body !== null ? 200 : 404;

    return {
      toolId: input.toolId,
      requestId: input.requestId,
      status: "success",
      result: { url, statusCode, body },
      executedAt: startedAt,
      durationMs: Date.now() - start,
    };
  },
};