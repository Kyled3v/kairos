import type { Memory, MemoryQuery, MemoryStore } from "../core/memory/types.js";

const AGENT_ID_KEY = "agentId";

/**
 * Wraps a MemoryStore so a given agent only ever sees its own memories.
 * Scoping is done by tagging metadata.agentId on write and filtering on
 * every read/delete/clear — this works with any existing MemoryStore
 * implementation (in-memory or file-backed) without changing the Memory
 * type or the underlying store's own persistence format.
 */
export class AgentScopedMemoryStore implements MemoryStore {
  constructor(
    private readonly inner: MemoryStore,
    private readonly agentId: string,
  ) {}

  private isMine(memory: Memory): boolean {
    return memory.metadata[AGENT_ID_KEY] === this.agentId;
  }

  async store(memory: Memory): Promise<Memory> {
    const scoped: Memory = {
      ...memory,
      metadata: { ...memory.metadata, [AGENT_ID_KEY]: this.agentId },
    };
    return this.inner.store(scoped);
  }

  async retrieve(query: MemoryQuery): Promise<readonly Memory[]> {
    const results = await this.inner.retrieve(query);
    return results.filter((memory) => this.isMine(memory));
  }

  async get(id: string): Promise<Memory | undefined> {
    const memory = await this.inner.get(id);
    return memory !== undefined && this.isMine(memory) ? memory : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const memory = await this.inner.get(id);
    if (memory === undefined || !this.isMine(memory)) return false;
    return this.inner.delete(id);
  }

  async clear(): Promise<void> {
    const mine = await this.retrieve({ query: "" });
    for (const memory of mine) {
      await this.inner.delete(memory.id);
    }
  }
}