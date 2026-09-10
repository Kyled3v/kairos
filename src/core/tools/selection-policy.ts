import type { ToolCallRequest } from "../decision/types.js";
import type { ToolCapability, ToolDefinition } from "./types.js";
import type { ToolRegistry } from "./registry.js";

export interface ToolSelectionOptions {
  readonly registry: ToolRegistry;
  readonly threshold?: number;
}

const RISK_RANK: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const PERMISSION_RANK: Record<string, number> = {
  public: 0,
  restricted: 1,
  privileged: 2,
  admin: 3,
};

export class ToolSelectionPolicy {
  private readonly threshold: number;
  private readonly registry: ToolRegistry;

  constructor(options: ToolSelectionOptions) {
    this.registry = options.registry;
    this.threshold = options.threshold ?? 0.3;
  }

  /**
   * Select a tool for a plan step. Strategy:
   * 1. Capability-aware: if requiredCapabilities provided, query registry by
   *    each capability, collect candidates, rank by risk (lowest first) then
   *    permission level (lowest first), return best.
   * 2. Keyword fallback: score enabled tools by name/description token overlap.
   */
  select(
    stepDescription: string,
    stepId: string,
    requiredCapabilities?: readonly ToolCapability[],
  ): ToolCallRequest | undefined {
    if (requiredCapabilities !== undefined && requiredCapabilities.length > 0) {
      const result = this.selectByCapability(requiredCapabilities, stepId, stepDescription);
      if (result !== undefined) return result;
    }
    return this.selectByKeyword(stepDescription, stepId);
  }

  /**
   * Capability-aware selection: find all enabled tools that satisfy at least
   * one of the required capabilities, then rank by risk asc, permission asc.
   */
  selectByCapability(
    capabilities: readonly ToolCapability[],
    stepId: string,
    description: string,
  ): ToolCallRequest | undefined {
    const seen = new Set<string>();
    const candidates: ToolDefinition[] = [];

    for (const cap of capabilities) {
      const matches = this.registry.query({ capability: cap, enabled: true });
      for (const tool of matches) {
        if (!seen.has(tool.definition.id)) {
          seen.add(tool.definition.id);
          candidates.push(tool.definition);
        }
      }
    }

    if (candidates.length === 0) return undefined;

    candidates.sort((a, b) => {
      const riskDiff = (RISK_RANK[a.risk] ?? 0) - (RISK_RANK[b.risk] ?? 0);
      if (riskDiff !== 0) return riskDiff;
      return (PERMISSION_RANK[a.permission] ?? 0) - (PERMISSION_RANK[b.permission] ?? 0);
    });

    const best = candidates[0];
    if (best === undefined) return undefined;

    return {
      toolId: best.id,
      parameters: { stepId, description },
    };
  }

  private selectByKeyword(stepDescription: string, stepId: string): ToolCallRequest | undefined {
    const tokens = this.tokenize(stepDescription);
    if (tokens.length === 0) return undefined;

    const enabled = this.registry.getEnabled();
    let bestScore = 0;
    let bestTool: ToolDefinition | undefined;

    for (const tool of enabled) {
      const score = this.score(tokens, tool.definition);
      if (score > bestScore) {
        bestScore = score;
        bestTool = tool.definition;
      }
    }

    if (bestScore < this.threshold || bestTool === undefined) return undefined;

    return {
      toolId: bestTool.id,
      parameters: { stepId, description: stepDescription },
    };
  }

  private score(tokens: readonly string[], def: ToolDefinition): number {
    const haystack = `${def.name} ${def.description}`.toLowerCase();
    const matches = tokens.filter((t) => haystack.includes(t));
    return tokens.length === 0 ? 0 : matches.length / tokens.length;
  }

  private tokenize(text: string): readonly string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }
}