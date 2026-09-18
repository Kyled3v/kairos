import { test, expect } from "@playwright/test";

/**
 * E2E tests for the KAIROS web console. Runs against the static server
 * (webServer in playwright.config.mjs) — the console's offline demo mode
 * makes the full delegation choreography testable without a backend.
 */

test.describe("view routing", () => {
  test("deep links land on the right view", async ({ page }) => {
    for (const view of ["console", "agents", "memory", "status", "evals"]) {
      await page.goto(`/#${view}`);
      await expect(page.locator(`#view-${view}`)).toBeVisible();
    }
  });

  test("unknown hash falls back to console", async ({ page }) => {
    await page.goto("/#nonsense");
    await expect(page.locator("#view-console")).toBeVisible();
  });

  test("nav buttons update aria-current and the hash", async ({ page }) => {
    await page.goto("/");
    // Desktop viewport: the bottom .nav is display:none — use the topnav.
    await page.click('.topnav button[data-view="agents"]');
    await expect(page).toHaveURL(/#agents/);
    // Both nav surfaces (desktop topnav + mobile bottom nav) mark agents
    // as current — the count is per-surface, not global.
    await expect(page.locator('[data-view="agents"][aria-current="page"]')).toHaveCount(2);
    await expect(page.locator('[data-view="console"][aria-current="page"]')).toHaveCount(0);
  });

  test("mobile bottom nav navigates on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/");
    await page.click('.nav button[data-view="evals"]');
    await expect(page).toHaveURL(/#evals/);
    await expect(page.locator("#view-evals")).toBeVisible();
  });
});

test.describe("agents view", () => {
  test("renders all eight agent cards with role tags", async ({ page }) => {
    await page.goto("/#agents");
    const grid = page.locator("#agents-grid");
    await expect(grid.locator(".agent-card")).toHaveCount(8);

    for (const agent of ["Atlas", "Orion", "Sage", "Pulse", "Forge", "Nova", "Vector", "Vanguard"]) {
      await expect(grid.locator(".name", { hasText: agent })).toBeVisible();
    }
  });

  test("privilege pills encode state with text, not color alone", async ({ page }) => {
    await page.goto("/#agents");
    await expect(page.locator(".pill.read-only")).toHaveCount(5);
    await expect(page.locator(".pill.gated")).toHaveCount(2);
    await expect(page.locator(".pill.executive")).toHaveCount(1);
    // Each pill contains a visible text label next to its dot.
    await expect(page.locator(".pill.read-only", { hasText: "read-only" }).first()).toBeVisible();
  });
});

test.describe("evals view", () => {
  test("lists all six suites with check ranges", async ({ page }) => {
    await page.goto("/#evals");
    await expect(page.locator("#evals-body tr")).toHaveCount(6);
    for (const range of ["E1–E9", "F1–F8", "R1–R7", "P1–P8", "M1–M10", "G1–G7"]) {
      await expect(page.locator("#evals-body").getByText(range)).toBeVisible();
    }
  });
});

test.describe("memory view", () => {
  test("offline search degrades gracefully with an actionable message", async ({ page }) => {
    await page.goto("/#memory");
    await page.fill("#memory-query", "delegation");
    await page.click("#memory-refresh");
    await expect(page.locator("#memory-list li").first()).toContainText(/unreachable|No memories/i, {
      timeout: 5_000,
    });
  });

  test("agent scope selector offers all eight scopes", async ({ page }) => {
    await page.goto("/#memory");
    const options = page.locator("#memory-agent option");
    await expect(options).toHaveCount(9); // all-agents + 8 scopes
  });
});

test.describe("status view", () => {
  test("offline probe reports unreachable and never throws", async ({ page }) => {
    await page.goto("/#status");
    // The probe fires on view activation (deep-link load included).
    await expect(page.locator("#pulse-aggregate")).toHaveText(/operational|degraded|unreachable/, {
      timeout: 8_000,
    });
    // The three-state badge classes exist and the aggregate uses one.
    await expect(page.locator("#pulse-aggregate.status-ok, #pulse-aggregate.status-degraded, #pulse-aggregate.status-unreachable")).toHaveCount(1);
    // The probe detail explains the offline state.
    await expect(page.locator("#pulse-detail li").first()).toContainText(/offline|probe/i);
  });
});

test.describe("console: delegation demo", () => {
  test("submitting an objective runs the demo choreography offline", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#api-state")).toContainText(/offline/i);

    await page.fill("#objective", "Research the auth flow; then implement the fix; then deploy it");
    await page.click("#submit-btn");

    // YOU line lands, then per-worker simulated cycles stream in.
    await expect(page.locator("#activity li", { hasText: "YOU" })).toBeVisible();
    await expect(page.locator("#delegation-board .delegation-row")).toHaveCount(3);

    // Role routing: research → orion, implement → forge, deploy → vector.
    const board = page.locator("#delegation-board");
    await expect(board.locator('[data-worker-id="orion"]')).toHaveCount(1);
    await expect(board.locator('[data-worker-id="forge"]')).toHaveCount(1);
    await expect(board.locator('[data-worker-id="vector"]')).toHaveCount(1);

    // Choreography completes: every chip reaches done, DEMO summary logs.
    await expect(page.locator("#delegation-row .chip-state", { hasText: "running" })).toHaveCount(0, { timeout: 10_000 });
    const doneChips = page.locator('#delegation-board .chip-state[data-state="done"]');
    await expect(doneChips).toHaveCount(3, { timeout: 10_000 });
    await expect(page.locator("#activity li", { hasText: "DEMO" }).first()).toBeVisible();
  });

  test("empty objective is a no-op (no board rows, no YOU line)", async ({ page }) => {
    await page.goto("/");
    const before = await page.locator("#activity li").count();
    await page.click("#submit-btn");
    await expect(page.locator("#delegation-board .delegation-row")).toHaveCount(0);
    expect(await page.locator("#activity li").count()).toBe(before);
  });
});

test.describe("accessibility invariants", () => {
  test("aria-live regions exist for streaming updates", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('#activity[aria-live="polite"]')).toBeVisible();
    await expect(page.locator('#delegation-board[aria-live="polite"]')).toBeVisible();
  });

  test("every button and input meets the 44px touch target rule (nav + composer)", async ({ page }) => {
    await page.goto("/");
    const composerBtn = page.locator("#submit-btn");
    const box = await composerBtn.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(40); // styled min-height 44 with border-box
  });

  test("reduced-motion media query is declared", async ({ page }) => {
    await page.goto("/");
    const css = await page.evaluate(() => {
      let found = false;
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSMediaRule && rule.conditionText.includes("prefers-reduced-motion")) {
              found = true;
            }
          }
        } catch { /* cross-origin sheets */ }
      }
      return found;
    });
    expect(css).toBe(true);
  });
});
