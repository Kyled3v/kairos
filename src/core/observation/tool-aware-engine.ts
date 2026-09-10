import type { Decision } from "../decision/types.js";
import type { Observation } from "./types.js";
import { BasicObservationEngine } from "./basic-engine.js";
import type { ToolInput, ToolInvoker } from "../tools/types.js";

export interface ToolAwareObservationOptions {
  readonly actorId?: string;
}

/**
 * Observation stage that inspects the selected Decision option for an
 * attached tool call. If present, it invokes the real tool through the
 * supplied ToolInvoker (ToolGateway or ObservedToolGateway) and folds the
 * actual ToolOutput into the Observation. If absent, it falls back to
 * BasicObservationEngine's existing behaviour so non-tool cycles are
 * completely unaffected.
 */
export class ToolAwareObservationEngine {
  private readonly fallback = new BasicObservationEngine();

  constructor(
    private readonly toolInvoker: ToolInvoker,
    private readonly options: ToolAwareObservationOptions = {},
  ) {}

  async observeDecision(decision: Decision): Promise<Observation> {
    const selected = decision.options.find(
      (option) => option.id === decision.selectedOptionId,
    );

    if (selected?.toolCall === undefined) {
      return this.fallback.observe({
        actionId: decision.selectedOptionId ?? "unknown",
        actualOutcome: { status: "completed", decision },
      });
    }

    const actorId = this.options.actorId ?? "kairos";

    const toolInput: ToolInput = {
      toolId: selected.toolCall.toolId,
      parameters: selected.toolCall.parameters,
      requestedBy: actorId,
      requestId: crypto.randomUUID(),
    };

    const output = await this.toolInvoker.execute(actorId, toolInput);

    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      source: "tool-execution",
      data: {
        actionId: decision.selectedOptionId ?? "unknown",
        toolId: toolInput.toolId,
        toolOutput: output,
        actualOutcome: {
          status: output.status === "success" ? "completed" : "failed",
          toolOutput: output,
        },
      },
    };
  }
}