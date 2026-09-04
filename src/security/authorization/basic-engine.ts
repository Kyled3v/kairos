import type {
  AuthorizationContext,
  AuthorizationDecision,
  AuthorizationEngine,
} from "./types.js";

export class BasicAuthorizationEngine implements AuthorizationEngine {
  async authorize(
    context: AuthorizationContext,
  ): Promise<AuthorizationDecision> {
    const allowedActions = new Set([
      "create-plan",
      "inspect-state",
    ]);

    const allowed = allowedActions.has(context.action.name);

    return {
      allowed,
      reason: allowed
        ? "Action is permitted by the baseline policy."
        : "Action is not permitted by the baseline policy.",
      policyId: "baseline-deny-by-default-v1",
    };
  }
}
