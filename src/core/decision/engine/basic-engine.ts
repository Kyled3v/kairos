import type { Decision, DecisionOption } from "../types.js";
import type { DecisionContext, DecisionEngine } from "./types.js";

export class BasicDecisionEngine implements DecisionEngine {
  async decide(context: DecisionContext): Promise<Decision> {
    const options: DecisionOption[] = context.plan.steps.map(
      (step, index) => ({
        id: step.id,
        description: step.description,
        goalFit: Math.max(0, 1 - index * 0.1),
        confidence: Math.max(0, 1 - index * 0.1),
        risk: Math.min(1, index * 0.2),
        authorized: context.authorized,
      }),
    );

    if (!context.authorized) {
      return {
        rationale: "Execution is blocked because authorization is unavailable.",
        confidence: 0,
        requiresAuthorization: true,
        blocked: true,
        options,
      };
    }

    const selected = options.reduce((best, option) => {
      const bestScore =
        best.goalFit * best.confidence * (1 - best.risk);

      const optionScore =
        option.goalFit * option.confidence * (1 - option.risk);

      return optionScore > bestScore ? option : best;
    });

    return {
      selectedOptionId: selected.id,
      rationale: `Selected the highest-scoring authorized option for: ${context.goal}`,
      confidence: selected.confidence,
      requiresAuthorization: false,
      blocked: false,
      options,
    };
  }
}
