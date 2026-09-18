import { KairosAgent } from "../agent.js";
import { AgentRegistry } from "../identity.js";
import type { AgentMessageBus } from "../message-bus.js";
import { FORBIDDEN_WRITE_EXECUTE_CAPABILITIES } from "../tool-boundary.js";
import { ToolRegistry } from "../../core/tools/registry.js";
import { ToolPolicy } from "../../core/tools/policy.js";
import { ObservedToolGateway } from "../../core/tools/observed-gateway.js";
import { ToolCallCollector } from "../../core/tools/collector.js";
import { InMemoryMemoryStore } from "../../core/memory/in-memory-store.js";
import { createPipelineDependencies } from "../../factory/pipeline-dependencies.js";
import { createKairos } from "../../factory/index.js";
import { calculatorTool } from "../../core/tools/built-in/calculator.js";
import { dateTimeTool } from "../../core/tools/built-in/date-time.js";
import { readFileTool } from "../../core/tools/built-in/read-file.js";
import { listDirectoryTool } from "../../core/tools/built-in/list-directory.js";
import { searchCodeTool } from "../../core/tools/built-in/search-code.js";
import { writeFileTool } from "../../core/tools/built-in/write-file.js";
import { runCommandTool } from "../../core/tools/built-in/run-command.js";
import type { ModelRouter } from "../../intelligence/models/router.js";
import type { ExperienceStore } from "../../core/experience/record.js";
import type { MemoryStore, Memory } from "../../core/memory/types.js";
import type { MultiCycleResult } from "../../core/orchestrator/types.js";
import type { SessionOrchestratorOptions } from "../../core/orchestrator/session-orchestrator.js";
import type { ToolRegistry as ToolRegistryType } from "../../core/tools/registry.js";
import type { ToolPolicy as ToolPolicyType } from "../../core/tools/policy.js";
import type { Tool } from "../../core/tools/types.js";
import type { PipelineDependencies } from "../../core/orchestrator/pipeline.js";

export interface ForgeAgentOptions {
  /** Registry id for this agent. Defaults to the stable "forge". */
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
   * Grants the write-file tool (capability "write-local"). Disabled by
   * default — FORGE starts read-only and gains write access explicitly.
   */
  readonly allowWrite?: boolean;
  /**
   * Grants the run-command tool (capability "execute-shell", allowlisted
   * commands only). Disabled by default.
   */
  readonly allowRunCommand?: boolean;
  /** Additional tools to register. Rejected when they exceed granted access. */
  readonly extraTools?: readonly Tool[];
}

/**
 * FORGE — Engineering specialist agent.
 *
 * Built on the ADR-001 specialist composition pattern (KairosAgent +
 * scoped memory + observed tool gateway). FORGE is the first specialist
 * with write/execute capability, and that power is explicitly gated:
 *
 * - Default toolset is read-only (inspect, search, calculate, date-time).
 * - "write-local" requires allowWrite: true; "execute-shell" requires
 *   allowRunCommand: true — and even then run-command only executes its
 *   strict command allowlist (npm scripts, git inspection).
 * - extraTools carrying capabilities beyond the granted set are rejected
 *   at construction, and the policy blocks forbidden tools even if a
 *   caller registers them later. Defence in depth, like every specialist.
 *
 * Contract (docs/architecture/agents.md):
 * - identity: stable "forge" id with engineering role metadata
 * - capabilities: implementation, refactoring, testing, debugging
 * - constraints: write access gated behind explicit flags
 * - permissions: ToolPolicy public+restricted (privileged only when gated
 *   access is enabled), maxRisk medium (high when run-command is granted)
 * - memory: scoped semantic memory for engineering notes, episodic for
 *   build summaries
 * - audit: every tool call recorded via ToolCallCollector and the
 *   experience store
 */
export class ForgeAgent {
  private readonly agent: KairosAgent;
  private readonly collector: ToolCallCollector;
  readonly toolRegistry: ToolRegistryType;
  readonly policy: ToolPolicyType;
  readonly toolGateway: ObservedToolGateway;

  constructor(options: ForgeAgentOptions = {}) {
    const registry = options.registry ?? new AgentRegistry();
    const identity = registry.register({
      ...(options.agentId === undefined ? {} : { id: options.agentId }),
      name: "forge",
      metadata: {
        role: "engineering",
        specialty: "software-engineering",
        capabilities: [
          "implementation",
          "refactoring",
          "testing",
          "debugging",
          "code-exploration",
        ],
        constraints: [
          "write access gated behind explicit flags",
          ...(options.allowRunCommand === true
            ? []
            : ["no shell execution"]),
        ],
      },
    });

    // ── Tools: read-only by default; write/execute strictly opt-in ──────
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(dateTimeTool);
    toolRegistry.register(calculatorTool);
    toolRegistry.register(readFileTool);
    toolRegistry.register(listDirectoryTool);
    toolRegistry.register(searchCodeTool);
    if (options.allowWrite === true) toolRegistry.register(writeFileTool);
    if (options.allowRunCommand === true) toolRegistry.register(runCommandTool);

    // extras may not exceed the access level granted via the flags.
    const grantsWrite = options.allowWrite === true;
    const grantsExecute = options.allowRunCommand === true;
    for (const tool of options.extraTools ?? []) {
      const forbidden = tool.definition.capabilities.filter((capability) =>
        FORBIDDEN_WRITE_EXECUTE_CAPABILITIES.has(capability),
      );
      const denied = forbidden.filter((capability) => {
        if (capability === "write-local") return !grantsWrite;
        return !grantsExecute; // write-network and execute-shell
      });
      if (denied.length > 0) {
        throw new Error(
          `FORGE forbids tool ${tool.definition.id} with capability "${denied[0]}" ` +
            `(write/execute access not granted).`,
        );
      }
      toolRegistry.register(tool);
    }

    const privileged =
      options.allowWrite === true || options.allowRunCommand === true;
    const permissions: Array<"public" | "restricted" | "privileged"> = [
      "public",
      "restricted",
    ];
    if (privileged) permissions.push("privileged");

    const policy = new ToolPolicy({
      actorPermissions: permissions,
      maxRisk: options.allowRunCommand === true ? "high" : "medium",
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

  /** Stable agent identity (id "forge", engineering role metadata). */
  get identity() {
    return this.agent.identity;
  }

  /** FORGE's isolated memory facade over the (possibly shared) store. */
  get memory() {
    return this.agent.memory;
  }

  /**
   * Runs an engineering goal through the cognitive loop. Alias of run()
   * that reads naturally at call sites: forge.build("Implement ...").
   */
  async build(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /** Runs an engineering goal (KairosAgent-compatible entry point). */
  async run(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /** Persists an engineering note as scoped semantic memory. */
  async rememberImplementation(
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
    importance = 0.9,
  ): Promise<Memory> {
    return this.agent.memory.semantic.rememberFact(
      content,
      { source: "forge", ...metadata },
      importance,
    );
  }

  /** Recalls engineering notes by query. */
  async implementations(query: string, limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.semantic.recall(query, limit);
  }

  /**
   * Records a compact build summary as episodic memory so past engineering
   * sessions can be recalled later.
   */
  async recordBuildSummary(result: MultiCycleResult): Promise<string> {
    const summary =
      `FORGE engineering session: "${result.goal}" — ${result.status}` +
      ` after ${result.totalCycles} cycle(s)` +
      ` (${result.terminationReason}).`;

    await this.agent.memory.episodic.rememberExperience(summary, {
      source: "forge",
      sessionGoal: result.goal,
      orchestrationStatus: result.status,
      terminationReason: result.terminationReason,
      totalCycles: result.totalCycles,
      completedAt: result.completedAt.toISOString(),
    });

    return summary;
  }

  /** Recalls past engineering session summaries. */
  async buildHistory(limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.episodic.recall("FORGE engineering session", limit);
  }

  /** Sends a message to another agent over the shared bus. */
  sendToAgent(
    toAgentId: string,
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ) {
    return this.agent.send(toAgentId, content, metadata);
  }

  /** Reads and clears FORGE's inbox. Returns [] without a bus. */
  receiveMessages() {
    return this.agent.receiveMessages();
  }

  /** Tool calls recorded through the observed gateway since last drain. */
  getToolCalls() {
    return this.collector.drain();
  }
}
