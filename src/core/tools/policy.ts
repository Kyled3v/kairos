import type {
  ToolDefinition,
  ToolPermission,
  ToolPolicyDecision,
  ToolRisk,
} from "./types.js";

export interface ToolPolicyOptions {
  readonly actorPermissions: readonly ToolPermission[];
  readonly maxRisk: ToolRisk;
}

const RISK_LEVELS: Record<ToolRisk, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const PERMISSION_LEVELS: Record<ToolPermission, number> = {
  public: 0,
  restricted: 1,
  privileged: 2,
  admin: 3,
};

export class ToolPolicy {
  constructor(private readonly options: ToolPolicyOptions) {}

  evaluate(actorId: string, definition: ToolDefinition): ToolPolicyDecision {
    if (!definition.enabled) {
      return {
        allowed: false,
        reason: `Tool ${definition.id} is disabled.`,
        policyId: "tool-enabled-check-v1",
      };
    }

    const toolRiskLevel = RISK_LEVELS[definition.risk];
    const maxRiskLevel = RISK_LEVELS[this.options.maxRisk];

    if (toolRiskLevel > maxRiskLevel) {
      return {
        allowed: false,
        reason: `Tool ${definition.id} risk level (${definition.risk}) exceeds actor maximum (${this.options.maxRisk}).`,
        policyId: "tool-risk-check-v1",
      };
    }

    const requiredPermissionLevel = PERMISSION_LEVELS[definition.permission];
    const actorMaxPermissionLevel = Math.max(
      -1,
      ...this.options.actorPermissions.map((p) => PERMISSION_LEVELS[p]),
    );

    if (actorMaxPermissionLevel < requiredPermissionLevel) {
      return {
        allowed: false,
        reason: `Actor ${actorId} lacks permission to invoke ${definition.id} (requires ${definition.permission}).`,
        policyId: "tool-permission-check-v1",
      };
    }

    return {
      allowed: true,
      reason: `Tool ${definition.id} is permitted for actor ${actorId}.`,
      policyId: "tool-baseline-policy-v1",
    };
  }
}
