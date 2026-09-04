export interface DecisionOption {
  readonly id: string;
  readonly description: string;
  readonly goalFit: number;
  readonly confidence: number;
  readonly risk: number;
  readonly authorized: boolean;
}

export interface Decision {
  readonly selectedOptionId?: string;
  readonly rationale: string;
  readonly confidence: number;
  readonly requiresAuthorization: boolean;
  readonly blocked: boolean;
  readonly options: readonly DecisionOption[];
}
