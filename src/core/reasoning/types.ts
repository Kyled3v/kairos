export interface ReasoningContext {
  readonly goal: string;
  readonly observations: readonly string[];
  readonly constraints: readonly string[];
}

export interface ReasoningResult {
  readonly conclusion: string;
  readonly confidence: number;
  readonly reasoningSteps: readonly string[];
}
