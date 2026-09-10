import type { Tool, ToolInput, ToolOutput } from "../types.js";

export const calculatorTool: Tool = {
  definition: {
    id: "kairos.calculator",
    name: "Calculator",
    description:
      "Evaluates safe arithmetic expressions: add, subtract, multiply, divide.",
    version: "1.0.0",
    capabilities: ["compute"],
    permission: "public",
    risk: "none",
    inputSchema: {
      expression: { type: "string", description: "Arithmetic expression to evaluate." },
    },
    outputSchema: {
      result: { type: "number", description: "Computed result." },
    },
    enabled: true,
  },

  async execute(input: ToolInput): Promise<ToolOutput> {
    const startedAt = new Date();
    const start = Date.now();

    const expression = input.parameters["expression"];

    if (typeof expression !== "string" || expression.trim() === "") {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: "Parameter \"expression\" must be a non-empty string.",
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }

    // Only allow safe arithmetic characters
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: "Expression contains disallowed characters.",
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }

    try {
      // Safe: we validated the character set above
      const result = Function(`"use strict"; return (${expression})`)() as unknown;

      if (typeof result !== "number" || !isFinite(result)) {
        return {
          toolId: input.toolId,
          requestId: input.requestId,
          status: "failure",
          error: "Expression did not produce a finite number.",
          executedAt: startedAt,
          durationMs: Date.now() - start,
        };
      }

      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "success",
        result: { result },
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    } catch {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: "Failed to evaluate expression.",
        executedAt: startedAt,
        durationMs: Date.now() - start,
      };
    }
  },
};