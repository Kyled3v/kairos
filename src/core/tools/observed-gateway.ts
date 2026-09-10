import type { ToolInput, ToolInvoker, ToolOutput } from "./types.js";
import type { ToolRegistry } from "./registry.js";
import type { ToolPolicy } from "./policy.js";
import { ToolGateway } from "./gateway.js";
import { ToolCallCollector } from "./collector.js";

/**
 * Wraps ToolGateway and automatically records every execution into a
 * ToolCallCollector so orchestration sessions get self-populating
 * ToolCallRecord arrays without any manual wiring.
 */
export class ObservedToolGateway implements ToolInvoker {
  private readonly inner: ToolGateway;
  readonly collector: ToolCallCollector;

  constructor(
    registry: ToolRegistry,
    policy: ToolPolicy,
    collector?: ToolCallCollector,
  ) {
    this.inner = new ToolGateway(registry, policy);
    this.collector = collector ?? new ToolCallCollector();
  }

  async execute(actorId: string, input: ToolInput): Promise<ToolOutput> {
    const executedAt = new Date();
    const output = await this.inner.execute(actorId, input);
    this.collector.record({
      toolId: input.toolId,
      requestId: input.requestId,
      parameters: input.parameters,
      output,
      executedAt,
    });
    return output;
  }
}