import type {
  Memory,
  MemoryQuery,
  MemoryStore,
} from "./types.js";

export class InMemoryMemoryStore implements MemoryStore {
  private readonly memories = new Map<string, Memory>();

  async store(memory: Memory): Promise<Memory> {
    this.memories.set(memory.id, memory);

    return memory;
  }

  async retrieve(
    query: MemoryQuery,
  ): Promise<readonly Memory[]> {
    const normalizedQuery = query.query.trim().toLowerCase();

    const matches = [...this.memories.values()].filter(
      (memory) => {
        const matchesType =
          query.type === undefined ||
          memory.type === query.type;

        const matchesContent =
          normalizedQuery.length === 0 ||
          memory.content.toLowerCase().includes(normalizedQuery);

        return matchesType && matchesContent;
      },
    );

    const sorted = matches.sort(
      (a, b) => b.importance - a.importance,
    );

    return query.limit === undefined
      ? sorted
      : sorted.slice(0, query.limit);
  }

  async get(id: string): Promise<Memory | undefined> {
    return this.memories.get(id);
  }

  async delete(id: string): Promise<boolean> {
    return this.memories.delete(id);
  }

  async clear(): Promise<void> {
    this.memories.clear();
  }
}
