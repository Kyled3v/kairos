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
import type { ToolDefinition, ToolPolicyDecision } from "../../core/tools/types.js";
import type { Tool } from "../../core/tools/types.js";
import type {
  AuthorizationDecision,
  AuthorizationEngine,
} from "../../security/authorization/types.js";
import type { ActionRequest } from "../../core/action/types.js";

export interface VanguardAgentOptions {
  /** Registry id for this agent. Defaults to the stable "vanguard". */
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
   * Filesystem inspection tools (read-file, list-directory, search-code)
   * for auditing artifacts. Enabled by default.
   */
  readonly allowFilesystemInspection?: boolean;
  /** Custom tool policy used for screening. Default: public+restricted, maxRisk medium. */
  readonly toolPolicy?: ToolPolicyType;
  /**
   * Action names the governance engine allows. Deny-by-default: anything
   * not listed is rejected. Default: the baseline policy's set
   * (create-plan, inspect-state).
   */
  readonly allowedActions?: readonly string[];
  /** Additional read-only tools to register. Write/execute tools are rejected. */
  readonly extraTools?: readonly Tool[];
}

const OWNER = "VANGUARD";

export interface ComplianceReport {
  readonly generatedAt: Date;
  /** Number of tools checked against the policies. */
  readonly checked: number;
  /** Human-readable violation descriptions (tool id + failed policy). */
  readonly violations: readonly string[];
}

/**
 * Deny-by-default authorization engine with a configurable allowlist of
 * action names — VANGUARD's governance instrument.
 */
class GovernanceAuthorizationEngine implements AuthorizationEngine {
  constructor(private readonly allowedActions: ReadonlySet<string>) {}

  async authorize(context: {
    actorId: string;
    action: ActionRequest;
  }): Promise<AuthorizationDecision> {
    const allowed = this.allowedActions.has(context.action.name);
    return {
      allowed,
      reason: allowed
        ? "Action is permitted by the VANGUARD governance policy."
        : `Action "${context.action.name}" is not permitted by the VANGUARD governance policy (deny-by-default).`,
      policyId: "vanguard-governance-deny-by-default-v1",
    };
  }
}

/**
 * VANGUARD — Security, governance and policy enforcement specialist.
 *
 * Eighth named specialist agent (ADR-001 composition pattern). VANGUARD
 * enforces KAIROS's security posture per docs/architecture/agents.md:
 *
 * - identity: stable "vanguard" id, security role
 * - tools: read-only inspection set (read-file, list-directory,
 *   search-code, data-lookup, date-time) — the enforcer itself holds no
 *   mutation power; its authority is judgment and veto, not execution
 * - screening: screenTool() evaluates any ToolDefinition against the
 *   governance policy (risk ceilings, permission floors)
 * - authorization: authorizeAction() runs ActionRequests through a
 *   deny-by-default governance engine with a configurable allowlist
 * - review: complianceReview() batch-checks toolsets against policies
 *   and reports violations
 * - memory: findings as scoped semantic memory, reviews as episodic
 *
 * The enforcer must be the least privileged actor in the system: it can
 * look at everything and change nothing outside its own memory scope.
 */
export class VanguardAgent {
  private readonly agent: KairosAgent;
  private readonly collector: ToolCallCollector;
  private readonly governance: GovernanceAuthorizationEngine;
  readonly toolRegistry: ToolRegistryType;
  readonly policy: ToolPolicyType;
  readonly toolGateway: ObservedToolGateway;

  constructor(options: VanguardAgentOptions = {}) {
    const registry = options.registry ?? new AgentRegistry();
    const identity = registry.register({
      ...(options.agentId === undefined ? {} : { id: options.agentId }),
      name: "vanguard",
      metadata: {
        role: "security",
        specialty: "security-and-governance",
        capabilities: [
          "policy-enforcement",
          "tool-screening",
          "action-authorization",
          "compliance-review",
          "threat-observation",
        ],
        constraints: [
          "read-only tool access",
          "writes findings only to own memory scope",
          "no shell execution",
          "deny-by-default governance",
        ],
      },
    });

    // ── Tools: inspection set, read-only by construction ─────────────────
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(dateTimeTool);
    toolRegistry.register(dataLookupTool);
    if (options.allowFilesystemInspection !== false) {
      toolRegistry.register(readFileTool);
      toolRegistry.register(listDirectoryTool);
      toolRegistry.register(searchCodeTool);
    }
    for (const tool of options.extraTools ?? []) {
      assertNoWriteExecuteCapability(tool, OWNER);
      toolRegistry.register(tool);
    }

    const policy =
      options.toolPolicy ??
      new ToolPolicy({
        actorPermissions: ["public", "restricted"],
        maxRisk: "medium",
      });

    const collector = new ToolCallCollector();
    const gateway = new ObservedToolGateway(toolRegistry, policy, collector);
    const memoryStore = options.memoryStore ?? new InMemoryMemoryStore();

    // ── Governance: deny-by-default action authorization ─────────────────
    this.governance = new GovernanceAuthorizationEngine(
      new Set(
        options.allowedActions ?? ["create-plan", "inspect-state"],
      ),
    );

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

  /** Stable agent identity (id "vanguard", security role metadata). */
  get identity() {
    return this.agent.identity;
  }

  /** VANGUARD's isolated memory facade over the (possibly shared) store. */
  get memory() {
    return this.agent.memory;
  }

  /** Runs a governance goal through the cognitive loop. */
  async run(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /** Alias of run() phrased for security review work. */
  async review(goal: string): Promise<MultiCycleResult> {
    return this.agent.run(goal);
  }

  /**
   * Screens a tool (either a full Tool or a bare ToolDefinition) against
   * the governance policy.
   */
  screenTool(tool: Tool | ToolDefinition): ToolPolicyDecision {
    const definition = "definition" in tool ? tool.definition : tool;
    return this.policy.evaluate(this.identity.id, definition);
  }

  /** Evaluates an ActionRequest against the deny-by-default governance policy. */
  async authorizeAction(request: ActionRequest): Promise<AuthorizationDecision> {
    return this.governance.authorize({
      actorId: this.identity.id,
      action: request,
    });
  }

  /**
   * Batch compliance review: checks every tool definition against every
   * policy and reports which tools violate which policy.
   */
  async complianceReview(input: {
    tools: readonly (Tool | ToolDefinition)[];
    policies: readonly ToolPolicyType[];
  }): Promise<ComplianceReport> {
    const violations: string[] = [];

    for (const tool of input.tools) {
      const definition = "definition" in tool ? tool.definition : tool;
      for (const policy of input.policies) {
        const decision = policy.evaluate(this.identity.id, definition);
        if (!decision.allowed) {
          violations.push(`${definition.id}: ${decision.reason}`);
        }
      }
    }

    const report: ComplianceReport = {
      generatedAt: new Date(),
      checked: input.tools.length,
      violations,
    };

    await this.agent.memory.episodic.rememberExperience(
      `VANGUARD compliance review: ${report.checked} tool(s) checked, ` +
        `${violations.length} violation(s).`,
      { source: "vanguard", checked: report.checked, violationCount: violations.length },
    );

    return report;
  }

  /** Records a security finding as scoped semantic memory. */
  async recordFinding(
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
    importance = 0.95,
  ): Promise<Memory> {
    return this.agent.memory.semantic.rememberFact(
      content,
      { source: "vanguard", kind: "finding", ...metadata },
      importance,
    );
  }

  /** Recalls security findings by query. */
  async findings(query: string, limit = 10): Promise<readonly Memory[]> {
    return this.agent.memory.semantic.recall(query, limit);
  }

  /** Sends a message to another agent over the shared bus. */
  sendToAgent(
    toAgentId: string,
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ) {
    return this.agent.send(toAgentId, content, metadata);
  }

  /** Reads and clears VANGUARD's inbox. Returns [] without a bus. */
  receiveMessages() {
    return this.agent.receiveMessages();
  }

  /** Tool calls recorded through the observed gateway since last drain. */
  getToolCalls() {
    return this.collector.drain();
  }
}
