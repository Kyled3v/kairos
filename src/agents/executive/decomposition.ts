import type { DelegatableAgent } from "../tool-boundary.js";

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

export interface SmartStrategyOptions {
  /** Maximum clauses an objective is split into. Default 6. */
  readonly maxClauses?: number;
}

/**
 * Builds a deterministic decomposition strategy from a set of registered
 * workers — the "smart" default for AtlasAgent.orchestrate() so callers do
 * not need to supply their own strategy function.
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
  const eligible = workers.filter((w) => !EXECUTIVE_ROLES.has(roleOf(w)));

  // One rotation cursor per role bucket so repeated objectives distribute
  // deterministically across same-role workers.
  const cursors = new Map<string, number>();

  function nextWorkerFor(role: string | undefined): DelegatableAgent | undefined {
    const pool =
      role !== undefined
        ? eligible.filter((w) => roleOf(w) === role)
        : eligible;
    if (pool.length === 0) return undefined;

    const key = role ?? "__all__";
    const cursor = cursors.get(key) ?? 0;
    cursors.set(key, cursor + 1);
    return pool[cursor % pool.length];
  }

  return (objective: string): readonly SmartSubTask[] => {
    const clauses = splitObjectiveIntoClauses(objective, maxClauses);
    const tasks: SmartSubTask[] = [];

    for (const clause of clauses) {
      const role = matchingRole(clause);
      const worker =
        nextWorkerFor(role) ?? (role !== undefined ? nextWorkerFor(undefined) : undefined);
      if (worker === undefined) break;

      tasks.push({
        id: `smart-${tasks.length + 1}-${worker.identity.id}`,
        goal: clause,
        workerId: worker.identity.id,
      });
    }

    return tasks;
  };
}
