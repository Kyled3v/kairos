import type { ReasoningContext, ReasoningResult } from "../types.js";
import type { ReasoningEngine } from "./types.js";

export class BasicReasoningEngine implements ReasoningEngine {
  async reason(context: ReasoningContext): Promise<ReasoningResult> {
    return {
      conclusion: `Reasoning completed for goal: ${context.goal}`,
      confidence: 0.5,
      reasoningSteps: [
        "Reviewed the supplied goal.",
        `Considered ${context.observations.length} observation(s).`,
        `Applied ${context.constraints.length} constraint(s).`,
      ],
    };
  }
}
