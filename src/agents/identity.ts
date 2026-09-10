export interface AgentIdentity {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CreateAgentOptions {
  readonly id?: string;
  readonly name: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * In-memory registry of agent identities. An agent's identity is stable
 * for its lifetime (id, name, creation time); it does not carry runtime
 * state — that lives on the KairosAgent instance built around it.
 */
export class AgentRegistry {
  private readonly agents = new Map<string, AgentIdentity>();

  register(options: CreateAgentOptions): AgentIdentity {
    const id = options.id ?? crypto.randomUUID();

    if (this.agents.has(id)) {
      throw new Error(`Agent already registered: ${id}`);
    }

    const identity: AgentIdentity = {
      id,
      name: options.name,
      createdAt: new Date(),
      metadata: options.metadata ?? {},
    };

    this.agents.set(id, identity);
    return identity;
  }

  get(id: string): AgentIdentity | undefined {
    return this.agents.get(id);
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  list(): readonly AgentIdentity[] {
    return [...this.agents.values()];
  }

  unregister(id: string): boolean {
    return this.agents.delete(id);
  }
}