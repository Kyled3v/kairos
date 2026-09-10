import type { ExperienceStore, ExperienceQuery, ExperienceRecord } from "./record.js";

export interface ExperienceMetrics {
  readonly totalSessions: number;
  readonly successRate: number;
  readonly averageCyclesToCompletion: number;
  readonly terminationReasonDistribution: Readonly<Record<string, number>>;
  readonly toolSelectionFrequency: Readonly<Record<string, number>>;
  readonly modelPerformanceByProvider: Readonly<Record<string, { sessions: number; successRate: number }>>;
}

export class ExperienceAnalyser {
  constructor(private readonly store: ExperienceStore) {}

  async analyse(query: ExperienceQuery = {}): Promise<ExperienceMetrics> {
    const records = await this.store.query(query);
    const total = records.length;

    if (total === 0) {
      return {
        totalSessions: 0,
        successRate: 0,
        averageCyclesToCompletion: 0,
        terminationReasonDistribution: {},
        toolSelectionFrequency: {},
        modelPerformanceByProvider: {},
      };
    }

    const successes = records.filter((r) => r.outcome === "success").length;
    const successRate = successes / total;

    const totalCycles = records.reduce((sum, r) => sum + r.totalCycles, 0);
    const averageCyclesToCompletion = totalCycles / total;

    const terminationReasonDistribution: Record<string, number> = {};
    for (const r of records) {
      const reason = this.getTerminationReason(r);
      terminationReasonDistribution[reason] = (terminationReasonDistribution[reason] ?? 0) + 1;
    }

    const toolSelectionFrequency: Record<string, number> = {};
    for (const r of records) {
      for (const tc of r.toolCalls) {
        toolSelectionFrequency[tc.toolId] = (toolSelectionFrequency[tc.toolId] ?? 0) + 1;
      }
    }

    const providerMap: Record<string, { sessions: number; successes: number }> = {};
    for (const r of records) {
      if (r.modelProvider !== undefined) {
        const p = providerMap[r.modelProvider] ?? { sessions: 0, successes: 0 };
        p.sessions += 1;
        if (r.outcome === "success") p.successes += 1;
        providerMap[r.modelProvider] = p;
      }
    }
    const modelPerformanceByProvider: Record<string, { sessions: number; successRate: number }> = {};
    for (const [provider, data] of Object.entries(providerMap)) {
      modelPerformanceByProvider[provider] = { sessions: data.sessions, successRate: data.sessions > 0 ? data.successes / data.sessions : 0 };
    }

    return { totalSessions: total, successRate, averageCyclesToCompletion, terminationReasonDistribution, toolSelectionFrequency, modelPerformanceByProvider };
  }

  private getTerminationReason(record: ExperienceRecord): string {
    // ExperienceRecord does not store terminationReason directly — infer from outcome
    const meta = record.metadata as Record<string, unknown>;
    if (typeof meta["terminationReason"] === "string") return meta["terminationReason"];
    return record.outcome;
  }
}
