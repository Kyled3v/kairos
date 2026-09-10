import type { ToolCallRecord } from "../experience/record.js";
import type { ToolOutput } from "./types.js";

/**
 * Accumulates ToolCallRecord entries during an orchestration session.
 * Passed into the pipeline so any stage can record tool invocations.
 */
export class ToolCallCollector {
  private readonly calls: ToolCallRecord[] = [];

  record(input: {
    toolId: string;
    requestId: string;
    parameters: Readonly<Record<string, unknown>>;
    output: ToolOutput;
    executedAt: Date;
  }): void {
    const record: ToolCallRecord = {
      toolId: input.toolId,
      requestId: input.requestId,
      parameters: input.parameters,
      status: input.output.status,
      executedAt: input.executedAt,
      durationMs: input.output.durationMs,
      ...(input.output.result !== undefined ? { result: input.output.result } : {}),
      ...(input.output.error !== undefined ? { error: input.output.error } : {}),
    };
    this.calls.push(record);
  }

  drain(): readonly ToolCallRecord[] {
    return [...this.calls];
  }

  get size(): number {
    return this.calls.length;
  }
}