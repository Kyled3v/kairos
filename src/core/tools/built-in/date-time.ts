import type { Tool, ToolInput, ToolOutput } from "../types.js";

export const dateTimeTool: Tool = {
  definition: {
    id: "kairos.date-time",
    name: "Date & Time",
    description: "Returns the current UTC date and time.",
    version: "1.0.0",
    capabilities: ["compute"],
    permission: "public",
    risk: "none",
    inputSchema: {},
    outputSchema: {
      iso: { type: "string", description: "ISO 8601 UTC timestamp." },
      epochMs: { type: "number", description: "Unix epoch milliseconds." },
    },
    enabled: true,
  },

  async execute(input: ToolInput): Promise<ToolOutput> {
    const now = new Date();
    return {
      toolId: input.toolId,
      requestId: input.requestId,
      status: "success",
      result: {
        iso: now.toISOString(),
        epochMs: now.getTime(),
      },
      executedAt: now,
      durationMs: 0,
    };
  },
};