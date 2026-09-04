import { EpisodicMemory } from "./episodic/memory.js";
import { ProceduralMemory } from "./procedural/memory.js";
import { SemanticMemory } from "./semantic/memory.js";
import { WorkingMemory } from "./working/memory.js";
import type {
  Memory,
  MemoryQuery,
  MemoryStore,
} from "./types.js";

export class KairosMemory {
  readonly working: WorkingMemory;
  readonly episodic: EpisodicMemory;
  readonly semantic: SemanticMemory;
  readonly procedural: ProceduralMemory;

  constructor(
    private readonly store: MemoryStore,
  ) {
    this.working = new WorkingMemory(store);
    this.episodic = new EpisodicMemory(store);
    this.semantic = new SemanticMemory(store);
    this.procedural = new ProceduralMemory(store);
  }

  async recall(
    query: MemoryQuery,
  ): Promise<readonly Memory[]> {
    return this.store.retrieve(query);
  }

  async clear(): Promise<void> {
    await this.store.clear();
  }
}
