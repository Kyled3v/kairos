import { describe, expect, it } from "vitest";
import { scanRepository, buildContextSummary } from "../../../src/agents/coding/repository-context.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "..", "..", "..", "..");

describe("scanRepository", () => {
  it("scans the KAIROS project root", async () => {
    const ctx = await scanRepository(projectRoot);
    expect(ctx.totalFiles).toBeGreaterThan(10);
    expect(ctx.hasPackageJson).toBe(true);
    expect(ctx.hasTsConfig).toBe(true);
    expect(ctx.languages.length).toBeGreaterThan(0);
    expect(ctx.rootPath).toBe(projectRoot);
  });

  it("throws for a non-existent path", async () => {
    await expect(scanRepository("/nonexistent/path/xyz")).rejects.toThrow("not found");
  });

  it("builds a readable context summary", async () => {
    const ctx = await scanRepository(projectRoot);
    const summary = await buildContextSummary(ctx);
    expect(summary).toContain("Repository:");
    expect(summary).toContain("Files:");
    expect(summary).toContain("kairos");
  });
});
