import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { InMemoryDatabaseProvider } from "../src/database/provider.js";
import { createLogger } from "../src/logger.js";
import { loadConfig } from "../src/config.js";

describe("Database Provider", () => {
  let database: InMemoryDatabaseProvider;

  beforeAll(async () => {
    const config = loadConfig();
    const logger = createLogger(config);
    database = new InMemoryDatabaseProvider();
    await database.connect();
  });

  afterAll(async () => {
    await database.disconnect();
  });

  it("should connect successfully", () => {
    expect(database.isConnected()).toBe(true);
  });

  it("should query products table", async () => {
    const results = await database.query("SELECT * FROM products LIMIT 3");
    expect(results).toHaveLength(3);
    expect(results[0]).toHaveProperty("id");
    expect(results[0]).toHaveProperty("name");
  });

  it("should sort results by price DESC", async () => {
    const results = await database.query(
      "SELECT * FROM products ORDER BY price DESC LIMIT 2",
    );
    expect(results[0].price as number).toBeGreaterThanOrEqual(
      results[1].price as number,
    );
  });

  it("should limit query results", async () => {
    const results = await database.query("SELECT * FROM products LIMIT 5");
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("should return schema information", async () => {
    const schemas = await database.getSchema();
    expect(schemas.length).toBeGreaterThan(0);

    const productsSchema = schemas.find((s) => s.tableName === "products");
    expect(productsSchema).toBeDefined();
    expect(productsSchema?.columns.length).toBeGreaterThan(0);
    expect(productsSchema?.rowCount).toBeGreaterThan(0);
  });

  it("should reject non-SELECT queries", async () => {
    await expect(
      database.query("INSERT INTO products VALUES (1, 'test')"),
    ).rejects.toThrow("Only SELECT queries are allowed");
  });

  it("should throw on unknown table", async () => {
    await expect(database.query("SELECT * FROM nonexistent")).rejects.toThrow(
      "not found",
    );
  });
});
