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
import { dateTimeTool } from "../../core/tools/built-in/date-time.js";
import { dataLookupTool } from "../../core/tools/built-in/data-lookup.js";
import { readFileTool } from "../../core/tools/built-in/read-file.js";
import { listDirectoryTool } from "../../core/tools/built-in/list-directory.js";
import { createRunCommandTool } from "../../core/tools/built-in/run-command.js";
import { writeFileTool } from "../../core/tools/built-in/write-file.js";
import { BasicAuthorizationEngine } from "../../security/authorization/basic-engine.js";
import { AuthorizedActionGateway } from "../../security/authorization/gateway.js";
import { BasicActionExecutor } from "../../core/action/basic-executor.js";
import type { AuthorizationEngine } from "../../security/authorization/types.js";
import type { ActionExecutor } from "../../core/action/executor.js";
import type { ActionRequest, ActionResult } from "../../core/action/types.js";
import type { ModelRouter } from "../../intelligence/models/router.js";
import type { ExperienceStore } from "../../core/experience/record.js";
import type { MemoryStore, Memory } from "../../core/memory/types.js";
import type { MultiCycleResult } from "../../core/orchestrator/types.js";
import type { SessionOrchestratorOptions } from "../../core/orchestrator/session-orchestrator.js";
import type { ToolRegistry as ToolRegistryType } from "../../core/tools/registry.js";
import type { ToolPolicy as ToolPolicyType } from "../../core/tools/policy.js";
import type { ToolOutput } from "../../core/tools/types.js";
import type { Tool } from "../../core/tools/types.js";

export interface VectorAgentOptions {
  /** Registry id for this agent. Defaults to the stable "vector". */
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
   * Grants the run-command tool (capability "execute-shell"). Disabled by
   * default, and even when granted the tool is confined to workingRoot
   * and its strict command allowlist.
   */
  readonly allowExecute?: boolean;
  /** Grants the write-file tool (capability "write-local"). Disabled by default. */
  readonly allowWrite?: boolean;
  /**
   * Sandbox root for the gated run-command tool. Defaults to
   * process.cwd(); commands' cwd must resolve inside this directory tree.
   */
  readonly workingRoot?: string;
  /** Custom authorization engine for the action gateway. Default: BasicAuthorizationEngine. */
  readonly authorizationEngine?: AuthorizationEngine;
  /** Custom action executor behind the authorization gateway. Default: BasicActionExecutor. */
  readonly actionExecutor?: ActionExecutor;
  /** Additional tools to register. Rejected when they exceed granted access. */
  readonly extraTools?: readonly Tool[];
}

const OWNER = "VECTOR";

/**
 * VECTOR — Authorized execution and operational task specialist.
 *
 * Seventh named specialist agent (ADR-001 composition pattern). VECTOR
 * executes authorized actions and operational tasks per
 * docs/architecture/agents.md:
 *
 * - identity: stable "vector" id, execution role
 * - tools: verification probes by default (date-time, data-lookup,
 *   read-file, list-directory); "execute-shell" requires allowExecute:
 *   true and is always confined to workingRoot with the strict command
 *   allowlist; "write-local" requires allowWrite: true
 * - actions: executeAction() routes ActionRequests through the
 *   AuthorizedActionGateway — deny-by-default authorization in front of
 *   every action, decisions auditable
 * - memory: execution outcomes as scoped episodic memory
 * - audit: tool calls via ToolCallCollector, actions via the gateway
 *
 * Execution power is opt-in, confined, and always authorized — never
 * inherited, never unbounded.
 */
export class VectorAgent {
  private readonly agent: KairosAgent;
  private readonly collector: ToolCallCollector;
  private readonly actionGateway: AuthorizedActionGateway;
  readonly toolRegistry: ToolRegistryType;
  readonly policy: ToolPolicyType;
  readonly toolGateway: ObservedToolGateway;

  constructor(options: VectorAgentOptions = {}) {
    const registry = options.registry ?? new AgentRegistry();
    const identity = registry.register({
      ...(options.agentId === undefined ? {} : { id: options.agentId }),
      name: "vector",
      metadata: {
        role: "execution",
        specialty: "authorized-execution",
        capabilities: [
          "action-execution",
          "operational-tasks",
          "verification",
          "deployment-operations",
        ],
        constraints: [
          "execution gated behind explicit grants",
          "commands confined to working root and allowlist",
          "deny-by-default action authorization",
        ],
      },
    });

    // ── Tools: verification probes by default; execute strictly opt-in ──
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(dateTimeTool);
    toolRegistry.register(dataLookupTool);
    toolRegistry.register(readFileTool);
    toolRegistry.register(listDirectoryTool);
    if (options.allowExecute === true) {
      // Always confined: even a granted execution tool stays inside the
      // working root and the strict command allowlist.
      toolRegistry.register(
        createRunCommandTool({
          workingRoot: options.workingRoot ?? process.cwd(),
        }),
      );
    }
    if (options.allowWrite === true) toolRegistry.register(writeFileTool);

    const grantsWrite = options.allowWrite === true;
    const grantsExecute = options.allowExecute === true;
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
          `VECTOR forbids tool ${tool.definition.id} with capability "${denied[0]}" ` +
            `(write/execute access not granted).`,
        );
      }
      toolRegistry.register(tool);
    }

    const privileged = grantsWrite || grantsExecute;
    const permissions: Array<"public" | "restricted" | "privileged"> = [
      "public",
      "restricted",
    ];
    if (privileged) permissions.push("privileged");

    const policy = new ToolPolicy({
      actorPermissions: permissions,
      maxRisk: grantsExecute ? "high" : "medium",
    });

    const collector = new ToolCallCollector();
    const gateway = new ObservedToolGateway(toolRegistry, policy, collector);
    const memoryStore = options.memoryStore ?? new InMemoryMemoryStore();

    // ── Actions: deny-by-default authorization gateway ──────────────────
    const authorization =
      options.authorizationEngine ?? new BasicAuthorizationEngine();
    const executor = options.actionExecutor ?? new BasicActionExecutor();
    this.actionGateway = new AuthorizedActionGateway(authorization, executor);

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

  /** Stable agent identity (id "vector", execution role metadata). */
  get identity() {
    return this.agent.identity;
  }

  /** VECTOR's isolated memory facade over the (possibly shared) store. */
  get memory() {
    return this.agent.memory;
  }

  /** Runs an execution goal through the cognitive loop. */
  async run(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /** Alias of run() phrased for operational work. */
  async operate(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /**
   * Executes an ActionRequest through the authorization gateway. Blocked
   * decisions are results, not exceptions.
   */
  async executeAction(request: ActionRequest): Promise<ActionResult> {
    return this.actionGateway.execute(this.identity.id, request);
  }

  /**
   * Runs an allowlisted command through VECTOR's own (confined)
   * run-command tool. Blocked when execution is not granted.
   */
  async executeCommand(command: string, cwd?: string): Promise<ToolOutput> {
    return this.toolGateway.execute(this.identity.id, {
      toolId: "kairos.run-command",
      parameters: cwd === undefined ? { command } : { command, cwd },
      requestedBy: this.identity.id,
      requestId: crypto.randomUUID(),
    });
  }

  /** Records an execution outcome as scoped episodic memory. */
  async recordExecution(
    actionId: string,
    status: ActionResult["status"],
    metadata: Readonly<Record<string, unknown>> = {},
  ): Promise<Memory> {
    const summary =
      `VECTOR execution: action ${actionId} — ${status}.`;
    return this.agent.memory.episodic.rememberExperience(summary, {
      source: "vector",
      actionId,
      status,
      ...metadata,
    });
  }

  /** Recalls past execution outcomes. */
  async executionHistory(limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.episodic.recall("VECTOR execution", limit);
  }

  /** Sends a message to another agent over the shared bus. */
  sendToAgent(
    toAgentId: string,
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ) {
    return this.agent.send(toAgentId, content, metadata);
  }

  /** Reads and clears VECTOR's inbox. Returns [] without a bus. */
  receiveMessages() {
    return this.agent.receiveMessages();
  }

  /** Tool calls recorded through the observed gateway since last drain. */
  getToolCalls() {
    return this.collector.drain();
  }
}
