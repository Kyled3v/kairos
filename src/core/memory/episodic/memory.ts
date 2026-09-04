import type {
  Memory,
  MemoryStore,
} from "../types.js";

export class EpisodicMemory {
  constructor(
    private readonly store: MemoryStore,
  ) {}

  async rememberExperience(
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
    importance = 0.8,
  ): Promise<Memory> {
    return this.store.store({
      id: crypto.randomUUID(),
      type: "episodic",
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
      type: "episodic",
      limit,
    });
  }
}
