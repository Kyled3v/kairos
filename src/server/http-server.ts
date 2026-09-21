import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { PipelineDependencies } from "../core/orchestrator/pipeline.js";
import type { ExperienceStore, ExperienceQuery, ExperienceOutcome } from "../core/experience/record.js";
import type { KairosMemory } from "../core/memory/kairos-memory.js";
import { MEMORY_TYPES, type MemoryType } from "../core/memory/types.js";
import { createKairos } from "../factory/index.js";
import { AuthMiddleware } from "./auth.js";
import { withSpan } from "../telemetry/index.js";
import { ExperienceAnalyser } from "../core/experience/analyser.js";
import { AccountRegistry, type Account } from "../accounts/accounts.js";
import { AgentRegistry } from "../agents/identity.js";
import { KairosAgent } from "../agents/agent.js";
import { InMemoryMemoryStore } from "../core/memory/in-memory-store.js";
import type { MemoryStore } from "../core/memory/types.js";

export interface KairosServerOptions {
  readonly dependencies: PipelineDependencies;
  readonly experienceStore: ExperienceStore;
  readonly memory: KairosMemory;
  readonly defaultMaxCycles?: number;
  readonly apiToken?: string;
  readonly requestsPerMinute?: number;
  /**
   * Account registry enabling Phase 4 public agent creation. When set,
   * POST /agents creates agents under accounts (bearer-token auth) and
   * GET /agents lists the caller's agents. Public agents run goals via
   * POST /agents/:id/run under the account's quota.
   */
  readonly accounts?: AccountRegistry;
  /**
   * Backing store for public agents' memory. KairosAgent wraps this in
   * AgentScopedMemoryStore, so each public agent's memory is isolated by
   * its agent id. Defaults to an in-memory store per agent.
   */
  readonly publicAgentMemoryStore?: MemoryStore;
}
// 1 MB is plenty for a goal string plus a few options; guards against an
// unbounded request body being buffered fully into memory.
const MAX_BODY_BYTES = 1_000_000;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(json);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body too large.");
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) return {};

  const raw = Buffer.concat(chunks).toString("utf-8");
  if (raw.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("Invalid JSON body: " + (error instanceof Error ? error.message : String(error)));
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function isExperienceOutcome(value: string): value is ExperienceOutcome {
  return value === "success" || value === "failure" || value === "partial" || value === "unknown";
}

function isMemoryType(value: string): value is MemoryType {
  return (MEMORY_TYPES as readonly string[]).includes(value);
}

async function handleRun(
  req: IncomingMessage,
  res: ServerResponse,
  options: KairosServerOptions,
): Promise<void> {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid request body." });
    return;
  }

  const goal = body["goal"];
  if (typeof goal !== "string" || goal.trim() === "") {
    sendJson(res, 400, { error: '"goal" is required and must be a non-empty string.' });
    return;
  }

  const maxCyclesRaw = body["maxCycles"];
  const maxCycles =
    typeof maxCyclesRaw === "number" && Number.isInteger(maxCyclesRaw) && maxCyclesRaw > 0
      ? maxCyclesRaw
      : options.defaultMaxCycles ?? 10;

  const decompose = body["decompose"] === true;
  const sessionIdRaw = body["sessionId"];
  const sessionId =
    typeof sessionIdRaw === "string" && sessionIdRaw.trim() !== "" ? sessionIdRaw : crypto.randomUUID();

  try {
    const orchestrator = createKairos({
      mode: "session",
      dependencies: options.dependencies,
      session: { maxCycles, sessionId },
      experienceStore: options.experienceStore,
      decompose,
    });

    const result = await orchestrator.run(goal);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, {
      error: "Failed to run KAIROS session: " + (error instanceof Error ? error.message : String(error)),
    });
  }
}

async function handleListExperience(
  url: URL,
  res: ServerResponse,
  options: KairosServerOptions,
): Promise<void> {
  const query: {
    outcome?: ExperienceOutcome;
    goalContains?: string;
    modelProvider?: string;
    sessionId?: string;
    since?: Date;
    limit?: number;
  } = {};

  const outcomeParam = url.searchParams.get("outcome");
  if (outcomeParam !== null) {
    if (!isExperienceOutcome(outcomeParam)) {
      sendJson(res, 400, { error: `Invalid outcome: ${outcomeParam}` });
      return;
    }
    query.outcome = outcomeParam;
  }

  const goalContainsParam = url.searchParams.get("goalContains");
  if (goalContainsParam !== null) query.goalContains = goalContainsParam;

  const modelProviderParam = url.searchParams.get("modelProvider");
  if (modelProviderParam !== null) query.modelProvider = modelProviderParam;

  const sessionIdParam = url.searchParams.get("sessionId");
  if (sessionIdParam !== null) query.sessionId = sessionIdParam;

  const sinceParam = url.searchParams.get("since");
  if (sinceParam !== null) {
    const since = new Date(sinceParam);
    if (Number.isNaN(since.getTime())) {
      sendJson(res, 400, { error: `Invalid since date: ${sinceParam}` });
      return;
    }
    query.since = since;
  }

  const limitParam = url.searchParams.get("limit");
  if (limitParam !== null) {
    const limit = Number.parseInt(limitParam, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      sendJson(res, 400, { error: `Invalid limit: ${limitParam}` });
      return;
    }
    query.limit = limit;
  }

  const finalQuery: ExperienceQuery = { ...query };

  try {
    const records = await options.experienceStore.query(finalQuery);
    sendJson(res, 200, records);
  } catch (error) {
    sendJson(res, 500, {
      error: "Failed to query experience store: " + (error instanceof Error ? error.message : String(error)),
    });
  }
}

async function handleGetExperienceById(
  id: string,
  res: ServerResponse,
  options: KairosServerOptions,
): Promise<void> {
  try {
    const record = await options.experienceStore.get(id);
    if (record === undefined) {
      sendJson(res, 404, { error: `Experience record not found: ${id}` });
      return;
    }
    sendJson(res, 200, record);
  } catch (error) {
    sendJson(res, 500, {
      error: "Failed to fetch experience record: " + (error instanceof Error ? error.message : String(error)),
    });
  }
}

async function handleAnalyseExperience(
  url: URL,
  res: ServerResponse,
  options: KairosServerOptions,
): Promise<void> {
  const query: { -readonly [K in keyof ExperienceQuery]: ExperienceQuery[K] } = {};
  const outcomeParam = url.searchParams.get("outcome");
  if (outcomeParam !== null) {
    if (!isExperienceOutcome(outcomeParam)) {
      sendJson(res, 400, { error: `Invalid outcome: ${outcomeParam}` });
      return;
    }
    query.outcome = outcomeParam as ExperienceOutcome;
  }
  const sessionIdParam = url.searchParams.get("sessionId");
  if (sessionIdParam !== null) query.sessionId = sessionIdParam;
  const goalContainsParam = url.searchParams.get("goalContains");
  if (goalContainsParam !== null) query.goalContains = goalContainsParam;
  try {
    const analyser = new ExperienceAnalyser(options.experienceStore);
    const metrics = await analyser.analyse(query);
    sendJson(res, 200, metrics);
  } catch (error) {
    sendJson(res, 500, { error: "Failed to analyse experience: " + (error instanceof Error ? error.message : String(error)) });
  }
}

async function handleMemory(
  url: URL,
  res: ServerResponse,
  options: KairosServerOptions,
): Promise<void> {
  const query = url.searchParams.get("query") ?? "";

  const typeParam = url.searchParams.get("type");
  let type: MemoryType | undefined;
  if (typeParam !== null) {
    if (!isMemoryType(typeParam)) {
      sendJson(res, 400, { error: `Invalid memory type: ${typeParam}` });
      return;
    }
    type = typeParam;
  }

  const limitParam = url.searchParams.get("limit");
  let limit: number | undefined;
  if (limitParam !== null) {
    limit = Number.parseInt(limitParam, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      sendJson(res, 400, { error: `Invalid limit: ${limitParam}` });
      return;
    }
  }

  try {
    const results = await options.memory.recall({
      query,
      ...(type !== undefined ? { type } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    sendJson(res, 200, results);
  } catch (error) {
    sendJson(res, 500, {
      error: "Failed to query memory: " + (error instanceof Error ? error.message : String(error)),
    });
  }
}

/**
 * Creates (but does not start) a plain node:http server exposing:
 *   POST /run              { goal, maxCycles?, decompose?, sessionId? } -> MultiCycleResult
 *   GET  /experience        ?outcome=&goalContains=&modelProvider=&sessionId=&since=&limit= -> ExperienceRecord[]
 *   GET  /experience/:id    -> ExperienceRecord | 404
 *   GET  /memory            ?query=&type=&limit= -> Memory[]
 * No framework dependency ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â routing and JSON body parsing are handled
 * directly against node:http.
 */

async function handleRunStream(
  req: IncomingMessage,
  res: ServerResponse,
  options: KairosServerOptions,
): Promise<void> {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid request body." });
    return;
  }

  const goal = body["goal"];
  if (typeof goal !== "string" || goal.trim() === "") {
    sendJson(res, 400, { error: '"goal" is required and must be a non-empty string.' });
    return;
  }

  const maxCyclesRaw = body["maxCycles"];
  const maxCycles =
    typeof maxCyclesRaw === "number" && Number.isInteger(maxCyclesRaw) && maxCyclesRaw > 0
      ? maxCyclesRaw
      : options.defaultMaxCycles ?? 10;

  const sessionId = crypto.randomUUID();

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const orchestrator = createKairos({
      mode: "session",
      dependencies: options.dependencies,
      session: { maxCycles, sessionId },
      experienceStore: options.experienceStore,
    });

    sendEvent("start", { sessionId, goal });
    const result = await orchestrator.run(goal);
    sendEvent("result", result);
    sendEvent("done", { sessionId });
  } catch (error) {
    sendEvent("error", { error: error instanceof Error ? error.message : String(error) });
  } finally {
    res.end();
  }
}
// ── Public agent creation (Phase 4) ─────────────────────────────────

interface PublicAgentEntry {
  readonly agent: KairosAgent;
  readonly ownerAccountId: string;
}

const publicAgents = new Map<string, PublicAgentEntry>();
const publicAgentRegistries = new Map<string, AgentRegistry>();

function bearerTokenOf(req: IncomingMessage): string | undefined {
  const header = req.headers["authorization"];
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

function accountOf(req: IncomingMessage, accounts: AccountRegistry): Account | undefined {
  return accounts.byToken(bearerTokenOf(req));
}

async function handleCreateAgent(
  req: IncomingMessage,
  res: ServerResponse,
  options: KairosServerOptions,
): Promise<void> {
  const accounts = options.accounts as AccountRegistry;
  const account = accountOf(req, accounts);
  if (account === undefined) {
    sendJson(res, 401, { error: "A valid account bearer token is required to create agents." });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid request body." });
    return;
  }

  const agentId = body["agentId"];
  if (typeof agentId !== "string" || !/^[a-z][a-z0-9-]{2,31}$/.test(agentId)) {
    sendJson(res, 400, {
      error: '"agentId" is required: 3-32 chars, lowercase letters, digits, hyphens, starting with a letter.',
    });
    return;
  }

  try {
    accounts.registerAgent(account.id, agentId);
  } catch (error) {
    sendJson(res, 409, { error: error instanceof Error ? error.message : String(error) });
    return;
  }

  // Each public agent gets its own registry + scoped view over the
  // server's shared memory store — isolation matches the named agents.
  let registry = publicAgentRegistries.get("shared");
  if (registry === undefined) {
    registry = new AgentRegistry();
    publicAgentRegistries.set("shared", registry);
  }
  const identity = registry.register({ id: agentId, name: agentId, metadata: {
    role: "public",
    owner: account.id,
    capabilities: ["goal-execution"],
    constraints: ["read-only tool access", "scoped memory isolation", "account quota limited"],
  } });

  const agent = new KairosAgent({
    identity,
    dependencies: options.dependencies,
    // KairosAgent wraps this store in AgentScopedMemoryStore, so the
    // public agent's memory is isolated by its agent id.
    memoryStore: options.publicAgentMemoryStore ?? new InMemoryMemoryStore(),
    experienceStore: options.experienceStore,
    session: { sessionId: agentId, ...(options.defaultMaxCycles !== undefined ? { maxCycles: options.defaultMaxCycles } : {}) },
  });

  publicAgents.set(agentId, { agent, ownerAccountId: account.id });

  sendJson(res, 201, {
    agentId,
    owner: account.id,
    createdAt: new Date().toISOString(),
    runEndpoint: `/agents/${agentId}/run`,
  });
}

async function handleListAgents(
  req: IncomingMessage,
  res: ServerResponse,
  options: KairosServerOptions,
): Promise<void> {
  const accounts = options.accounts as AccountRegistry;
  const account = accountOf(req, accounts);
  if (account === undefined) {
    sendJson(res, 401, { error: "A valid account bearer token is required." });
    return;
  }
  const agents = accounts.agentsOwnedBy(account.id).map((agentId) => ({
    agentId,
    runEndpoint: `/agents/${agentId}/run`,
  }));
  sendJson(res, 200, { accountId: account.id, agents });
}

async function handleRunPublicAgent(
  req: IncomingMessage,
  res: ServerResponse,
  options: KairosServerOptions,
  agentId: string,
): Promise<void> {
  const accounts = options.accounts as AccountRegistry;
  const account = accountOf(req, accounts);
  if (account === undefined) {
    sendJson(res, 401, { error: "A valid account bearer token is required." });
    return;
  }
  const entry = publicAgents.get(agentId);
  if (entry === undefined) {
    sendJson(res, 404, { error: `No public agent: ${agentId}` });
    return;
  }
  if (entry.ownerAccountId !== account.id) {
    sendJson(res, 403, { error: "This agent belongs to another account." });
    return;
  }

  if (!accounts.recordRun(account.id)) {
    sendJson(res, 429, {
      error: `Run quota exceeded (${account.runsPerMinute} runs/minute).`,
    });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid request body." });
    return;
  }
  const goal = body["goal"];
  if (typeof goal !== "string" || goal.trim() === "") {
    sendJson(res, 400, { error: '"goal" is required and must be a non-empty string.' });
    return;
  }

  try {
    const result = await entry.agent.run(goal);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, {
      error: "Agent run failed: " + (error instanceof Error ? error.message : String(error)),
    });
  }
}

export function createKairosServer(options: KairosServerOptions): Server {
  const auth = new AuthMiddleware({
    ...(options.apiToken !== undefined ? { apiToken: options.apiToken } : {}),
    ...(options.requestsPerMinute !== undefined ? { rateLimit: { requestsPerMinute: options.requestsPerMinute } } : {}),
    // Account bearer tokens are accepted alongside the global token so
    // public-agent routes work when KAIROS_API_TOKEN is configured.
    // Route handlers still verify ownership, so a valid account token
    // grants nothing beyond that account's own resources.
    ...(options.accounts !== undefined
      ? { accountTokens: { hasToken: (token: string) => options.accounts!.byToken(token) !== undefined } }
      : {}),
  });

  return createServer((req, res) => {
    void (async () => {
      const requestId = crypto.randomUUID();
      const startedAt = Date.now();

      try {
        if (req.method === undefined || req.url === undefined) {
          res.setHeader("X-Request-Id", requestId);
          sendJson(res, 400, { error: "Malformed request." });
          return;
        }

        const ip = req.socket.remoteAddress ?? "unknown";
        const authResult = auth.check(ip, req.headers["authorization"]);
        res.setHeader("X-Request-Id", requestId);

        if (!authResult.allowed) {
          sendJson(res, authResult.status ?? 401, { error: authResult.reason });
          console.log(JSON.stringify({ requestId, method: req.method, path: req.url, status: authResult.status ?? 401, durationMs: Date.now() - startedAt, timestamp: new Date().toISOString() }));
          return;
        }

        const url = new URL(req.url, "http://localhost");

        if (req.method === "POST" && url.pathname === "/stream") { await withSpan("kairos.http", "http.stream", { "http.method": "POST", "http.path": "/stream" }, () => handleRunStream(req, res, options)); }
        else if (req.method === "POST" && url.pathname === "/run") { await withSpan("kairos.http", "http.run", { "http.method": "POST", "http.path": "/run" }, () => handleRun(req, res, options)); }
        else if (options.accounts !== undefined && req.method === "POST" && url.pathname === "/agents") {
          await withSpan("kairos.http", "http.agents.create", { "http.method": "POST", "http.path": "/agents" }, () => handleCreateAgent(req, res, options));
        }
        else if (options.accounts !== undefined && req.method === "GET" && url.pathname === "/agents") {
          await handleListAgents(req, res, options);
        }
        else if (options.accounts !== undefined && req.method === "POST" && /^\/agents\/([^/]+)\/run$/.exec(url.pathname) !== null) {
          const agentId = decodeURIComponent(/^\/agents\/([^/]+)\/run$/.exec(url.pathname)?.[1] ?? "");
          await withSpan("kairos.http", "http.agents.run", { "http.method": "POST", "http.path": "/agents/:id/run" }, () => handleRunPublicAgent(req, res, options, agentId));
        }
        else if (req.method === "GET" && url.pathname === "/experience") { await withSpan("kairos.http", "http.experience", { "http.method": "GET", "http.path": "/experience" }, () => handleListExperience(url, res, options)); }
        else {
          const experienceIdMatch = /^\/experience\/([^/]+)$/.exec(url.pathname);
          if (req.method === "GET" && url.pathname === "/experience/analyse") {
            await withSpan("kairos.http", "http.experience.analyse", { "http.method": "GET", "http.path": "/experience/analyse" }, () => handleAnalyseExperience(url, res, options));
          } else if (req.method === "GET" && experienceIdMatch !== null && experienceIdMatch[1] !== undefined) {
            await handleGetExperienceById(decodeURIComponent(experienceIdMatch[1]), res, options);
          } else if (req.method === "GET" && url.pathname === "/memory") {
            await handleMemory(url, res, options);
          } else {
            sendJson(res, 404, { error: `Not found: ${req.method} ${url.pathname}` });
          }
        }

        console.log(JSON.stringify({ requestId, method: req.method, path: req.url, status: res.statusCode, durationMs: Date.now() - startedAt, timestamp: new Date().toISOString() }));
      } catch (error) {
        sendJson(res, 500, { error: "Internal server error: " + (error instanceof Error ? error.message : String(error)) });
        console.log(JSON.stringify({ requestId, method: req.method ?? "?", path: req.url ?? "?", status: 500, durationMs: Date.now() - startedAt, timestamp: new Date().toISOString() }));
      }
    })();
  });
}
