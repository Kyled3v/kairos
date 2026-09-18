import { KairosAgent } from "../agent.js";
import { AgentRegistry } from "../identity.js";
import type { AgentMessageBus } from "../message-bus.js";
import { assertNoWriteExecuteCapability } from "../tool-boundary.js";
import { ToolRegistry } from "../../core/tools/registry.js";
import { ToolPolicy } from "../../core/tools/policy.js";
import { ObservedToolGateway } from "../../core/tools/observed-gateway.js";
import { ToolCallCollector } from "../../core/tools/collector.js";
import { InMemoryMemoryStore } from "../../core/memory/in-memory-store.js";
import { createPipelineDependencies } from "../../factory/pipeline-dependencies.js";
import { createKairos } from "../../factory/index.js";
import { calculatorTool } from "../../core/tools/built-in/calculator.js";
import { dateTimeTool } from "../../core/tools/built-in/date-time.js";
import { dataLookupTool } from "../../core/tools/built-in/data-lookup.js";
import { mockHttpTool } from "../../core/tools/built-in/mock-http.js";
import { readFileTool } from "../../core/tools/built-in/read-file.js";
import { listDirectoryTool } from "../../core/tools/built-in/list-directory.js";
import { searchCodeTool } from "../../core/tools/built-in/search-code.js";
import type { ModelRouter } from "../../intelligence/models/router.js";
import type { ExperienceStore } from "../../core/experience/record.js";
import type { MemoryStore, Memory } from "../../core/memory/types.js";
import type { MultiCycleResult } from "../../core/orchestrator/types.js";
import type { SessionOrchestratorOptions } from "../../core/orchestrator/session-orchestrator.js";
import type { ToolRegistry as ToolRegistryType } from "../../core/tools/registry.js";
import type { ToolPolicy as ToolPolicyType } from "../../core/tools/policy.js";
import type { Tool } from "../../core/tools/types.js";
import type { PipelineDependencies } from "../../core/orchestrator/pipeline.js";

export interface OrionAgentOptions {
  /** Registry id for this agent. Defaults to the stable "orion". */
  readonly agentId?: string;
  readonly memoryStore?: MemoryStore;
  readonly registry?: AgentRegistry;
  readonly messageBus?: AgentMessageBus;
  readonly experienceStore?: ExperienceStore;
  readonly session?: SessionOrchestratorOptions;
  readonly router?: ModelRouter;
  readonly providerId?: string;
  readonly modelId?: string;
  /** Filesystem research tools (read-file, list-directory, search-code). Enabled by default. */
  readonly allowFilesystemTools?: boolean;
  /** Additional read-only tools to register. Write/execute tools are rejected. */
  readonly extraTools?: readonly Tool[];
}

const OWNER = "ORION";

/**
 * ORION — Research and discovery specialist agent.
 *
 * The first named specialist agent built on the generic KAIROS agent
 * infrastructure (KairosAgent + AgentScopedMemoryStore + ToolGateway).
 *
 * Contract (docs/architecture/agents.md):
 * - identity: stable "orion" id with role/specialty metadata
 * - capabilities: information gathering via read-only tools
 * - constraints: no write, no execution, no network writes
 * - tools: research toolset (http-mock, lookup, filesystem reads)
 * - permissions: enforced by ToolPolicy (public + restricted, low risk)
 * - memory: scoped semantic memory for findings, episodic for sessions
 * - audit: every tool call recorded via ToolCallCollector and experience store
 *
 * ORION deliberately has NO write or execute tools: the toolset enforces the
 * read-only boundary, and the policy blocks anything forbidden even if a
 * caller registers it later.
 */
export class OrionAgent {
  private readonly agent: KairosAgent;
  private readonly collector: ToolCallCollector;
  readonly toolRegistry: ToolRegistryType;
  readonly policy: ToolPolicyType;
  readonly toolGateway: ObservedToolGateway;

  constructor(options: OrionAgentOptions = {}) {
    const registry = options.registry ?? new AgentRegistry();
    const identity = registry.register({
      ...(options.agentId === undefined ? {} : { id: options.agentId }),
      name: "orion",
      metadata: {
        role: "research",
        specialty: "research-and-discovery",
        capabilities: [
          "information-gathering",
          "source-inspection",
          "code-exploration",
          "data-lookup",
        ],
        constraints: ["read-only tool access", "no shell execution", "no memory writes outside own scope"],
      },
    });

    // ── Tools: research toolset, read-only by construction ──────────────
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(dateTimeTool);
    toolRegistry.register(dataLookupTool);
    toolRegistry.register(mockHttpTool);
    if (options.allowFilesystemTools !== false) {
      toolRegistry.register(readFileTool);
      toolRegistry.register(listDirectoryTool);
      toolRegistry.register(searchCodeTool);
    }
    for (const tool of options.extraTools ?? []) {
      assertNoWriteExecuteCapability(tool, OWNER);
      toolRegistry.register(tool);
    }

    // ORION policy: public + restricted tools, never high risk. Write or
    // execute tools registered after construction are still blocked here.
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
  }

  /** Stable agent identity (id "orion", research role metadata). */
  get identity() {
    return this.agent.identity;
  }

  /** ORION's isolated memory facade over the (possibly shared) store. */
  get memory() {
    return this.agent.memory;
  }

  /**
   * Runs a research goal through the cognitive loop. Alias of run() that
   * reads naturally at call sites: orion.research("Investigate ...").
   */
  async research(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /** Runs a research goal (KairosAgent-compatible entry point). */
  async run(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /** Persists a research finding as scoped semantic memory. */
  async rememberFinding(
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
    importance = 0.9,
  ): Promise<Memory> {
    return this.agent.memory.semantic.rememberFact(
      content,
      { source: "orion", ...metadata },
      importance,
    );
  }

  /** Recalls research findings by query. */
  async findings(query: string, limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.semantic.recall(query, limit);
  }

  /**
   * Records a compact session summary as episodic memory so past research
   * sessions can be recalled later.
   */
  async recordSessionSummary(result: MultiCycleResult): Promise<string> {
    const summary =
      `ORION research session: "${result.goal}" — ${result.status}` +
      ` after ${result.totalCycles} cycle(s)` +
      ` (${result.terminationReason}).`;

    await this.agent.memory.episodic.rememberExperience(summary, {
      source: "orion",
      sessionGoal: result.goal,
      orchestrationStatus: result.status,
      terminationReason: result.terminationReason,
      totalCycles: result.totalCycles,
      completedAt: result.completedAt.toISOString(),
    });

    return summary;
  }

  /** Recalls past research session summaries. */
  async sessionHistory(limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.episodic.recall("ORION research session", limit);
  }

  /** Sends a message to another agent over the shared bus. */
  sendToAgent(
    toAgentId: string,
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ) {
    return this.agent.send(toAgentId, content, metadata);
  }

  /** Reads and clears ORION's inbox. Returns [] without a bus. */
  receiveMessages() {
    return this.agent.receiveMessages();
  }

  /** Tool calls recorded through the observed gateway since last drain. */
  getToolCalls() {
    return this.collector.drain();
  }
}
