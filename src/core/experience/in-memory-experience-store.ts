import type { ExperienceRecord, ExperienceQuery, ExperienceStore } from "./record.js";

export class InMemoryExperienceStore implements ExperienceStore {
  private readonly records = new Map<string, ExperienceRecord>();

  async save(record: ExperienceRecord): Promise<ExperienceRecord> {
    this.records.set(record.id, record);
    return record;
  }

  async get(id: string): Promise<ExperienceRecord | undefined> {
    return this.records.get(id);
  }

  async query(filter: ExperienceQuery): Promise<readonly ExperienceRecord[]> {
    let results = [...this.records.values()];
    if (filter.outcome !== undefined) {
      results = results.filter((r) => r.outcome === filter.outcome);
    }
    if (filter.goalContains !== undefined) {
      const needle = filter.goalContains.toLowerCase();
      results = results.filter((r) => r.goal.toLowerCase().includes(needle));
    }
    if (filter.modelProvider !== undefined) {
      results = results.filter((r) => r.modelProvider === filter.modelProvider);
    }
    if (filter.sessionId !== undefined) {
      results = results.filter((r) => r.sessionId === filter.sessionId);
    }
    if (filter.since !== undefined) {
      const since = filter.since;
      results = results.filter((r) => r.startedAt >= since);
    }
    results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return filter.limit !== undefined ? results.slice(0, filter.limit) : results;
  }

  async count(): Promise<number> {
    return this.records.size;
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}