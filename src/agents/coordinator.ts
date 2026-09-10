import type { KairosAgent } from "./agent.js";
import type { DelegationRequest, DelegationResult } from "./coordination-types.js";

/**
 * Registers agents and routes delegate() calls to the target agent.
 * Delegation is synchronous — the coordinator awaits the worker result
 * before returning. No distributed messaging or queue involved.
 */
export class AgentCoordinator {
  private readonly agents = new Map<string, KairosAgent>();

  register(agent: KairosAgent): void {
    if (this.agents.has(agent.identity.id)) {
      throw new Error("Agent already registered with coordinator: " + agent.identity.id);
    }
    this.agents.set(agent.identity.id, agent);
  }

  unregister(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  listAgentIds(): readonly string[] {
    return [...this.agents.keys()];
  }

  async delegate(request: DelegationRequest): Promise<DelegationResult> {
    const agent = this.agents.get(request.toAgentId);
    if (agent === undefined) {
      return {
        taskId: request.taskId,
        fromAgentId: request.fromAgentId,
        toAgentId: request.toAgentId,
        goal: request.goal,
        status: "failure",
        error: "Agent not registered: " + request.toAgentId,
        completedAt: new Date(),
      };
    }
    try {
      const result = await agent.run(request.goal);
      return {
        taskId: request.taskId,
        fromAgentId: request.fromAgentId,
        toAgentId: request.toAgentId,
        goal: request.goal,
        status: "success",
        result,
        completedAt: new Date(),
      };
    } catch (error) {
      return {
        taskId: request.taskId,
        fromAgentId: request.fromAgentId,
        toAgentId: request.toAgentId,
        goal: request.goal,
        status: "failure",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      };
    }
  }
}
