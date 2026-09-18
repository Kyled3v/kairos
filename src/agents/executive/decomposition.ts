import type { DelegatableAgent } from "../tool-boundary.js";
import { ModelGoalDecomposer } from "../../core/goals/model-decomposer.js";
import type { ModelRouter } from "../../intelligence/models/router.js";

/** One sub-task produced by a decomposition strategy, bound to a worker. */
export interface SmartSubTask {
  readonly id: string;
  readonly goal: string;
  readonly workerId: string;
}

/**
 * Splits an objective into independent work clauses on natural separators:
 * semicolons, newlines, " then ", and numbered list markers ("1." / "2)").
 * Deterministic, no model required. Returns the whole objective as one
 * clause when it contains no separators.
 */
export function splitObjectiveIntoClauses(
  objective: string,
  maxClauses = 6,
): readonly string[] {
  const raw = objective
    .split(/\r?\n|;|(?:^|\s)then\s+/gi)
    .map((part) =>
      part
        .replace(/^\s*\d+[.)]\s*/, "")
        .replace(/^(?:then|and)\s+/i, "")
        .trim(),
    )
    .filter((part) => part.length > 0);

  if (raw.length === 0) return [objective.trim()];
  return raw.slice(0, Math.max(1, maxClauses));
}

/**
 * Keyword → agent-role routing table. Order matters: first role whose
 * keywords match the clause wins. Roles are matched against the worker's
 * identity.metadata.role.
 */
const ROLE_KEYWORDS: readonly { role: string; keywords: readonly string[] }[] = [
  {
    role: "research",
    keywords: [
      "research", "investigate", "analyse", "analyze", "explore", "discover",
      "find", "map", "examine", "inspect", "study", "survey", "look", "understand",
    ],
  },
  {
    role: "engineering",
    keywords: [
      "implement", "build", "fix", "code", "refactor", "write code", "develop",
      "construct", "engineer", "patch", "migrate", "test", "debug",
    ],
  },
  {
    role: "creation",
    keywords: [
      "create", "design", "draft", "compose", "generate", "write", "produce",
      "synthesise", "synthesize", "author",
    ],
  },
  {
    role: "knowledge",
    keywords: [
      "document", "archive", "organise", "organize", "index", "categorise",
      "categorize", "summarise", "summarize", "recall", "retrieve",
    ],
  },
  {
    role: "observation",
    keywords: [
      "monitor", "watch", "observe", "track", "measure", "check status",
      "health", "alert",
    ],
  },
  {
    role: "security",
    keywords: [
      "audit", "review permissions", "vulnerability", "threat", "policy",
      "compliance", "secure",
    ],
  },
  {
    role: "execution",
    keywords: [
      "execute", "run", "deploy", "release", "operate", "operate",
      "rollout", "provision",
    ],
  },
];

const EXECUTIVE_ROLES: ReadonlySet<string> = new Set(["executive"]);

function normalize(text: string): string {
  return text.toLowerCase();
}

function roleOf(agent: DelegatableAgent): string {
  const role = agent.identity.metadata["role"];
  return typeof role === "string" ? role : "";
}

function matchingRole(clause: string): string | undefined {
  const text = normalize(clause);
  for (const entry of ROLE_KEYWORDS) {
    for (const keyword of entry.keywords) {
      if (text.includes(keyword)) return entry.role;
    }
  }
  return undefined;
}

/**
 * Shared clause → worker router used by both the smart and model
 * strategies: round-robin per role bucket, executive roles excluded.
 */
class ClauseRouter {
  private readonly eligible: readonly DelegatableAgent[];
  private readonly cursors = new Map<string, number>();

  constructor(workers: readonly DelegatableAgent[]) {
    this.eligible = workers.filter((w) => !EXECUTIVE_ROLES.has(roleOf(w)));
  }

  get hasEligibleWorkers(): boolean {
    return this.eligible.length > 0;
  }

  nextWorkerFor(role: string | undefined): DelegatableAgent | undefined {
    const pool =
      role !== undefined
        ? this.eligible.filter((w) => roleOf(w) === role)
        : this.eligible;
    if (pool.length === 0) return undefined;

    const key = role ?? "__all__";
    const cursor = this.cursors.get(key) ?? 0;
    this.cursors.set(key, cursor + 1);
    return pool[cursor % pool.length];
  }

  /** Routes one clause: role match first, then any eligible worker. */
  route(clause: string, prefix: string, index: number): SmartSubTask | undefined {
    const role = matchingRole(clause);
    const worker =
      this.nextWorkerFor(role) ?? (role !== undefined ? this.nextWorkerFor(undefined) : undefined);
    if (worker === undefined) return undefined;

    return {
      id: `${prefix}-${index}-${worker.identity.id}`,
      goal: clause,
      workerId: worker.identity.id,
    };
  }
}

export interface SmartStrategyOptions {
  /** Maximum clauses an objective is split into. Default 6. */
  readonly maxClauses?: number;
}

/**
 * Builds a deterministic decomposition strategy from a set of registered
 * workers — the default for AtlasAgent.orchestrate() so callers do not
 * need to supply their own strategy function.
 *
 * Routing, per clause:
 * 1. Split the objective into clauses (splitObjectiveIntoClauses).
 * 2. Match each clause against ROLE_KEYWORDS and route to the next
 *    eligible worker (round-robin) whose identity.metadata.role matches.
 * 3. If no role matches, round-robin across all eligible workers.
 *
 * Executive-role agents are never routed work — ATLAS coordinates, it does
 * not delegate to itself. With no eligible workers the plan is empty (the
 * orchestration completes with status "empty" instead of failing).
 */
export function createSmartStrategy(
  workers: readonly DelegatableAgent[],
  options: SmartStrategyOptions = {},
): (objective: string) => readonly SmartSubTask[] {
  const maxClauses = options.maxClauses ?? 6;
  const router = new ClauseRouter(workers);

  return (objective: string): readonly SmartSubTask[] => {
    const clauses = splitObjectiveIntoClauses(objective, maxClauses);
    const tasks: SmartSubTask[] = [];

    for (const clause of clauses) {
      const task = router.route(clause, "smart", tasks.length + 1);
      if (task === undefined) break;
      tasks.push(task);
    }

    return tasks;
  };
}

function isDecomposerFallback(
  descriptions: readonly string[],
  objective: string,
): boolean {
  return (
    descriptions.length === 3 &&
    descriptions[0] === `Understand: ${objective}` &&
    descriptions[1] === `Plan: ${objective}` &&
    descriptions[2] === `Execute: ${objective}`
  );
}

export interface ModelStrategyOptions extends SmartStrategyOptions {
  readonly router: ModelRouter;
  readonly providerId: string;
  readonly modelId: string;
  /** Maximum sub-goals the model may propose. Default 5. */
  readonly maxSubGoals?: number;
}

/**
 * Builds a model-backed decomposition strategy: ModelGoalDecomposer
 * proposes ordered sub-goal descriptions, then each is routed to an
 * eligible worker via the same deterministic role router the smart
 * strategy uses (so worker selection stays auditable and reproducible).
 *
 * If the model call fails, returns invalid output, or the model is not
 * configured, the strategy transparently falls back to the deterministic
 * smart strategy — orchestration never blocks on model availability.
 */
export function createModelStrategy(
  workers: readonly DelegatableAgent[],
  options: ModelStrategyOptions,
): (objective: string) => Promise<readonly SmartSubTask[]> {
  const maxClauses = options.maxClauses ?? 6;
  const fallback = createSmartStrategy(workers, { maxClauses });
  const router = new ClauseRouter(workers);
  const decomposer = new ModelGoalDecomposer({
    router: options.router,
    providerId: options.providerId,
    modelId: options.modelId,
    ...(options.maxSubGoals !== undefined ? { maxSubGoals: options.maxSubGoals } : {}),
  });

  return async (objective: string): Promise<readonly SmartSubTask[]> => {
    if (!router.hasEligibleWorkers) return [];

    try {
      const goalId = crypto.randomUUID();
      const decomposition = await decomposer.decompose({
        id: goalId,
        description: objective,
        priority: 1,
        createdAt: new Date(),
      });

      const descriptions = decomposition.subGoals
        .slice(0, maxClauses)
        .map((sg) => sg.description)
        .filter((d) => typeof d === "string" && d.trim().length > 0);

      // ModelGoalDecomposer swallows model failures internally and returns
      // a generic Understand/Plan/Execute template instead of throwing.
      // Treat that template as "model unavailable" and use the smart
      // strategy so the plan stays clause-faithful to the objective.
      if (
        descriptions.length === 0 ||
        isDecomposerFallback(descriptions, objective)
      ) {
        return fallback(objective);
      }

      const tasks: SmartSubTask[] = [];
      for (const clause of descriptions) {
        const task = router.route(clause, "model", tasks.length + 1);
        if (task === undefined) break;
        tasks.push(task);
      }
      return tasks.length > 0 ? tasks : fallback(objective);
    } catch {
      // Model unavailable or invalid output — deterministic fallback.
      return fallback(objective);
    }
  };
}
