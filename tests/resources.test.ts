import { describe, it, expect } from "vitest";
import { ResourceProvider } from "../src/resources/provider.js";
import { createLogger } from "../src/logger.js";
import { loadConfig } from "../src/config.js";

describe("Resource Provider", () => {
  let provider: ResourceProvider;

  beforeEach(() => {
    const config = loadConfig();
    const logger = createLogger(config);
    provider = new ResourceProvider(logger);
  });

  it("should list available resources", () => {
    const resources = provider.getAvailableResources();
    expect(resources.length).toBeGreaterThan(0);
    expect(resources[0]).toHaveProperty("uri");
    expect(resources[0]).toHaveProperty("name");
    expect(resources[0]).toHaveProperty("description");
  });

  it("should read schema resource", async () => {
    const content = await provider.readResource("database://schema");
    expect(content).toContain("products");
    expect(content).toContain("orders");
  });

  it("should read capabilities resource", async () => {
    const content = await provider.readResource("mcp://capabilities");
    expect(content).toContain("echo");
    expect(content).toContain("database_query");
  });

  it("should read portfolio services resource", async () => {
    const content = await provider.readResource("portfolio://services");
    expect(content).toContain("AI Gateway");
    expect(content).toContain("AI Agent");
  });

  it("should throw on unknown resource", async () => {
    await expect(provider.readResource("unknown://resource")).rejects.toThrow(
      "Unknown resource",
    );
  });
});
