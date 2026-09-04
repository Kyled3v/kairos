import type { Plan } from "./types.js";
import type { PlanningContext, PlanningEngine } from "./engine-types.js";

export class BasicPlanningEngine implements PlanningEngine {
  async plan(context: PlanningContext): Promise<Plan> {
    return {
      goal: context.goal,
      rationale: context.reasoning.conclusion,
      steps: [
        {
          id: "step-1",
          description: `Clarify the requirements for: ${context.goal}`,
          order: 1,
        },
        {
          id: "step-2",
          description: "Determine the required actions and resources.",
          order: 2,
        },
        {
          id: "step-3",
          description: "Execute the actions and evaluate the outcome.",
          order: 3,
        },
      ],
    };
  }
}
