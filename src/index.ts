import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createDatabaseProvider } from "./database/provider.js";
import { createMcpServer, startMcpServer } from "./server/mcp.js";
import { createSseServer } from "./server/sse.js";
import { ToolRegistry } from "./tools/registry.js";
import { ResourceProvider } from "./resources/provider.js";

/**
 * Main entry point for the MCP server.
 * Supports two modes:
 * 1. stdio: for Claude Desktop and local testing
 * 2. sse: for remote HTTP access
 */
async function main(): Promise<void> {
  try {
    // Load configuration
    const config = loadConfig();
    const logger = createLogger(config);

    logger.info("Starting MCP server", {
      transport: config.transport,
      cloudProvider: config.cloudProvider,
    });

    // Create database connection
    const database = createDatabaseProvider(config, logger);
    await database.connect();
    logger.info("Database connected");

    if (config.transport === "stdio") {
      // Stdio mode: for Claude Desktop
      const { server, transport } = await createMcpServer(
        config,
        database,
        logger
      );
      await startMcpServer(server, transport, logger);
    } else {
      // SSE mode: for HTTP access
      const toolRegistry = new ToolRegistry(config, database, logger);
      const resourceProvider = new ResourceProvider(logger);
      const httpServer = createSseServer(
        config,
        toolRegistry,
        resourceProvider,
        logger
      );

      // Graceful shutdown
      process.on("SIGINT", async () => {
        logger.info("Shutting down SSE server");
        await database.disconnect();
        httpServer.close();
        process.exit(0);
      });
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
