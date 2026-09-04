export interface PlanStep {
  readonly id: string;
  readonly description: string;
  readonly order: number;
}

export interface Plan {
  readonly goal: string;
  readonly steps: readonly PlanStep[];
  readonly rationale: string;
}
