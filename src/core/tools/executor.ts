import type { ToolInput, ToolOutput } from "./types.js";
import type { ToolRegistry } from "./registry.js";

export class ToolExecutor {
  constructor(private readonly registry: ToolRegistry) {}

  async execute(input: ToolInput): Promise<ToolOutput> {
    const tool = this.registry.get(input.toolId);

    if (tool === undefined) {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: `Tool not found: ${input.toolId}`,
        executedAt: new Date(),
        durationMs: 0,
      };
    }

    if (!tool.definition.enabled) {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "blocked",
        error: `Tool is disabled: ${input.toolId}`,
        executedAt: new Date(),
        durationMs: 0,
      };
    }

    const startedAt = Date.now();

    try {
      const output = await tool.execute(input);
      return output;
    } catch (error) {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error:
          error instanceof Error
            ? error.message
            : "Unknown tool execution error.",
        executedAt: new Date(),
        durationMs: Date.now() - startedAt,
      };
    }
  }
}