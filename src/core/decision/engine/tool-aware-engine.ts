import type { Decision, DecisionOption } from "../types.js";
import type { DecisionContext, DecisionEngine } from "./types.js";
import type { ToolSelectionPolicy } from "../../tools/selection-policy.js";

export class ToolAwareDecisionEngine implements DecisionEngine {
  constructor(
    private readonly inner: DecisionEngine,
    private readonly policy: ToolSelectionPolicy,
  ) {}

  async decide(context: DecisionContext): Promise<Decision> {
    const decision = await this.inner.decide(context);

    const enrichedOptions: DecisionOption[] = decision.options.map(
      (option) => {
        const toolCall = this.policy.select(option.description, option.id);
        return toolCall !== undefined ? { ...option, toolCall } : option;
      },
    );

    return { ...decision, options: enrichedOptions };
  }
}
