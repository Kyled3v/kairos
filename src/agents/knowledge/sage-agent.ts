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
import { dateTimeTool } from "../../core/tools/built-in/date-time.js";
import { dataLookupTool } from "../../core/tools/built-in/data-lookup.js";
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

export interface SageAgentOptions {
  /** Registry id for this agent. Defaults to the stable "sage". */
  readonly agentId?: string;
  readonly memoryStore?: MemoryStore;
  readonly registry?: AgentRegistry;
  readonly messageBus?: AgentMessageBus;
  readonly experienceStore?: ExperienceStore;
  readonly session?: SessionOrchestratorOptions;
  readonly router?: ModelRouter;
  readonly providerId?: string;
  readonly modelId?: string;
  /** Filesystem tools for reading sources (read-file, list-directory, search-code). Enabled by default. */
  readonly allowFilesystemTools?: boolean;
  /** Additional read-only tools to register. Write/execute tools are rejected. */
  readonly extraTools?: readonly Tool[];
}

const OWNER = "SAGE";

/**
 * SAGE — Knowledge and memory specialist agent.
 *
 * Third named specialist agent (ADR-001 composition pattern). SAGE
 * organises, retains and retrieves knowledge per docs/architecture/agents.md:
 *
 * - identity: stable "sage" id, knowledge role
 * - tools: source-reading set (read-file, list-directory, search-code,
 *   data-lookup, date-time) — read-only, policy-enforced
 * - memory: scoped; facts as semantic memories (the core specialty),
 *   procedures as procedural memories, ingest sessions as episodic
 * - audit: tool calls and cycles recorded like every specialist
 *
 * Knowledge acquisition is a deliberate write to SAGE's own memory scope —
 * never to the filesystem or network. Write/execute tools are rejected at
 * construction and blocked by policy afterwards.
 */
export class SageAgent {
  private readonly agent: KairosAgent;
  private readonly collector: ToolCallCollector;
  readonly toolRegistry: ToolRegistryType;
  readonly policy: ToolPolicyType;
  readonly toolGateway: ObservedToolGateway;

  constructor(options: SageAgentOptions = {}) {
    const registry = options.registry ?? new AgentRegistry();
    const identity = registry.register({
      ...(options.agentId === undefined ? {} : { id: options.agentId }),
      name: "sage",
      metadata: {
        role: "knowledge",
        specialty: "knowledge-and-memory",
        capabilities: [
          "knowledge-acquisition",
          "fact-storage",
          "procedure-storage",
          "retrieval",
          "source-inspection",
        ],
        constraints: [
          "read-only tool access",
          "writes only to own memory scope",
          "no shell execution",
        ],
      },
    });

    // ── Tools: knowledge/source toolset, read-only by construction ──────
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(dateTimeTool);
    toolRegistry.register(dataLookupTool);
    if (options.allowFilesystemTools !== false) {
      toolRegistry.register(readFileTool);
      toolRegistry.register(listDirectoryTool);
      toolRegistry.register(searchCodeTool);
    }
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

    let dependencies;
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

  /** Stable agent identity (id "sage", knowledge role metadata). */
  get identity() {
    return this.agent.identity;
  }

  /** SAGE's isolated memory facade over the (possibly shared) store. */
  get memory() {
    return this.agent.memory;
  }

  /** Runs a knowledge goal through the cognitive loop. */
  async run(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /** Alias of run() phrased for knowledge work. */
  async organise(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /** Stores a fact as scoped semantic memory (the core SAGE specialty). */
  async learnFact(
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
    importance = 0.9,
  ): Promise<Memory> {
    return this.agent.memory.semantic.rememberFact(
      content,
      { source: "sage", ...metadata },
      importance,
    );
  }

  /** Stores a procedure ("how to do X") as scoped procedural memory. */
  async learnProcedure(
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
    importance = 0.85,
  ): Promise<Memory> {
    return this.agent.memory.procedural.rememberProcedure(
      content,
      { source: "sage", ...metadata },
      importance,
    );
  }

  /** Recalls facts by query. */
  async recallFacts(query: string, limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.semantic.recall(query, limit);
  }

  /** Recalls procedures by query. */
  async recallProcedures(query: string, limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.procedural.recall(query, limit);
  }

  /**
   * Ingests a batch of facts under a shared topic tag and records an
   * ingest session summary as episodic memory. Returns the stored facts.
   */
  async ingest(
    topic: string,
    facts: readonly string[],
    importance = 0.9,
  ): Promise<readonly Memory[]> {
    const stored: Memory[] = [];
    for (const fact of facts) {
      stored.push(await this.learnFact(fact, { topic }, importance));
    }

    await this.agent.memory.episodic.rememberExperience(
      `SAGE ingest: ${facts.length} fact(s) under topic "${topic}".`,
      { source: "sage", topic, count: facts.length },
    );

    return stored;
  }

  /** Recalls past ingest sessions. */
  async ingestHistory(limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.episodic.recall("SAGE ingest", limit);
  }

  /** Sends a message to another agent over the shared bus. */
  sendToAgent(
    toAgentId: string,
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ) {
    return this.agent.send(toAgentId, content, metadata);
  }

  /** Reads and clears SAGE's inbox. Returns [] without a bus. */
  receiveMessages() {
    return this.agent.receiveMessages();
  }

  /** Tool calls recorded through the observed gateway since last drain. */
  getToolCalls() {
    return this.collector.drain();
  }
}
