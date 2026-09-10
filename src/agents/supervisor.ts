import type { KairosAgent } from "./agent.js";
import { AgentCoordinator } from "./coordinator.js";
import type { DelegationResult } from "./coordination-types.js";

export interface SubTask {
  readonly id: string;
  readonly goal: string;
  readonly workerId: string;
}

export interface SupervisionResult {
  readonly supervisorId: string;
  readonly goal: string;
  readonly subTasks: readonly SubTask[];
  readonly delegationResults: readonly DelegationResult[];
  readonly completedAt: Date;
}

/**
 * SupervisorAgent: runs a high-level goal by decomposing it into sub-tasks,
 * delegating each to a registered worker agent via the coordinator, and
 * collecting results. Decomposition strategy is provided by the caller
 * (a function from goal string to SubTask[]). This keeps the supervisor
 * generic and testable without depending on the full goal decomposer.
 */
export class SupervisorAgent {
  private readonly coordinator: AgentCoordinator;

  constructor(
    private readonly supervisor: KairosAgent,
    workers: readonly KairosAgent[],
  ) {
    this.coordinator = new AgentCoordinator();
    this.coordinator.register(supervisor);
    for (const worker of workers) {
      this.coordinator.register(worker);
    }
  }

  get identity() { return this.supervisor.identity; }

  async run(
    goal: string,
    decompose: (goal: string) => readonly SubTask[],
  ): Promise<SupervisionResult> {
    const subTasks = decompose(goal);
    const delegationResults: DelegationResult[] = [];

    for (const task of subTasks) {
      const result = await this.coordinator.delegate({
        taskId: task.id,
        fromAgentId: this.supervisor.identity.id,
        toAgentId: task.workerId,
        goal: task.goal,
      });
      delegationResults.push(result);
    }

    return {
      supervisorId: this.supervisor.identity.id,
      goal,
      subTasks,
      delegationResults,
      completedAt: new Date(),
    };
  }
}
