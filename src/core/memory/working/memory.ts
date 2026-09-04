import type {
  Memory,
  MemoryQuery,
  MemoryStore,
} from "../types.js";

export class WorkingMemory {
  constructor(
    private readonly store: MemoryStore,
  ) {}

  async remember(
    content: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ): Promise<Memory> {
    return this.store.store({
      id: crypto.randomUUID(),
      type: "working",
      content,
      importance: 1,
      createdAt: new Date(),
      metadata,
    });
  }

  async recall(
    query: string,
    limit = 10,
  ): Promise<readonly Memory[]> {
    const request: MemoryQuery = {
      query,
      type: "working",
      limit,
    };

    return this.store.retrieve(request);
  }
}
