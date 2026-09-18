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

export interface NovaAgentOptions {
  /** Registry id for this agent. Defaults to the stable "nova". */
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
   * Source-inspection tools (read-file, list-directory, search-code) for
   * reading material to synthesize from. Enabled by default. NOVA's output
   * is memory, never files — so write-file is not part of its set even as
   * an option.
   */
  readonly allowFilesystemSources?: boolean;
  /** Additional read-only tools to register. Write/execute tools are rejected. */
  readonly extraTools?: readonly Tool[];
}

const OWNER = "NOVA";

/**
 * NOVA — Creation and synthesis specialist agent.
 *
 * Sixth named specialist agent (ADR-001 composition pattern). NOVA
 * composes new content from existing material per
 * docs/architecture/agents.md:
 *
 * - identity: stable "nova" id, creation role
 * - tools: source-reading and reference set (read-file, list-directory,
 *   search-code, data-lookup, mock-http, calculator, date-time) —
 *   read-only, policy-enforced. NOVA reads material and writes drafts to
 *   its own memory scope; it never writes files or runs commands.
 * - memory: drafts and syntheses as scoped semantic memories, creation
 *   session summaries as episodic memory
 * - audit: every tool call recorded via ToolCallCollector and the
 *   experience store, like every specialist
 *
 * Creation power is expressed through memory and messaging (a draft is
 * returned to the caller or ATLAS), not through mutation of the outside
 * world. Write/execute tools are rejected at construction and blocked by
 * policy afterwards.
 */
export class NovaAgent {
  private readonly agent: KairosAgent;
  private readonly collector: ToolCallCollector;
  readonly toolRegistry: ToolRegistryType;
  readonly policy: ToolPolicyType;
  readonly toolGateway: ObservedToolGateway;

  constructor(options: NovaAgentOptions = {}) {
    const registry = options.registry ?? new AgentRegistry();
    const identity = registry.register({
      ...(options.agentId === undefined ? {} : { id: options.agentId }),
      name: "nova",
      metadata: {
        role: "creation",
        specialty: "creation-and-synthesis",
        capabilities: [
          "content-synthesis",
          "draft-composition",
          "summarization",
          "creative-association",
          "source-inspection",
        ],
        constraints: [
          "read-only tool access",
          "writes drafts only to own memory scope",
          "no shell execution",
        ],
      },
    });

    // ── Tools: source + reference set, read-only by construction ────────
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(dateTimeTool);
    toolRegistry.register(calculatorTool);
    toolRegistry.register(dataLookupTool);
    toolRegistry.register(mockHttpTool);
    if (options.allowFilesystemSources !== false) {
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

  /** Stable agent identity (id "nova", creation role metadata). */
  get identity() {
    return this.agent.identity;
  }

  /** NOVA's isolated memory facade over the (possibly shared) store. */
  get memory() {
    return this.agent.memory;
  }

  /** Runs a creation goal through the cognitive loop. */
  async run(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /** Alias of run() phrased for creation work. */
  async create(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /**
   * Saves a draft as scoped semantic memory. Drafts are NOVA's output
   * surface: returned to callers (or ATLAS) via memory recall and the
   * returned Memory handle.
   */
  async saveDraft(
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
    importance = 0.85,
  ): Promise<Memory> {
    return this.agent.memory.semantic.rememberFact(
      content,
      { source: "nova", kind: "draft", ...metadata },
      importance,
    );
  }

  /** Recalls drafts by query. */
  async drafts(query: string, limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.semantic.recall(query, limit);
  }

  /**
   * Synthesizes multiple notes into one combined semantic memory under a
   * shared topic. This is NOVA's core specialty: merging separate pieces
   * of material into a single composed artifact.
   */
  async synthesize(
    topic: string,
    ...notes: readonly string[]
  ): Promise<Memory> {
    if (notes.length === 0) {
      throw new Error("NOVA synthesize requires at least one note.");
    }
    const composed = notes
      .map((note, index) => `[${index + 1}] ${note.trim()}`)
      .join(" ");
    return this.saveDraft(
      `NOVA synthesis on "${topic}": ${composed}`,
      { topic, sourceCount: notes.length },
    );
  }

  /**
   * Records a creation session summary as episodic memory so past
   * creation sessions can be recalled later.
   */
  async recordSessionSummary(result: MultiCycleResult): Promise<string> {
    const summary =
      `NOVA creation session: "${result.goal}" — ${result.status}` +
      ` after ${result.totalCycles} cycle(s)` +
      ` (${result.terminationReason}).`;

    await this.agent.memory.episodic.rememberExperience(summary, {
      source: "nova",
      sessionGoal: result.goal,
      orchestrationStatus: result.status,
      terminationReason: result.terminationReason,
      totalCycles: result.totalCycles,
      completedAt: result.completedAt.toISOString(),
    });

    return summary;
  }

  /** Recalls past creation session summaries. */
  async sessionHistory(limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.episodic.recall("NOVA creation session", limit);
  }

  /** Sends a message to another agent over the shared bus. */
  sendToAgent(
    toAgentId: string,
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ) {
    return this.agent.send(toAgentId, content, metadata);
  }

  /** Reads and clears NOVA's inbox. Returns [] without a bus. */
  receiveMessages() {
    return this.agent.receiveMessages();
  }

  /** Tool calls recorded through the observed gateway since last drain. */
  getToolCalls() {
    return this.collector.drain();
  }
}
