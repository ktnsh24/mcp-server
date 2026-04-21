import express from "express";
import type { Server as HttpServer } from "http";
import type { Config } from "../config.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ResourceProvider } from "../resources/provider.js";
import type winston from "winston";

/**
 * Create an Express server with SSE transport for remote MCP access.
 * This allows clients to connect to the MCP server over HTTP instead of stdio.
 */
export function createSseServer(
  config: Config,
  toolRegistry: ToolRegistry,
  resourceProvider: ResourceProvider,
  logger: winston.Logger
): HttpServer {
  const app = express();
  app.use(express.json());

  // ─── Health Check ───────────────────────────────────────────

  app.get("/health", (_req, res) => {
    res.json({
      status: "healthy",
      version: "0.1.0",
      transport: "sse",
      tools: toolRegistry.getAllTools().length,
    });
  });

  // ─── Tools Endpoints ────────────────────────────────────────

  app.get("/tools", (_req, res) => {
    res.json({
      tools: toolRegistry.getAllTools(),
      count: toolRegistry.getAllTools().length,
    });
  });

  app.post("/tools/:name/call", express.json(), async (req, res) => {
    const { name } = req.params;
    const input = req.body;

    try {
      const result = await toolRegistry.executeTool(name, input);
      res.json({ success: true, result });
    } catch (error) {
      logger.error("Tool execution error", {
        tool: name,
        error: String(error),
      });
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // ─── Resources Endpoints ────────────────────────────────────

  app.get("/resources", (_req, res) => {
    res.json({
      resources: resourceProvider.getAvailableResources(),
    });
  });

  app.get("/resources/:uri", async (req, res) => {
    const { uri } = req.params;

    try {
      const content = await resourceProvider.readResource(uri);
      res.json({
        uri,
        mimeType: "application/json",
        content: JSON.parse(content),
      });
    } catch (error) {
      logger.error("Resource read error", {
        uri,
        error: String(error),
      });
      res.status(404).json({
        error: error instanceof Error ? error.message : "Resource not found",
      });
    }
  });

  // ─── SSE Streaming Endpoint (for real-time updates) ─────────

  app.get("/stream/tools/:name", (req, res) => {
    const { name } = req.params;
    const input = req.query as Record<string, string>;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial connection message
    res.write(
      `data: ${JSON.stringify({ event: "connected", tool: name })}\n\n`
    );

    // Simulate streaming execution
    (async () => {
      try {
        res.write(
          `data: ${JSON.stringify({ event: "executing", tool: name })}\n\n`
        );

        const result = await toolRegistry.executeTool(name, input);

        res.write(
          `data: ${JSON.stringify({ event: "success", result })}\n\n`
        );
        res.end();
      } catch (error) {
        res.write(
          `data: ${JSON.stringify({
            event: "error",
            error: String(error),
          })}\n\n`
        );
        res.end();
      }
    })();
  });

  // ─── Error handling ─────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // ─── Start server ───────────────────────────────────────────

  const server = app.listen(config.port, () => {
    logger.info("SSE server listening", { port: config.port });
  });

  return server;
}
