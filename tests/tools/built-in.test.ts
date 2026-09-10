import { describe, expect, it, beforeEach } from "vitest";
import { calculatorTool } from "../../src/core/tools/built-in/calculator.js";
import { dateTimeTool } from "../../src/core/tools/built-in/date-time.js";
import { dataLookupTool } from "../../src/core/tools/built-in/data-lookup.js";
import { mockFileReadTool } from "../../src/core/tools/built-in/mock-file-read.js";
import { mockFileWriteTool, clearMockWriteStore, getMockWriteStore } from "../../src/core/tools/built-in/mock-file-write.js";
import { mockHttpTool } from "../../src/core/tools/built-in/mock-http.js";

const req = (toolId: string, parameters: Record<string, unknown> = {}) => ({
  toolId, parameters, requestedBy: "kairos", requestId: crypto.randomUUID(),
});

describe("Built-in tools", () => {
  describe("calculatorTool", () => {
    it("evaluates valid arithmetic", async () => {
      const result = await calculatorTool.execute(req("kairos.calculator", { expression: "3 * (4 + 2)" }));
      expect(result.status).toBe("success");
      expect((result.result as { result: number }).result).toBe(18);
    });
    it("rejects disallowed characters", async () => {
      const result = await calculatorTool.execute(req("kairos.calculator", { expression: "process.exit(1)" }));
      expect(result.status).toBe("failure");
    });
    it("rejects missing expression", async () => {
      const result = await calculatorTool.execute(req("kairos.calculator", {}));
      expect(result.status).toBe("failure");
    });
  });
  describe("dateTimeTool", () => {
    it("returns a valid ISO timestamp", async () => {
      const result = await dateTimeTool.execute(req("kairos.date-time"));
      expect(result.status).toBe("success");
      const r = result.result as { iso: string; epochMs: number };
      expect(() => new Date(r.iso)).not.toThrow();
      expect(r.epochMs).toBeGreaterThan(0);
    });
  });
  describe("dataLookupTool", () => {
    it("finds a known key", async () => {
      const result = await dataLookupTool.execute(req("kairos.data-lookup", { key: "kairos.version" }));
      expect(result.status).toBe("success");
      const r = result.result as { found: boolean; value: unknown };
      expect(r.found).toBe(true);
      expect(r.value).toBe("0.1.0");
    });
    it("returns not-found for unknown key", async () => {
      const result = await dataLookupTool.execute(req("kairos.data-lookup", { key: "nonexistent" }));
      const r = result.result as { found: boolean };
      expect(r.found).toBe(false);
    });
  });
  describe("mockFileReadTool", () => {
    it("reads a known mock file", async () => {
      const result = await mockFileReadTool.execute(req("kairos.mock-file-read", { path: "/kairos/readme.txt" }));
      expect(result.status).toBe("success");
      const r = result.result as { found: boolean; content: string };
      expect(r.found).toBe(true);
      expect(r.content).toContain("KAIROS");
    });
    it("returns not-found for unknown path", async () => {
      const result = await mockFileReadTool.execute(req("kairos.mock-file-read", { path: "/nonexistent" }));
      const r = result.result as { found: boolean };
      expect(r.found).toBe(false);
    });
  });
  describe("mockFileWriteTool", () => {
    beforeEach(() => { clearMockWriteStore(); });
    it("writes and confirms", async () => {
      const result = await mockFileWriteTool.execute(req("kairos.mock-file-write", { path: "/kairos/test.txt", content: "hello" }));
      expect(result.status).toBe("success");
      expect(getMockWriteStore().get("/kairos/test.txt")).toBe("hello");
    });
    it("rejects missing path", async () => {
      const result = await mockFileWriteTool.execute(req("kairos.mock-file-write", { content: "hello" }));
      expect(result.status).toBe("failure");
    });
  });
  describe("mockHttpTool", () => {
    it("returns 200 for a known URL", async () => {
      const result = await mockHttpTool.execute(req("kairos.mock-http", { url: "https://api.kairos.local/status" }));
      const r = result.result as { statusCode: number };
      expect(r.statusCode).toBe(200);
    });
    it("returns 404 for an unknown URL", async () => {
      const result = await mockHttpTool.execute(req("kairos.mock-http", { url: "https://api.kairos.local/unknown" }));
      const r = result.result as { statusCode: number };
      expect(r.statusCode).toBe(404);
    });
  });
});
