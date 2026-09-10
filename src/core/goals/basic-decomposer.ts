import type { Goal, GoalDecomposition, GoalDecomposer, SubGoal } from "./types.js";

export class BasicGoalDecomposer implements GoalDecomposer {
  async decompose(goal: Goal): Promise<GoalDecomposition> {
    const subGoals: SubGoal[] = [
      {
        id: `${goal.id}-understand`,
        parentGoalId: goal.id,
        description: `Understand the requirements for: ${goal.description}`,
        order: 1,
        completed: false,
      },
      {
        id: `${goal.id}-plan`,
        parentGoalId: goal.id,
        description: `Create a plan to achieve: ${goal.description}`,
        order: 2,
        completed: false,
      },
      {
        id: `${goal.id}-execute`,
        parentGoalId: goal.id,
        description: `Execute and verify: ${goal.description}`,
        order: 3,
        completed: false,
      },
    ];

    return {
      goalId: goal.id,
      subGoals,
    };
  }
}