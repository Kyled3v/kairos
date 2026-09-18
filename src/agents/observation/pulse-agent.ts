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
import { mockHttpTool } from "../../core/tools/built-in/mock-http.js";
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

export interface PulseAgentOptions {
  /** Registry id for this agent. Defaults to the stable "pulse". */
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
   * Codebase-inspection tools (list-directory, search-code) for watching
   * repo state. Enabled by default. read-file is deliberately NOT part of
   * the monitoring set — PULSE observes, it does not consume contents.
   */
  readonly allowCodebaseInspection?: boolean;
  /** Additional read-only tools to register. Write/execute tools are rejected. */
  readonly extraTools?: readonly Tool[];
}

const OWNER = "PULSE";

export interface StatusReport {
  /** Aggregate status derived from tool outcomes. */
  readonly status: "operational" | "degraded" | "unreachable";
  readonly observedAt: Date;
  readonly details: Readonly<Record<string, unknown>>;
  /** How many gateway tool calls the check performed. */
  readonly toolCallCount: number;
}

/**
 * PULSE — Observation and monitoring specialist agent.
 *
 * Fourth named specialist agent (ADR-001 composition pattern). PULSE
 * maintains environmental awareness per docs/architecture/agents.md:
 *
 * - identity: stable "pulse" id, observation role
 * - tools: lightweight probes (date-time, data-lookup, mock-http, and
 *   optionally list-directory/search-code) — read-only, policy-enforced;
 *   no read-file (observes structure, not contents)
 * - memory: observations as episodic memories in its own scope
 * - audit: every probe recorded via ToolCallCollector and the experience
 *   store, like every specialist
 *
 * PULSE reports conditions; it never mutates anything — not the
 * filesystem, not the network, not other agents' memory.
 */
export class PulseAgent {
  private readonly agent: KairosAgent;
  private readonly collector: ToolCallCollector;
  readonly toolRegistry: ToolRegistryType;
  readonly policy: ToolPolicyType;
  readonly toolGateway: ObservedToolGateway;

  constructor(options: PulseAgentOptions = {}) {
    const registry = options.registry ?? new AgentRegistry();
    const identity = registry.register({
      ...(options.agentId === undefined ? {} : { id: options.agentId }),
      name: "pulse",
      metadata: {
        role: "observation",
        specialty: "observation-and-monitoring",
        capabilities: [
          "environment-monitoring",
          "status-probing",
          "change-observation",
          "health-reporting",
        ],
        constraints: [
          "read-only tool access",
          "no filesystem reads of file contents",
          "writes only own observation records",
        ],
      },
    });

    // ── Tools: monitoring probes, read-only by construction ─────────────
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(dateTimeTool);
    toolRegistry.register(dataLookupTool);
    toolRegistry.register(mockHttpTool);
    if (options.allowCodebaseInspection !== false) {
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

  /** Stable agent identity (id "pulse", observation role metadata). */
  get identity() {
    return this.agent.identity;
  }

  /** PULSE's isolated memory facade over the (possibly shared) store. */
  get memory() {
    return this.agent.memory;
  }

  /** Runs a monitoring goal through the cognitive loop. */
  async run(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /** Alias of run() phrased for monitoring work. */
  async monitor(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /**
   * Probes current system status through the tool gateway (data-lookup
   * for the KAIROS status key, date-time for the observation timestamp)
   * and records the resulting observation. A failed probe degrades the
   * report but never throws — monitoring must be resilient.
   */
  async checkStatus(): Promise<StatusReport> {
    const statusCall = await this.toolGateway.execute(this.identity.id, {
      toolId: "kairos.data-lookup",
      parameters: { key: "kairos.status" },
      requestedBy: this.identity.id,
      requestId: crypto.randomUUID(),
    });
    const timeCall = await this.toolGateway.execute(this.identity.id, {
      toolId: "kairos.date-time",
      parameters: {},
      requestedBy: this.identity.id,
      requestId: crypto.randomUUID(),
    });

    const statusValue =
      statusCall.status === "success"
        ? (statusCall.result as { value?: unknown } | undefined)?.value
        : undefined;
    const iso =
      timeCall.status === "success"
        ? (timeCall.result as { iso?: string } | undefined)?.iso
        : undefined;
    const observedAt = iso !== undefined ? new Date(iso) : new Date();

    const status: StatusReport["status"] =
      statusCall.status === "success" && statusValue === "operational"
        ? "operational"
        : statusCall.status === "blocked"
          ? "unreachable"
          : "degraded";

    const report: StatusReport = {
      status,
      observedAt,
      details: {
        probe: "kairos.data-lookup:kairos.status",
        probeStatus: statusCall.status,
        ...(statusCall.error !== undefined ? { probeError: statusCall.error } : {}),
        ...(statusValue !== undefined ? { reportedValue: statusValue } : {}),
      },
      toolCallCount: 2,
    };

    await this.recordObservation(
      "system-status",
      `PULSE status probe: ${status} (probe ${statusCall.status}).`,
      { severity: status === "operational" ? "info" : "warning", ...report.details },
    );

    return report;
  }

  /**
   * Records an observation as scoped episodic memory. The subject is
   * embedded in the stored content ("[subject] ...") so recall-by-subject
   * works with content-substring retrieval.
   */
  async recordObservation(
    subject: string,
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
    importance = 0.7,
  ): Promise<Memory> {
    return this.agent.memory.episodic.rememberExperience(
      `[${subject}] ${content}`,
      { source: "pulse", subject, ...metadata },
      importance,
    );
  }

  /** Recalls observations by subject or content query. */
  async observations(query: string, limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.episodic.recall(query, limit);
  }

  /** Sends a message to another agent over the shared bus. */
  sendToAgent(
    toAgentId: string,
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ) {
    return this.agent.send(toAgentId, content, metadata);
  }

  /** Reads and clears PULSE's inbox. Returns [] without a bus. */
  receiveMessages() {
    return this.agent.receiveMessages();
  }

  /** Tool calls recorded through the observed gateway since last drain. */
  getToolCalls() {
    return this.collector.drain();
  }
}
