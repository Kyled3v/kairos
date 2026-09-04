import type { Evaluation, EvaluationContext, EvaluationEngine } from "./types.js";

export class BasicEvaluationEngine implements EvaluationEngine {
  async evaluate(context: EvaluationContext): Promise<Evaluation> {
    const actualOutcome = context.observation.data.actualOutcome;

    const successful =
      typeof actualOutcome === "object" &&
      actualOutcome !== null &&
      "status" in actualOutcome &&
      actualOutcome.status === "completed";

    return {
      success: successful,
      score: successful ? 1 : 0,
      explanation: successful
        ? `The observed action successfully advanced the goal: ${context.goal}`
        : `The observed action did not produce a successful completion for: ${context.goal}`,
      discrepancies: successful
        ? []
        : ["Observed action did not report completed status."],
    };
  }
}
