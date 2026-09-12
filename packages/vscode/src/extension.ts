import * as vscode from "vscode";

interface KairosConfig {
  serverUrl: string;
  apiToken: string;
  maxCycles: number;
  decompose: boolean;
}

function getConfig(): KairosConfig {
  const cfg = vscode.workspace.getConfiguration("kairos");
  return {
    serverUrl: (cfg.get<string>("serverUrl") ?? "http://localhost:3000").replace(/\/+$/, ""),
    apiToken: cfg.get<string>("apiToken") ?? "",
    maxCycles: cfg.get<number>("maxCycles") ?? 10,
    decompose: cfg.get<boolean>("decompose") ?? false,
  };
}

function makeHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token.trim()) h["Authorization"] = "Bearer " + token;
  return h;
}

async function kairosPost(url: string, body: unknown, token: string): Promise<unknown> {
  const res = await fetch(url, { method: "POST", headers: makeHeaders(token), body: JSON.stringify(body) });
  if (!res.ok) throw new Error("KAIROS " + res.status + ": " + res.statusText);
  return res.json();
}

async function kairosGet(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, { headers: makeHeaders(token) });
  if (!res.ok) throw new Error("KAIROS " + res.status + ": " + res.statusText);
  return res.json();
}

export function activate(context: vscode.ExtensionContext): void {
  const out = vscode.window.createOutputChannel("KAIROS");
  context.subscriptions.push(out);

  context.subscriptions.push(vscode.commands.registerCommand("kairos.runGoal", async () => {
    const goal = await vscode.window.showInputBox({ prompt: "Enter KAIROS goal", placeHolder: "e.g. Analyse the auth module" });
    if (!goal?.trim()) return;
    const { serverUrl, apiToken, maxCycles, decompose } = getConfig();
    out.show();
    out.appendLine("\n[KAIROS] Goal: " + goal);
    try {
      const r = await kairosPost(serverUrl + "/run", { goal, maxCycles, decompose }, apiToken);
      const result = r as { status: string; terminationReason: string; totalCycles: number; finalReflection?: { summary: string } };
      out.appendLine("[KAIROS] Status:     " + result.status);
      out.appendLine("[KAIROS] Terminated: " + result.terminationReason);
      out.appendLine("[KAIROS] Cycles:     " + result.totalCycles);
      if (result.finalReflection) out.appendLine("[KAIROS] Reflection: " + result.finalReflection.summary);
      out.appendLine("[KAIROS] Full result:\n" + JSON.stringify(r, null, 2));
    } catch (e) { out.appendLine("[KAIROS] Error: " + (e instanceof Error ? e.message : String(e))); }
  }));

  context.subscriptions.push(vscode.commands.registerCommand("kairos.showExperience", async () => {
    const { serverUrl, apiToken } = getConfig();
    out.show();
    out.appendLine("\n[KAIROS] Fetching experience...");
    try {
      const records = await kairosGet(serverUrl + "/experience?limit=20", apiToken);
      out.appendLine("[KAIROS] Experience:\n" + JSON.stringify(records, null, 2));
    } catch (e) { out.appendLine("[KAIROS] Error: " + (e instanceof Error ? e.message : String(e))); }
  }));

  context.subscriptions.push(vscode.commands.registerCommand("kairos.showMemory", async () => {
    const { serverUrl, apiToken } = getConfig();
    const q = await vscode.window.showInputBox({ prompt: "Memory search query (leave empty for all)" });
    if (q === undefined) return;
    out.show();
    try {
      const memories = await kairosGet(serverUrl + "/memory?query=" + encodeURIComponent(q) + "&limit=20", apiToken);
      out.appendLine("[KAIROS] Memory:\n" + JSON.stringify(memories, null, 2));
    } catch (e) { out.appendLine("[KAIROS] Error: " + (e instanceof Error ? e.message : String(e))); }
  }));

  context.subscriptions.push(vscode.commands.registerCommand("kairos.analyseExperience", async () => {
    const { serverUrl, apiToken } = getConfig();
    out.show();
    out.appendLine("\n[KAIROS] Analysing experience...");
    try {
      const records = await kairosGet(serverUrl + "/experience?limit=100", apiToken) as unknown[];
      const total = records.length;
      const successes = records.filter((r) => (r as { outcome: string }).outcome === "success").length;
      out.appendLine("[KAIROS] Total sessions: " + total);
      out.appendLine("[KAIROS] Success rate:   " + (total > 0 ? ((successes / total) * 100).toFixed(1) + "%" : "N/A"));
    } catch (e) { out.appendLine("[KAIROS] Error: " + (e instanceof Error ? e.message : String(e))); }
  }));
}

export function deactivate(): void {}
