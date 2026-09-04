export interface Goal {
  readonly id: string;
  readonly description: string;
  readonly priority: number;
  readonly createdAt: Date;
}

export interface GoalResult {
  readonly goalId: string;
  readonly success: boolean;
  readonly summary: string;
}
