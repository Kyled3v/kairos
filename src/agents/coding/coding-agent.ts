import { KairosAgent } from "../agent.js";
import { AgentRegistry } from "../identity.js";
import { ToolRegistry } from "../../core/tools/registry.js";
import { ToolPolicy } from "../../core/tools/policy.js";
import { ObservedToolGateway } from "../../core/tools/observed-gateway.js";
import { ToolCallCollector } from "../../core/tools/collector.js";
import { InMemoryMemoryStore } from "../../core/memory/in-memory-store.js";
import { createPipelineDependencies } from "../../factory/pipeline-dependencies.js";
import { createKairos } from "../../factory/index.js";
import { readFileTool } from "../../core/tools/built-in/read-file.js";
import { writeFileTool } from "../../core/tools/built-in/write-file.js";
import { listDirectoryTool } from "../../core/tools/built-in/list-directory.js";
import { searchCodeTool } from "../../core/tools/built-in/search-code.js";
import { runCommandTool } from "../../core/tools/built-in/run-command.js";
import { calculatorTool } from "../../core/tools/built-in/calculator.js";
import { dateTimeTool } from "../../core/tools/built-in/date-time.js";
import type { ModelRouter } from "../../intelligence/models/router.js";
import type { ExperienceStore } from "../../core/experience/record.js";
import type { MultiCycleResult } from "../../core/orchestrator/types.js";
import type { RepositoryContext } from "./repository-context.js";
import { buildContextSummary } from "./repository-context.js";
import type { SessionOrchestratorOptions } from "../../core/orchestrator/session-orchestrator.js";

export interface CodingAgentOptions {
  readonly name?: string;
  readonly workspacePath?: string;
  readonly router?: ModelRouter;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly experienceStore?: ExperienceStore;
  readonly session?: SessionOrchestratorOptions;
  readonly allowWrite?: boolean;
  readonly allowRunCommand?: boolean;
  readonly streaming?: boolean;
  readonly onDelta?: (stage: string, delta: string) => void;
}

export interface CodingTask {
  readonly goal: string;
  readonly context?: RepositoryContext;
  readonly additionalContext?: string;
}

export class CodingAgent {
  private readonly agent: KairosAgent;
  private readonly collector: ToolCallCollector;
  readonly workspacePath: string | undefined;

  constructor(options: CodingAgentOptions = {}) {
    const registry = new AgentRegistry();
    const identity = registry.register({
      name: options.name ?? "kairos-coder",
      metadata: { role: "coding-agent", workspacePath: options.workspacePath },
    });

    const toolRegistry = new ToolRegistry();
    toolRegistry.register(calculatorTool);
    toolRegistry.register(dateTimeTool);
    toolRegistry.register(listDirectoryTool);
    toolRegistry.register(searchCodeTool);
    toolRegistry.register(readFileTool);
    if (options.allowWrite === true) toolRegistry.register(writeFileTool);
    if (options.allowRunCommand === true) toolRegistry.register(runCommandTool);

    const permissions: Array<"public" | "restricted" | "privileged"> = ["public", "restricted"];
    if (options.allowWrite === true || options.allowRunCommand === true) permissions.push("privileged");

    const policy = new ToolPolicy({
      actorPermissions: permissions,
      maxRisk: options.allowRunCommand === true ? "high" : "medium",
    });

    this.collector = new ToolCallCollector();
    const gateway = new ObservedToolGateway(toolRegistry, policy, this.collector);
    const memoryStore = new InMemoryMemoryStore();

    let dependencies;
    if (
      options.router !== undefined &&
      options.providerId !== undefined &&
      options.modelId !== undefined
    ) {
      // Build streaming options only when values are actually present
      const streamingOpts =
        options.streaming === true || options.onDelta !== undefined
          ? {
              streaming: {
                ...(options.streaming === true ? { streaming: true as const } : {}),
                ...(options.onDelta !== undefined ? { onDelta: options.onDelta } : {}),
              },
            }
          : {};

      dependencies = createPipelineDependencies({
        mode: "model",
        router: options.router,
        providerId: options.providerId,
        modelId: options.modelId,
        toolGateway: gateway,
        toolRegistry,
        ...streamingOpts,
      });
    } else {
      dependencies = createPipelineDependencies({
        mode: "basic",
        toolGateway: gateway,
        toolRegistry,
      });
    }

    const orchestrator = createKairos({
      mode: "session",
      dependencies,
      session: { sessionId: identity.id, ...(options.session ?? {}) },
      ...(options.experienceStore !== undefined ? { experienceStore: options.experienceStore } : {}),
      toolCallCollector: this.collector,
    });

    this.agent = new KairosAgent({
      identity,
      dependencies,
      memoryStore,
      ...(options.experienceStore !== undefined ? { experienceStore: options.experienceStore } : {}),
      session: { sessionId: identity.id, ...(options.session ?? {}) },
    });

    this.workspacePath = options.workspacePath;
    (this.agent as unknown as { orchestrator: typeof orchestrator }).orchestrator = orchestrator;
  }

  async run(task: CodingTask): Promise<MultiCycleResult> {
    let fullGoal = task.goal;
    if (task.context !== undefined) {
      const summary = await buildContextSummary(task.context);
      fullGoal = `${task.goal}\n\nRepository context:\n${summary}`;
    }
    if (task.additionalContext !== undefined) {
      fullGoal = `${fullGoal}\n\nAdditional context:\n${task.additionalContext}`;
    }
    return this.agent.run(fullGoal);
  }

  getToolCalls() {
    return this.collector.drain();
  }
}
