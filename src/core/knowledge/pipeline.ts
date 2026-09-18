import type { Memory, MemoryStore } from "../memory/types.js";

/**
 * One source document offered to the knowledge pipeline.
 */
export interface KnowledgeSource {
  /** Where the content came from (URL, path, or logical name). */
  readonly source: string;
  readonly content: string;
}

export interface SourceValidationDecision {
  readonly valid: boolean;
  readonly reasons: readonly string[];
}

export interface SourceValidationOptions {
  /**
   * When set, only sources on these domains (or non-URL logical names)
   * are trusted. URLs whose host is not in the list are rejected.
   */
  readonly trustedDomains?: readonly string[];
  /** Minimum content length for a document to be worth ingesting. */
  readonly minContentLength?: number;
}

/**
 * Prompt-injection patterns that must never enter the knowledge base:
 * content is data, not instructions.
 */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore (?:all )?previous instructions/i,
  /disregard (?:all )?(?:your |the )?instructions/i,
  /reveal (?:all )?(?:your |the )?(?:secrets?|system prompt)/i,
  /you are now(?: in)? (?:developer|admin|god) mode/i,
];

/**
 * The default, deterministic source validator:
 * 1. non-empty, minimum-length content
 * 2. trusted-domain enforcement when a trust list is configured
 * 3. prompt-injection pattern rejection
 */
export class BasicSourceValidator {
  private readonly options: SourceValidationOptions;

  constructor(options: SourceValidationOptions = {}) {
    this.options = options;
  }

  async validate(
    source: KnowledgeSource,
  ): Promise<SourceValidationDecision> {
    const reasons: string[] = [];
    const minLength = this.options.minContentLength ?? 20;

    if (source.content.trim().length === 0) {
      reasons.push("content is empty");
    } else if (source.content.length < minLength) {
      reasons.push(`content shorter than ${minLength} characters`);
    }

    if (this.options.trustedDomains !== undefined) {
      if (!this.isTrusted(source.source)) {
        reasons.push(`source domain is untrusted: ${source.source}`);
      }
    }

    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(source.content)) {
        reasons.push("content matches a prompt-injection pattern");
        break;
      }
    }

    return { valid: reasons.length === 0, reasons };
  }

  private isTrusted(source: string): boolean {
    const trusted = this.options.trustedDomains ?? [];
    try {
      const url = new URL(source);
      return trusted.some(
        (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      );
    } catch {
      // Not a URL — logical names (file paths, ids) are treated as trusted
      // internal references only when they are non-empty.
      return trusted.some((domain) => source.includes(domain)) || source.trim().length > 0;
    }
  }
}

export interface KnowledgeIngestion {
  readonly topic: string;
  readonly source: string;
  readonly content: string;
  /** Importance for the stored semantic memory. Default 0.85. */
  readonly importance?: number;
}

export interface KnowledgeRetrievalQuery {
  readonly query: string;
  /** Restrict results to one topic. */
  readonly topic?: string;
  readonly limit?: number;
}

export interface KnowledgePipelineOptions {
  readonly memoryStore: MemoryStore;
  /** Custom validator. Default: BasicSourceValidator with default rules. */
  readonly validator?: { validate(source: KnowledgeSource): Promise<SourceValidationDecision> };
  /**
   * When set, ingested memories are tagged with metadata.agentId so they
   * land inside that agent's scoped view (AgentScopedMemoryStore filters
   * by this key). Use this to feed a named specialist's knowledge scope,
   * e.g. ownerAgentId: "sage". Unset memories are unscoped (visible to
   * raw-store consumers, invisible to any scoped agent).
   */
  readonly ownerAgentId?: string;
}

/**
 * The knowledge pipeline — validating ingestion, deduplicating storage
 * and ranked retrieval over the memory system (Phase 2 remainder:
 * knowledge ingestion, retrieval, source validation).
 *
 * Ingested documents become semantic memories tagged with their source
 * and topic; every ingestion records an episodic history entry. Content
 * that fails source validation never enters the store, and identical
 * content is stored once regardless of how often it is re-offered.
 */
export class KnowledgePipeline {
  private readonly store: MemoryStore;
  private readonly validator: { validate(source: KnowledgeSource): Promise<SourceValidationDecision> };
  private readonly ownerAgentId: string | undefined;

  constructor(options: KnowledgePipelineOptions) {
    this.store = options.memoryStore;
    this.validator = options.validator ?? new BasicSourceValidator();
    this.ownerAgentId = options.ownerAgentId;
  }

  /**
   * Validates and ingests one document. Throws when validation fails —
   * callers should never store unvetted knowledge. Returns the stored
   * memories (empty when the content was a duplicate).
   */
  async ingest(document: KnowledgeIngestion): Promise<readonly Memory[]> {
    const decision = await this.validator.validate({
      source: document.source,
      content: document.content,
    });
    if (!decision.valid) {
      throw new Error(
        `Knowledge ingestion rejected — source validation failed: ${decision.reasons.join("; ")}`,
      );
    }

    const duplicate = await this.store.retrieve({
      query: document.content,
      type: "semantic",
      limit: 5,
    });
    const isDuplicate = duplicate.some(
      (memory) =>
        memory.content.trim().toLowerCase() ===
        document.content.trim().toLowerCase(),
    );
    if (isDuplicate) return [];

    const stored = await this.store.store({
      id: crypto.randomUUID(),
      type: "semantic",
      content: document.content,
      importance: clampImportance(document.importance ?? 0.85),
      createdAt: new Date(),
      metadata: {
        source: document.source,
        origin: document.source,
        topic: document.topic,
        ...(this.ownerAgentId !== undefined ? { agentId: this.ownerAgentId } : {}),
      },
    });

    await this.store.store({
      id: crypto.randomUUID(),
      type: "episodic",
      content: `Knowledge ingest under topic "${document.topic}" from ${document.source}.`,
      importance: 0.6,
      createdAt: new Date(),
      metadata: {
        source: "knowledge-pipeline",
        topic: document.topic,
        origin: document.source,
        ...(this.ownerAgentId !== undefined ? { agentId: this.ownerAgentId } : {}),
      },
    });

    return [stored];
  }

  /**
   * Retrieves knowledge by query. Results come back importance-ranked
   * (the store's contract); an optional topic filter narrows them.
   */
  async retrieve(query: KnowledgeRetrievalQuery): Promise<readonly Memory[]> {
    const results = await this.store.retrieve({
      query: query.query,
      type: "semantic",
      ...(query.limit !== undefined ? { limit: query.limit * 2 } : {}),
    });
    const filtered = query.topic === undefined
      ? results
      : results.filter((memory) => memory.metadata.topic === query.topic);
    return query.limit === undefined
      ? filtered
      : filtered.slice(0, query.limit);
  }

  /** Recalls episodic ingestion history, optionally per topic. */
  async ingestionHistory(topic?: string, limit = 10): Promise<readonly Memory[]> {
    const results = await this.store.retrieve({
      query: topic === undefined ? "Knowledge ingest" : `Knowledge ingest under topic "${topic}"`,
      type: "episodic",
      limit,
    });
    return topic === undefined
      ? results
      : results.filter((memory) => memory.metadata.topic === topic);
  }
}

function clampImportance(value: number): number {
  return Math.max(0, Math.min(1, value));
}
