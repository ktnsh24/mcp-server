import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Config } from "../config.js";
import type winston from "winston";
import { ToolRegistry, registerTools } from "../tools/registry.js";
import { ResourceProvider } from "../resources/provider.js";
import type { DatabaseProvider } from "../database/provider.js";

/**
 * Create an MCP server with tools and resources.
 */
export async function createMcpServer(
  config: Config,
  database: DatabaseProvider,
  logger: winston.Logger,
): Promise<{ server: Server; transport: Transport }> {
  const transport = new StdioServerTransport();
  const server = new Server({
    name: "ai-portfolio-mcp-server",
    version: "0.1.0",
  });

  const toolRegistry = new ToolRegistry(config, database, logger);
  const resourceProvider = new ResourceProvider(logger);

  // Register tools
  registerTools(server, toolRegistry);

  // Register resources
  (server as any).setRequestHandler("resources/list", async () => ({
    resources: resourceProvider.getAvailableResources(),
  }));

  (server as any).setRequestHandler("resources/read", async (request: any) => {
    const { uri } = request.params;
    const content = await resourceProvider.readResource(uri as string);
    return {
      contents: [
        {
          uri: uri as string,
          mimeType: "application/json",
          text: content,
        },
      ],
    };
  });

  // Health endpoint
  (server as any).setRequestHandler("health", async () => ({
    status: "ok",
    version: "0.1.0",
    database: database.isConnected() ? "connected" : "disconnected",
  }));

  logger.info("MCP server created", {
    transport: "stdio",
    tools: toolRegistry.getAllTools().length,
  });

  return { server, transport };
}

/**
 * Start the MCP server (for stdio transport).
 */
export async function startMcpServer(
  server: Server,
  transport: Transport,
  logger: winston.Logger,
): Promise<void> {
  server.connect(transport);
  logger.info("MCP server started and listening on stdio");

  // Keep the server running
  process.on("SIGINT", () => {
    logger.info("Shutting down MCP server");
    process.exit(0);
  });
}
