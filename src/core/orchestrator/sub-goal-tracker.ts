import type { SubGoal } from "../goals/types.js";

export class SubGoalTracker {
  private readonly subGoals: SubGoal[];

  constructor(subGoals: readonly SubGoal[] = []) {
    this.subGoals = [...subGoals];
  }

  getAll(): readonly SubGoal[] {
    return this.subGoals;
  }

  getPending(): readonly SubGoal[] {
    return this.subGoals.filter((g) => !g.completed);
  }

  getCompleted(): readonly SubGoal[] {
    return this.subGoals.filter((g) => g.completed);
  }

  markCompleted(id: string): void {
    const index = this.subGoals.findIndex((g) => g.id === id);

    if (index === -1) {
      return;
    }

    const existing = this.subGoals[index];

    if (existing === undefined) {
      return;
    }

    this.subGoals[index] = {
      ...existing,
      completed: true,
      completedAt: new Date(),
    };
  }

  allCompleted(): boolean {
    return (
      this.subGoals.length > 0 &&
      this.subGoals.every((g) => g.completed)
    );
  }

  progress(): number {
    if (this.subGoals.length === 0) {
      return 1;
    }

    return (
      this.subGoals.filter((g) => g.completed).length /
      this.subGoals.length
    );
  }
}