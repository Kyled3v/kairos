import type { ExperienceStore, ExperienceQuery } from "./record.js";

export class ExperienceExporter {
  constructor(private readonly store: ExperienceStore) {}

  async exportJsonl(query: ExperienceQuery = {}): Promise<string> {
    const records = await this.store.query(query);
    return records.map((r) => JSON.stringify(r)).join("\n");
  }

  async exportJson(query: ExperienceQuery = {}): Promise<string> {
    const records = await this.store.query(query);
    return JSON.stringify(records, null, 2);
  }
}
