export interface ToolCallRequest {
  readonly toolId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface DecisionOption {
  readonly id: string;
  readonly description: string;
  readonly goalFit: number;
  readonly confidence: number;
  readonly risk: number;
  readonly authorized: boolean;
  readonly toolCall?: ToolCallRequest;
}

export interface Decision {
  readonly selectedOptionId?: string;
  readonly rationale: string;
  readonly confidence: number;
  readonly requiresAuthorization: boolean;
  readonly blocked: boolean;
  readonly options: readonly DecisionOption[];
}