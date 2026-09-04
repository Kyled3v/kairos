import type {
  Memory,
  MemoryStore,
} from "../types.js";

export class ProceduralMemory {
  constructor(
    private readonly store: MemoryStore,
  ) {}

  async rememberProcedure(
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
    importance = 0.85,
  ): Promise<Memory> {
    return this.store.store({
      id: crypto.randomUUID(),
      type: "procedural",
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
      type: "procedural",
      limit,
    });
  }
}
