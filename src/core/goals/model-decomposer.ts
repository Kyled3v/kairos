import type { Goal, GoalDecomposition, GoalDecomposer, SubGoal } from "./types.js";
import type { ModelRouter } from "../../intelligence/models/router.js";

export interface ModelGoalDecomposerOptions {
  readonly router: ModelRouter;
  readonly providerId: string;
  readonly modelId: string;
  readonly maxSubGoals?: number;
}

interface SubGoalJson {
  description: string;
  order: number;
}

export class ModelGoalDecomposer implements GoalDecomposer {
  private readonly router: ModelRouter;
  private readonly providerId: string;
  private readonly modelId: string;
  private readonly maxSubGoals: number;

  constructor(options: ModelGoalDecomposerOptions) {
    this.router = options.router;
    this.providerId = options.providerId;
    this.modelId = options.modelId;
    this.maxSubGoals = options.maxSubGoals ?? 5;
  }

  async decompose(goal: Goal): Promise<GoalDecomposition> {
    const prompt = [
      `You are a goal decomposition assistant. Break the following goal into ${this.maxSubGoals} or fewer concrete, ordered sub-goals.`,
      "Respond ONLY with a JSON array of objects with keys: description (string) and order (number, starting at 1).",
      "No preamble, no markdown fences, no extra keys. Example: [{\"description\":\"Step one\",\"order\":1}]",
      "",
      `Goal: ${goal.description}`,
    ].join("\n");

    let subGoals: SubGoal[];
    try {
      const response = await this.router.generate(this.providerId, {
        model: this.modelId,
        messages: [{ role: "user", content: prompt }],
        responseFormat: "json",
      });

      const raw = response.content.trim().replace(/^```json|^```|```$/gm, "").trim();
      const parsed = JSON.parse(raw) as SubGoalJson[];

      if (!Array.isArray(parsed)) throw new Error("Model did not return an array.");

      subGoals = parsed
        .filter((s) => typeof s.description === "string" && typeof s.order === "number")
        .slice(0, this.maxSubGoals)
        .map((s) => ({
          id: `${goal.id}-sub-${s.order}`,
          parentGoalId: goal.id,
          description: s.description,
          order: s.order,
          completed: false,
        }));

      if (subGoals.length === 0) throw new Error("Model returned no valid sub-goals.");
    } catch {
      // Fall back to basic decomposition if model fails
      subGoals = [
        { id: `${goal.id}-understand`, parentGoalId: goal.id, description: `Understand: ${goal.description}`, order: 1, completed: false },
        { id: `${goal.id}-plan`, parentGoalId: goal.id, description: `Plan: ${goal.description}`, order: 2, completed: false },
        { id: `${goal.id}-execute`, parentGoalId: goal.id, description: `Execute: ${goal.description}`, order: 3, completed: false },
      ];
    }

    return { goalId: goal.id, subGoals };
  }
}
