import { KairosAgent } from "../agent.js";
import { AgentRegistry } from "../identity.js";
import { AgentCoordinator } from "../coordinator.js";
import type { AgentMessageBus } from "../message-bus.js";
import { assertNoWriteExecuteCapability } from "../tool-boundary.js";
import { ToolRegistry } from "../../core/tools/registry.js";
import { ToolPolicy } from "../../core/tools/policy.js";
import { ObservedToolGateway } from "../../core/tools/observed-gateway.js";
import { ToolCallCollector } from "../../core/tools/collector.js";
import { InMemoryMemoryStore } from "../../core/memory/in-memory-store.js";
import { createPipelineDependencies } from "../../factory/pipeline-dependencies.js";
import { createKairos } from "../../factory/index.js";
import { dateTimeTool } from "../../core/tools/built-in/date-time.js";
import { dataLookupTool } from "../../core/tools/built-in/data-lookup.js";
import { calculatorTool } from "../../core/tools/built-in/calculator.js";
import type { ModelRouter } from "../../intelligence/models/router.js";
import type { ExperienceStore } from "../../core/experience/record.js";
import type { MemoryStore, Memory } from "../../core/memory/types.js";
import type { MultiCycleResult } from "../../core/orchestrator/types.js";
import type { SessionOrchestratorOptions } from "../../core/orchestrator/session-orchestrator.js";
import type { ToolRegistry as ToolRegistryType } from "../../core/tools/registry.js";
import type { ToolPolicy as ToolPolicyType } from "../../core/tools/policy.js";
import type { Tool } from "../../core/tools/types.js";
import type { DelegatableAgent } from "../tool-boundary.js";
import type { DelegationRequest, DelegationResult } from "../coordination-types.js";
import type { PipelineDependencies } from "../../core/orchestrator/pipeline.js";
import { createSmartStrategy, createModelStrategy } from "./decomposition.js";

export interface AtlasAgentOptions {
  /** Registry id for this agent. Defaults to the stable "atlas". */
  readonly agentId?: string;
  readonly memoryStore?: MemoryStore;
  readonly registry?: AgentRegistry;
  readonly messageBus?: AgentMessageBus;
  readonly experienceStore?: ExperienceStore;
  readonly session?: SessionOrchestratorOptions;
  readonly router?: ModelRouter;
  readonly providerId?: string;
  readonly modelId?: string;
  /**
   * An existing coordinator to use instead of creating a private one.
   * Pass a shared coordinator when ATLAS must see agents registered by
   * other parts of the system.
   */
  readonly coordinator?: AgentCoordinator;
  /** Read-only tools in addition to the executive basics. Write/execute tools are rejected. */
  readonly extraTools?: readonly Tool[];
}

const OWNER = "ATLAS";

/** The result of one orchestrated objective. */
export interface OrchestrationOutcome {
  readonly goal: string;
  readonly supervisorId: string;
  readonly subTasks: readonly { id: string; goal: string; workerId: string }[];
  readonly delegationResults: readonly DelegationResult[];
  readonly succeeded: number;
  readonly failed: number;
  readonly status: "complete" | "partial" | "failed" | "empty";
  /** Which decomposition produced the plan ("model" includes fallbacks). */
  readonly decompositionMode: "explicit" | "smart" | "model" | "single";
  readonly synthesis: string;
  readonly completedAt: Date;
}

/**
 * ATLAS — Executive intelligence agent.
 *
 * Second named specialist agent (ADR-001 composition pattern). ATLAS
 * coordinates complex objectives and delegates work to specialist agents
 * (ORION first) through the AgentCoordinator, per docs/architecture/agents.md:
 *
 * - identity: stable "atlas" id, executive role
 * - delegation: only via AgentCoordinator — preserves authorization,
 *   traceability, context and result attribution (every delegation is a
 *   DelegationResult the caller can audit)
 * - own work: ATLAS can also run goals through its own cognitive loop
 *   with a deliberately minimal read-only toolset (status, lookup, math)
 * - memory: scoped; objectives stored as semantic memories, delegation
 *   outcomes as episodic memories
 * - audit: own tool calls and cycles recorded like every specialist
 *
 * Delegation must never bypass security: the coordinator routes to
 * registered agents only, and each worker keeps its own tool policy —
 * ATLAS gains no write/execute power by being the executive.
 */
export class AtlasAgent {
  private readonly agent: KairosAgent;
  private readonly collector: ToolCallCollector;
  private readonly modelOptions?: {
    router?: ModelRouter;
    providerId?: string;
    modelId?: string;
  };
  readonly toolRegistry: ToolRegistryType;
  readonly policy: ToolPolicyType;
  readonly toolGateway: ObservedToolGateway;
  readonly coordinator: AgentCoordinator;

  constructor(options: AtlasAgentOptions = {}) {
    const registry = options.registry ?? new AgentRegistry();
    const identity = registry.register({
      ...(options.agentId === undefined ? {} : { id: options.agentId }),
      name: "atlas",
      metadata: {
        role: "executive",
        specialty: "coordination-and-delegation",
        capabilities: [
          "objective-decomposition",
          "delegation",
          "result-aggregation",
          "prioritisation",
        ],
        constraints: [
          "no write or execute tool capabilities",
          "delegates only via AgentCoordinator",
          "cannot expand own permissions",
        ],
      },
    });

    // ── Tools: minimal executive toolset, read-only by construction ─────
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(dateTimeTool);
    toolRegistry.register(dataLookupTool);
    toolRegistry.register(calculatorTool);
    for (const tool of options.extraTools ?? []) {
      assertNoWriteExecuteCapability(tool, OWNER);
      toolRegistry.register(tool);
    }

    const policy = new ToolPolicy({
      actorPermissions: ["public", "restricted"],
      maxRisk: "medium",
    });

    const collector = new ToolCallCollector();
    const gateway = new ObservedToolGateway(toolRegistry, policy, collector);
    const memoryStore = options.memoryStore ?? new InMemoryMemoryStore();

    let dependencies: PipelineDependencies;
    if (
      options.router !== undefined &&
      options.providerId !== undefined &&
      options.modelId !== undefined
    ) {
      dependencies = createPipelineDependencies({
        mode: "model",
        router: options.router,
        providerId: options.providerId,
        modelId: options.modelId,
        toolGateway: gateway,
        toolRegistry,
        actorId: identity.id,
      });
    } else {
      dependencies = createPipelineDependencies({
        mode: "basic",
        toolGateway: gateway,
        toolRegistry,
        actorId: identity.id,
      });
    }

    this.agent = new KairosAgent({
      identity,
      dependencies,
      memoryStore,
      ...(options.experienceStore !== undefined ? { experienceStore: options.experienceStore } : {}),
      ...(options.messageBus !== undefined ? { messageBus: options.messageBus } : {}),
      ...(options.session !== undefined ? { session: options.session } : {}),
      toolCallCollector: collector,
    });

    this.toolRegistry = toolRegistry;
    this.policy = policy;
    this.toolGateway = gateway;
    this.collector = collector;
    this.coordinator = options.coordinator ?? new AgentCoordinator();
    this.coordinator.register(this.agent);
    this.modelOptions = {
      ...(options.router !== undefined ? { router: options.router } : {}),
      ...(options.providerId !== undefined ? { providerId: options.providerId } : {}),
      ...(options.modelId !== undefined ? { modelId: options.modelId } : {}),
    };
  }

  /** Stable agent identity (id "atlas", executive role metadata). */
  get identity() {
    return this.agent.identity;
  }

  /** ATLAS's isolated memory facade over the (possibly shared) store. */
  get memory() {
    return this.agent.memory;
  }

  /**
   * Registers a specialist agent (e.g. OrionAgent) with ATLAS's
   * coordinator so it can receive delegated sub-tasks.
   */
  addWorker(agent: DelegatableAgent): void {
    this.coordinator.register(agent);
  }

  /**
   * Delegates one task to a registered worker via the AgentCoordinator.
   * Returns a full DelegationResult either way — failures are results,
   * not exceptions.
   */
  async delegateTo(toAgentId: string, goal: string): Promise<DelegationResult> {
    const request: DelegationRequest = {
      taskId: crypto.randomUUID(),
      fromAgentId: this.identity.id,
      toAgentId,
      goal,
      metadata: { delegatedBy: "atlas" },
    };
    return this.coordinator.delegate(request);
  }

  /**
   * Runs an objective: decomposes it into sub-tasks, delegates each
   * through the coordinator, aggregates the results and records the
   * outcome as episodic memory.
   *
   * Decomposition modes:
   * - options.strategy supplied: used as-is (caller-controlled routing).
   * - options.decomposition: "smart" (default) — deterministic clause
   *   splitting and keyword→role routing across registered workers, so
   *   no caller-provided function is needed.
   * - options.decomposition: "model" — a ModelGoalDecomposer proposes
   *   sub-goals via the configured router; routing stays deterministic.
   *   Falls back to "smart" whenever the model is unavailable or returns
   *   unusable output. Requires modelRouter/providerId/modelId options.
   * - options.decomposition: "single" — the whole objective is routed to
   *   one eligible worker (round-robin), no splitting.
   */
  async orchestrate(
    goal: string,
    options: {
      /** Explicit strategy — takes precedence over decomposition mode. */
      strategy?: (goal: string) => readonly { id: string; goal: string; workerId: string }[];
      /** "smart" (default), "model", or "single" without an explicit strategy. */
      decomposition?: "smart" | "model" | "single";
      /** Maximum clauses the smart/model strategy may produce. Default 6. */
      maxSubTasks?: number;
      /** Also records the outcome as ATLAS episodic memory (default true). */
      record?: boolean;
    } = {},
  ): Promise<OrchestrationOutcome> {
    const { subTasks, decompositionMode } = await this.buildSubTasks(goal, options);
    const delegationResults: DelegationResult[] = [];

    for (const task of subTasks) {
      delegationResults.push(
        await this.coordinator.delegate({
          taskId: task.id,
          fromAgentId: this.identity.id,
          toAgentId: task.workerId,
          goal: task.goal,
          metadata: { parentGoal: goal, delegatedBy: "atlas" },
        }),
      );
    }

    const succeeded = delegationResults.filter((r) => r.status === "success").length;
    const failed = delegationResults.length - succeeded;
    const status: OrchestrationOutcome["status"] =
      delegationResults.length === 0
        ? "empty"
        : failed === 0
          ? "complete"
          : succeeded === 0
            ? "failed"
            : "partial";

    const outcome: OrchestrationOutcome = {
      goal,
      supervisorId: this.identity.id,
      subTasks,
      delegationResults,
      succeeded,
      failed,
      status,
      decompositionMode,
      synthesis:
        `Objective "${goal}": ${succeeded}/${delegationResults.length} sub-task(s) succeeded` +
        (failed > 0 ? `, ${failed} failed.` : "."),
      completedAt: new Date(),
    };

    if (options.record !== false) {
      await this.recordOrchestrationOutcome(outcome);
    }
    return outcome;
  }

  /** Runs a goal through ATLAS's own cognitive loop (no delegation). */
  async run(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /**
   * Builds the sub-task plan for an objective: explicit strategy wins,
   * otherwise the built-in smart (default), model, or single mode runs
   * against the coordinator's registered non-executive workers.
   * Returns the plan together with the mode actually used — model mode
   * reports "smart" when it fell back.
   */
  private async buildSubTasks(
    goal: string,
    options: {
      strategy?: (goal: string) => readonly { id: string; goal: string; workerId: string }[];
      decomposition?: "smart" | "model" | "single";
      maxSubTasks?: number;
    },
  ): Promise<{
    subTasks: readonly { id: string; goal: string; workerId: string }[];
    decompositionMode: "explicit" | "smart" | "model" | "single";
  }> {
    if (options.strategy !== undefined) {
      return { subTasks: options.strategy(goal), decompositionMode: "explicit" };
    }

    const workers = this.coordinator
      .listAgents()
      .filter((agent) => agent.identity.id !== this.identity.id);

    const maxClauses = options.maxSubTasks;

    if (options.decomposition === "model") {
      if (
        this.modelOptions === undefined ||
        this.modelOptions.router === undefined ||
        this.modelOptions.providerId === undefined ||
        this.modelOptions.modelId === undefined
      ) {
        // No model configured — deterministic behaviour, mode "smart".
        const smart = createSmartStrategy(workers, {
          ...(maxClauses !== undefined ? { maxClauses } : {}),
        });
        return { subTasks: smart(goal), decompositionMode: "smart" };
      }
      const modelStrategy = createModelStrategy(workers, {
        router: this.modelOptions.router,
        providerId: this.modelOptions.providerId,
        modelId: this.modelOptions.modelId,
        ...(maxClauses !== undefined ? { maxClauses } : {}),
      });
      const subTasks = await modelStrategy(goal);
      return { subTasks, decompositionMode: "model" };
    }

    if (options.decomposition === "single") {
      const smart = createSmartStrategy(workers, { maxClauses: 1 });
      return { subTasks: smart(goal), decompositionMode: "single" };
    }

    const smart = createSmartStrategy(workers, {
      ...(maxClauses !== undefined ? { maxClauses } : {}),
    });
    return { subTasks: smart(goal), decompositionMode: "smart" };
  }

  /** Persists an objective as scoped semantic memory. */
  async rememberObjective(
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
    importance = 0.95,
  ): Promise<Memory> {
    return this.agent.memory.semantic.rememberFact(
      content,
      { source: "atlas", ...metadata },
      importance,
    );
  }

  /** Recalls stored objectives by query. */
  async objectives(query: string, limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.semantic.recall(query, limit);
  }

  /** Records any DelegationResult as an ATLAS episodic memory (audit trail). */
  async recordDelegationOutcome(result: DelegationResult): Promise<string> {
    const summary =
      `ATLAS delegation ${result.taskId}: ${result.status} — ` +
      `"${result.goal}" to ${result.toAgentId}` +
      (result.error !== undefined ? ` (${result.error})` : "") +
      `, closed ${result.completedAt.toISOString()}.`;

    await this.agent.memory.episodic.rememberExperience(summary, {
      source: "atlas",
      taskId: result.taskId,
      toAgentId: result.toAgentId,
      status: result.status,
      ...(result.error !== undefined ? { error: result.error } : {}),
    }, result.status === "success" ? 0.6 : 0.85);

    return summary;
  }

  /** Records an OrchestrationOutcome as episodic memory. */
  async recordOrchestrationOutcome(outcome: OrchestrationOutcome): Promise<string> {
    const summary =
      `ATLAS orchestration of "${outcome.goal}" ${outcome.status}: ` +
      `${outcome.succeeded}/${outcome.delegationResults.length} sub-tasks succeeded.`;

    await this.agent.memory.episodic.rememberExperience(summary, {
      source: "atlas",
      objective: outcome.goal,
      orchestrationStatus: outcome.status,
      succeeded: outcome.succeeded,
      failed: outcome.failed,
      completedAt: outcome.completedAt.toISOString(),
    }, outcome.status === "complete" ? 0.7 : 0.9);

    return summary;
  }

  /** Recalls past delegation/orchestration episodes. */
  async delegationHistory(limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.episodic.recall("ATLAS", limit);
  }

  /**
   * Sends a directive to a specialist agent over the shared message bus.
   * Directives are advisory: workers keep their own authorization.
   */
  broadcastDirective(
    toAgentId: string,
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ) {
    return this.agent.send(toAgentId, content, { kind: "directive", ...metadata });
  }

  /** Reads and clears ATLAS's inbox. Returns [] without a bus. */
  receiveMessages() {
    return this.agent.receiveMessages();
  }

  /** Tool calls recorded through the observed gateway since last drain. */
  getToolCalls() {
    return this.collector.drain();
  }
}
