import type {
  Memory,
  MemoryStore,
} from "../types.js";

export class SemanticMemory {
  constructor(
    private readonly store: MemoryStore,
  ) {}

  async rememberFact(
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
    importance = 0.9,
  ): Promise<Memory> {
    return this.store.store({
      id: crypto.randomUUID(),
      type: "semantic",
      content,
      importance: Math.max(0, Math.min(1, importance)),
      createdAt: new Date(),
      metadata,
    });
  }

  async recall(
    query: string,
    limit = 10,
  ): Promise<readonly Memory[]> {
    return this.store.retrieve({
      query,
      type: "semantic",
      limit,
    });
  }
}
