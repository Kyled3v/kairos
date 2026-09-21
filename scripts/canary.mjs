#!/usr/bin/env node
/**
 * KAIROS canary check — post-deploy / post-merge smoke verification.
 *
 * Usage:
 *   node scripts/canary.mjs                        # boots a real local server
 *   BASE_URL=http://host:port API_TOKEN=xyz node scripts/canary.mjs
 *
 * Checks C1–C8:
 *   C1  server reachable
 *   C2  POST /run completes a session
 *   C3  POST /stream emits start/result/done SSE events
 *   C4  GET /memory returns an array
 *   C5  GET /experience returns the run's record (session traceability)
 *   C6  POST /run without a goal is rejected (input validation)
 *   C7  auth: wrong bearer token rejected when a token is configured
 *   C8  latency sanity: p95 of repeated /run calls under 2s
 */
import { createKairosServer } from "../src/server/http-server.js";
import { createPipelineDependencies } from "../src/factory/pipeline-dependencies.js";
import { KairosMemory } from "../src/core/memory/kairos-memory.js";
import { InMemoryMemoryStore } from "../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../src/core/experience/in-memory-experience-store.js";

const BASE_URL = process.env["BASE_URL"];
const API_TOKEN = process.env["API_TOKEN"];
const results = [];

function record(id, ok, detail) {
  results.push({ id, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${id}${detail !== undefined ? ` — ${detail}` : ""}`);
}

function headers() {
  return API_TOKEN !== undefined ? { authorization: `Bearer ${API_TOKEN}` } : {};
}

async function bootLocalServer() {
  const experienceStore = new InMemoryExperienceStore();
  const memory = new KairosMemory(new InMemoryMemoryStore());
  const server = createKairosServer({
    dependencies: createPipelineDependencies({ mode: "basic" }),
    experienceStore,
    memory,
    defaultMaxCycles: 2,
    ...(API_TOKEN !== undefined ? { apiToken: API_TOKEN } : {}),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function checkReachable(baseUrl) {
  const started = Date.now();
  const res = await fetch(`${baseUrl}/memory?limit=1`, { headers: headers() });
  record("C1 reachable", res.status === 200 || res.status === 401, `HTTP ${res.status} in ${Date.now() - started}ms`);
  return res.status !== 401 || API_TOKEN !== undefined;
}

async function checkRun(baseUrl) {
  const started = Date.now();
  const res = await fetch(`${baseUrl}/run`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify({ goal: "Canary: verify the run endpoint", maxCycles: 2, sessionId: "canary-run" }),
  });
  const body = await res.json();
  const ok = res.status === 200 && typeof body.totalCycles === "number" && body.totalCycles > 0;
  record("C2 POST /run", ok, `HTTP ${res.status}, ${body.totalCycles} cycles, ${Date.now() - started}ms`);
  return ok;
}

async function checkStream(baseUrl) {
  const res = await fetch(`${baseUrl}/stream`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify({ goal: "Canary: verify the stream endpoint", maxCycles: 2 }),
  });
  const text = await res.text();
  const events = [...text.matchAll(/event: (\w+)/g)].map((m) => m[1]);
  const ok =
    res.status === 200 &&
    events.includes("start") &&
    events.includes("result") &&
    events.includes("done");
  record("C3 POST /stream SSE", ok, `events: ${events.join(",")}`);
}

async function checkMemory(baseUrl) {
  const res = await fetch(`${baseUrl}/memory?limit=5`, { headers: headers() });
  const body = await res.json();
  record("C4 GET /memory", res.status === 200 && Array.isArray(body), `HTTP ${res.status}, ${Array.isArray(body) ? body.length : 0} records`);
}

async function checkExperience(baseUrl) {
  const res = await fetch(`${baseUrl}/experience?sessionId=canary-run`, { headers: headers() });
  const body = await res.json();
  const ok = res.status === 200 && Array.isArray(body) && body.length >= 1;
  record("C5 GET /experience (session traceability)", ok, `${Array.isArray(body) ? body.length : 0} record(s) for sessionId=canary-run`);
}

async function checkValidation(baseUrl) {
  const res = await fetch(`${baseUrl}/run`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify({}),
  });
  record("C6 input validation", res.status === 400, `HTTP ${res.status} for missing goal`);
}

async function checkAuth(baseUrl) {
  if (API_TOKEN === undefined) {
    record("C7 auth", true, "skipped — no API_TOKEN configured");
    return;
  }
  const res = await fetch(`${baseUrl}/run`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer wrong-token" },
    body: JSON.stringify({ goal: "should be rejected" }),
  });
  record("C7 auth rejects bad token", res.status === 401, `HTTP ${res.status}`);
}

async function checkLatency(baseUrl) {
  const latencies = [];
  for (let i = 0; i < 4; i += 1) {
    const started = Date.now();
    await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers() },
      body: JSON.stringify({ goal: `Canary latency probe ${i}`, maxCycles: 1 }),
    });
    latencies.push(Date.now() - started);
  }
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)];
  record("C8 latency p95 < 2000ms", p95 < 2000, `p95 ${p95}ms of [${latencies.join(", ")}]ms`);
}

const boot = BASE_URL === undefined ? await bootLocalServer() : null;
const baseUrl = BASE_URL ?? boot.baseUrl;
console.log(`KAIROS canary → ${baseUrl}${API_TOKEN !== undefined ? " (auth enabled)" : ""}\n`);

try {
  if (!(await checkReachable(baseUrl))) {
    record("C7 auth", false, "server demands auth but no API_TOKEN provided");
  } else {
    await checkRun(baseUrl);
    await checkStream(baseUrl);
    await checkMemory(baseUrl);
    await checkExperience(baseUrl);
    await checkValidation(baseUrl);
    await checkAuth(baseUrl);
    await checkLatency(baseUrl);
  }
} catch (error) {
  record("FATAL", false, error.message);
}

if (boot !== null) boot.server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\nCanary: ${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
