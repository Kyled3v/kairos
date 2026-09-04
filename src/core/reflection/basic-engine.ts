import type { Reflection, ReflectionContext, ReflectionEngine } from "./types.js";

export class BasicReflectionEngine implements ReflectionEngine {
  async reflect(context: ReflectionContext): Promise<Reflection> {
    if (context.evaluation.success) {
      return {
        summary: `Goal evaluation succeeded: ${context.goal}`,
        lessons: [
          "The selected action produced the expected completion signal.",
        ],
        continueTask: false,
        reason: "The objective appears to have been achieved.",
      };
    }

    return {
      summary: `Goal evaluation requires another attempt: ${context.goal}`,
      lessons: [
        ...context.evaluation.discrepancies,
        "The next cycle should reconsider the available approach.",
      ],
      continueTask: true,
      reason: "The objective has not yet been demonstrated as complete.",
    };
  }
}
