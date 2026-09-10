export interface Goal {
  readonly id: string;
  readonly description: string;
  readonly priority: number;
  readonly createdAt: Date;
}

export interface SubGoal {
  readonly id: string;
  readonly parentGoalId: string;
  readonly description: string;
  readonly order: number;
  readonly completed: boolean;
  readonly completedAt?: Date;
}

export interface GoalResult {
  readonly goalId: string;
  readonly success: boolean;
  readonly summary: string;
  readonly subGoalResults: readonly SubGoalResult[];
}

export interface SubGoalResult {
  readonly subGoalId: string;
  readonly success: boolean;
  readonly summary: string;
}

export interface GoalDecomposition {
  readonly goalId: string;
  readonly subGoals: readonly SubGoal[];
}

export interface GoalDecomposer {
  decompose(goal: Goal): Promise<GoalDecomposition>;
}