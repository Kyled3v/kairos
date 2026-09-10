import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Memory, MemoryQuery, MemoryType, PersistentMemoryStore } from "../types.js";

interface SerializedMemory {
  readonly id: string;
  readonly type: MemoryType;
  readonly content: string;
  readonly importance: number;
  readonly createdAt: string;
  readonly lastAccessedAt?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

interface StoreFile {
  readonly version: number;
  readonly memories: readonly SerializedMemory[];
}

// ── Schema versioning ────────────────────────────────────────────
// MIGRATIONS is the extension point for the next on-disk format change.
// It is empty today because version 1 is the only format that has ever
// shipped. A version older than CURRENT_VERSION is migrated forward
// step by step; a version newer than CURRENT_VERSION means this build
// of KAIROS is too old to read the file.
const CURRENT_VERSION = 1;

type MemoryStoreMigration = (data: StoreFile) => StoreFile;

const MIGRATIONS: Record<number, MemoryStoreMigration> = {};

function migrateToCurrent(data: StoreFile): StoreFile {
  if (data.version > CURRENT_VERSION) {
    throw new Error(
      `Memory store version ${data.version} is newer than the supported version ${CURRENT_VERSION}. Upgrade KAIROS to read this file.`,
    );
  }
  let current = data;
  while (current.version < CURRENT_VERSION) {
    const migrate = MIGRATIONS[current.version];
    if (migrate === undefined) {
      throw new Error(`No migration registered to upgrade the memory store from version ${current.version}.`);
    }
    current = migrate(current);
  }
  return current;
}

function serialize(memory: Memory): SerializedMemory {
  const base: SerializedMemory = {
    id: memory.id,
    type: memory.type,
    content: memory.content,
    importance: memory.importance,
    createdAt: memory.createdAt.toISOString(),
    metadata: memory.metadata,
  };
  return memory.lastAccessedAt !== undefined
    ? { ...base, lastAccessedAt: memory.lastAccessedAt.toISOString() }
    : base;
}

function deserialize(s: SerializedMemory): Memory {
  const base: Memory = {
    id: s.id,
    type: s.type,
    content: s.content,
    importance: s.importance,
    createdAt: new Date(s.createdAt),
    metadata: s.metadata,
  };
  return s.lastAccessedAt !== undefined
    ? { ...base, lastAccessedAt: new Date(s.lastAccessedAt) }
    : base;
}

export interface FileMemoryStoreOptions {
  readonly filePath: string;
  readonly writeDebounceMs?: number;
}

export class FileMemoryStore implements PersistentMemoryStore {
  private readonly memories = new Map<string, Memory>();
  private readonly filePath: string;
  private readonly writeDebounceMs: number;
  private writeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: FileMemoryStoreOptions) {
    this.filePath = options.filePath;
    this.writeDebounceMs = options.writeDebounceMs ?? 500;
  }

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as StoreFile;
      const migrated = migrateToCurrent(parsed);
      this.memories.clear();
      for (const s of migrated.memories) {
        const memory = deserialize(s);
        this.memories.set(memory.id, memory);
      }
    } catch (error) {
      throw new Error(
        `Failed to load memory store from ${this.filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async flush(): Promise<void> {
    if (this.writeTimer !== undefined) {
      clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
    }
    await this.writeToDisk();
  }

  async count(): Promise<number> {
    return this.memories.size;
  }

  async store(memory: Memory): Promise<Memory> {
    this.memories.set(memory.id, memory);
    this.scheduleWrite();
    return memory;
  }

  async retrieve(query: MemoryQuery): Promise<readonly Memory[]> {
    const normalizedQuery = query.query.trim().toLowerCase();
    const matches = [...this.memories.values()].filter((memory) => {
      const matchesType = query.type === undefined || memory.type === query.type;
      const matchesContent =
        normalizedQuery.length === 0 ||
        memory.content.toLowerCase().includes(normalizedQuery);
      return matchesType && matchesContent;
    });
    const sorted = matches.sort((a, b) => b.importance - a.importance);
    return query.limit === undefined ? sorted : sorted.slice(0, query.limit);
  }

  async get(id: string): Promise<Memory | undefined> {
    return this.memories.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const deleted = this.memories.delete(id);
    if (deleted) this.scheduleWrite();
    return deleted;
  }

  async clear(): Promise<void> {
    this.memories.clear();
    this.scheduleWrite();
  }

  private scheduleWrite(): void {
    if (this.writeTimer !== undefined) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      void this.writeToDisk();
      this.writeTimer = undefined;
    }, this.writeDebounceMs);
  }

  private async writeToDisk(): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const file: StoreFile = {
      version: CURRENT_VERSION,
      memories: [...this.memories.values()].map(serialize),
    };
    const json = JSON.stringify(file, null, 2);
    const tmp = `${this.filePath}.tmp`;
    // Write to a temp file, then rename over the real path. rename() is
    // atomic on the same filesystem, so a crash mid-write can never leave
    // filePath in a half-written state, and there is no leftover .tmp
    // file afterwards (the previous implementation wrote both files
    // separately, which was neither atomic nor self-cleaning).
    await writeFile(tmp, json, "utf-8");
    await rename(tmp, this.filePath);
  }
}