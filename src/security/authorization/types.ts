import type { ActionRequest } from "../../core/action/types.js";

export interface AuthorizationContext {
  readonly actorId: string;
  readonly action: ActionRequest;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly policyId: string;
}

export interface AuthorizationEngine {
  authorize(
    context: AuthorizationContext,
  ): Promise<AuthorizationDecision>;
}
