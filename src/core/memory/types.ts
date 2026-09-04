export const MEMORY_TYPES = [
  "working",
  "episodic",
  "semantic",
  "procedural",
  "autobiographical",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface Memory {
  readonly id: string;
  readonly type: MemoryType;
  readonly content: string;
  readonly importance: number;
  readonly createdAt: Date;
  readonly lastAccessedAt?: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface MemoryQuery {
  readonly query: string;
  readonly type?: MemoryType;
  readonly limit?: number;
}

export interface MemoryStore {
  store(memory: Memory): Promise<Memory>;

  retrieve(query: MemoryQuery): Promise<readonly Memory[]>;

  get(id: string): Promise<Memory | undefined>;

  delete(id: string): Promise<boolean>;

  clear(): Promise<void>;
}
