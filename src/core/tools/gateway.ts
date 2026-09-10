import type { ToolInput, ToolInvoker, ToolOutput } from "./types.js";
import type { ToolRegistry } from "./registry.js";
import type { ToolPolicy } from "./policy.js";
import { ToolExecutor } from "./executor.js";

export const DEFAULT_TOOL_TIMEOUT_MS = 10_000;

export class ToolGateway implements ToolInvoker {
  private readonly executor: ToolExecutor;
  private readonly timeoutMs: number;

  constructor(
    private readonly registry: ToolRegistry,
    private readonly policy: ToolPolicy,
    options: { timeoutMs?: number } = {},
  ) {
    this.executor = new ToolExecutor(registry);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  }

  async execute(actorId: string, input: ToolInput): Promise<ToolOutput> {
    const definition = this.registry.getDefinition(input.toolId);

    if (definition === undefined) {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "failure",
        error: `Tool not registered: ${input.toolId}`,
        executedAt: new Date(),
        durationMs: 0,
      };
    }

    const decision = this.policy.evaluate(actorId, definition);
    if (!decision.allowed) {
      return {
        toolId: input.toolId,
        requestId: input.requestId,
        status: "blocked",
        error: decision.reason,
        executedAt: new Date(),
        durationMs: 0,
      };
    }

    const timeoutMs = this.timeoutMs;
    const startedAt = new Date();

    const timeoutPromise = new Promise<ToolOutput>((resolve) => {
      const id = setTimeout(() => {
        resolve({
          toolId: input.toolId,
          requestId: input.requestId,
          status: "failure",
          error: `Tool execution timed out after ${timeoutMs}ms.`,
          executedAt: startedAt,
          durationMs: timeoutMs,
        });
      }, timeoutMs);
      if (typeof id === "object" && "unref" in id) (id as { unref(): void }).unref();
    });

    return Promise.race([this.executor.execute(input), timeoutPromise]);
  }
}