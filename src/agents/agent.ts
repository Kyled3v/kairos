import { KairosMemory } from "../core/memory/kairos-memory.js";
import { AgentScopedMemoryStore } from "./scoped-memory-store.js";
import type { AgentMessage, AgentMessageBus } from "./message-bus.js";
import type { AgentIdentity } from "./identity.js";
import { createKairos } from "../factory/index.js";
import type { PipelineDependencies } from "../core/orchestrator/pipeline.js";
import type { SessionOrchestratorOptions, SessionOrchestrator } from "../core/orchestrator/session-orchestrator.js";
import type { ExperienceStore } from "../core/experience/record.js";
import type { MemoryStore } from "../core/memory/types.js";
import type { MultiCycleResult } from "../core/orchestrator/types.js";

export interface KairosAgentOptions {
  readonly identity: AgentIdentity;
  readonly dependencies: PipelineDependencies;
  readonly memoryStore: MemoryStore;
  readonly experienceStore?: ExperienceStore;
  readonly session?: SessionOrchestratorOptions;
  readonly messageBus?: AgentMessageBus;
}

/**
 * A named, persistent agent: an identity, its own scoped view over a
 * shared memory store, a session orchestrator to run goals through, and
 * (optionally) a shared message bus for talking to other agents. Each
 * run() is recorded as an experience whose sessionId defaults to this
 * agent's id, so ExperienceQuery.sessionId (and GET /experience?sessionId=)
 * retrieves exactly this agent's history.
 */
export class KairosAgent {
  readonly identity: AgentIdentity;
  readonly memory: KairosMemory;
  private readonly orchestrator: SessionOrchestrator;
  private readonly messageBus: AgentMessageBus | undefined;

  constructor(options: KairosAgentOptions) {
    this.identity = options.identity;
    if (options.identity.id.trim() === "") throw new Error("Agent identity id must not be empty.");
    if (options.identity.id.trim() === "") throw new Error("Agent identity id must not be empty.");
    this.memory = new KairosMemory(
      new AgentScopedMemoryStore(options.memoryStore, options.identity.id),
    );
    this.messageBus = options.messageBus;

    this.orchestrator = createKairos({
      mode: "session",
      dependencies: options.dependencies,
      session: {
        ...(options.session ?? {}),
        sessionId: options.session?.sessionId ?? this.identity.id,
      },
      ...(options.experienceStore !== undefined ? { experienceStore: options.experienceStore } : {}),
    });
  }

  async run(goal: string): Promise<MultiCycleResult> {
    return this.orchestrator.run(goal);
  }

  send(to: string, content: string, metadata: Readonly<Record<string, unknown>> = {}): AgentMessage {
    if (this.messageBus === undefined) {
      throw new Error(`Agent ${this.identity.id} has no message bus configured.`);
    }
    return this.messageBus.send({ from: this.identity.id, to, content, metadata });
  }

  /** Reads and clears this agent's inbox. Returns [] if no bus is configured. */
  receiveMessages(): readonly AgentMessage[] {
    return this.messageBus?.drain(this.identity.id) ?? [];
  }
}
