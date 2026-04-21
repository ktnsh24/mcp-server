import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ToolRegistry } from "../src/tools/registry.js";
import { InMemoryDatabaseProvider } from "../src/database/provider.js";
import { createLogger } from "../src/logger.js";
import { loadConfig } from "../src/config.js";
import {
  EchoInputSchema,
  DatabaseQueryInputSchema,
  DataAnalysisInputSchema,
  HttpApiInputSchema,
} from "../src/types.js";

describe("Tool Registry", () => {
  let registry: ToolRegistry;

  beforeAll(async () => {
    const config = loadConfig();
    const logger = createLogger(config);
    const database = new InMemoryDatabaseProvider();
    await database.connect();
    registry = new ToolRegistry(config, database, logger);
  });

  it("should list all tools", () => {
    const tools = registry.getAllTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.map((t) => t.name)).toContain("echo");
    expect(tools.map((t) => t.name)).toContain("database_query");
  });

  it("should execute echo tool", async () => {
    const result = await registry.executeTool("echo", { message: "hello" });
    expect(result).toContain("hello");
  });

  it("should validate echo input", async () => {
    const input = { message: "test" };
    expect(() => EchoInputSchema.parse(input)).not.toThrow();
  });

  it("should validate database query input", async () => {
    const input = { query: "SELECT * FROM products" };
    expect(() => DatabaseQueryInputSchema.parse(input)).not.toThrow();
  });

  it("should validate data analysis input", async () => {
    const input = { table: "products", operation: "summary" };
    expect(() => DataAnalysisInputSchema.parse(input)).not.toThrow();
  });

  it("should validate http api input", async () => {
    const input = { url: "https://example.com" };
    expect(() => HttpApiInputSchema.parse(input)).not.toThrow();
  });

  it("should execute database query", async () => {
    const result = await registry.executeTool("database_query", {
      query: "SELECT COUNT(*) as count FROM products",
    });
    expect(result).toContain("count");
  });

  it("should execute data analysis", async () => {
    const result = await registry.executeTool("data_analysis", {
      table: "products",
      operation: "summary",
    });
    expect(result).toContain("products");
  });

  it("should reject unknown tools", async () => {
    await expect(
      registry.executeTool("unknown_tool", {})
    ).rejects.toThrow("Unknown tool");
  });
});
