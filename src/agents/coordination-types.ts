export interface DelegationRequest {
  readonly taskId: string;
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly goal: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface DelegationResult {
  readonly taskId: string;
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly goal: string;
  readonly status: "success" | "failure";
  readonly result?: unknown;
  readonly error?: string;
  readonly completedAt: Date;
}
