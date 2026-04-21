import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Config } from "../config.js";
import type { DatabaseProvider } from "../database/provider.js";
import type winston from "winston";
import {
  EchoInputSchema,
  DatabaseQueryInputSchema,
  DataAnalysisInputSchema,
  HttpApiInputSchema,
  PortfolioHealthInputSchema,
} from "../types.js";

/**
 * Tool registry managing all MCP tools.
 * Tools are actions the AI can invoke (like POST endpoints).
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private config: Config;
  private database: DatabaseProvider;
  private logger: winston.Logger;

  constructor(
    config: Config,
    database: DatabaseProvider,
    logger: winston.Logger
  ) {
    this.config = config;
    this.database = database;
    this.logger = logger;
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    // Echo tool (basic test)
    this.tools.set("echo", {
      name: "echo",
      description:
        "Echo back a message. Use this to test the MCP server connection.",
      inputSchema: EchoInputSchema as Record<string, unknown>,
    });

    // Database query tool
    this.tools.set("database_query", {
      name: "database_query",
      description:
        "Execute a read-only SQL SELECT query against the database. Always use parameterized queries to prevent SQL injection.",
      inputSchema: DatabaseQueryInputSchema as Record<string, unknown>,
    });

    // Data analysis tool
    this.tools.set("data_analysis", {
      name: "data_analysis",
      description:
        "Perform statistical analysis on database tables (summary, top_n, distribution, correlations).",
      inputSchema: DataAnalysisInputSchema as Record<string, unknown>,
    });

    // HTTP API tool
    this.tools.set("http_api", {
      name: "http_api",
      description:
        "Make HTTP requests to external APIs. Useful for calling portfolio services or external APIs.",
      inputSchema: HttpApiInputSchema as Record<string, unknown>,
    });

    // Portfolio health check
    this.tools.set("portfolio_health", {
      name: "portfolio_health",
      description:
        "Check the health status of portfolio services (gateway, agent, chatbot).",
      inputSchema: PortfolioHealthInputSchema as Record<string, unknown>,
    });

    this.logger.info("Registered 5 tools", { tools: Array.from(this.tools.keys()) });
  }

  /**
   * Get all registered tools.
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool by name.
   */
  async executeTool(
    name: string,
    input: Record<string, unknown>
  ): Promise<string> {
    switch (name) {
      case "echo":
        return this.executEcho(input);
      case "database_query":
        return await this.executeQuery(input);
      case "data_analysis":
        return await this.executeAnalysis(input);
      case "http_api":
        return await this.executeHttpApi(input);
      case "portfolio_health":
        return await this.executePortfolioHealth(input);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private executEcho(input: Record<string, unknown>): string {
    const parsed = EchoInputSchema.parse(input);
    return `Echo: ${parsed.message}`;
  }

  private async executeQuery(input: Record<string, unknown>): Promise<string> {
    const parsed = DatabaseQueryInputSchema.parse(input);

    // Verify it's a SELECT query
    if (!parsed.query.trim().toUpperCase().startsWith("SELECT")) {
      throw new Error("Only SELECT queries are allowed");
    }

    const results = await this.database.query(parsed.query, parsed.params);
    return JSON.stringify(results, null, 2);
  }

  private async executeAnalysis(
    input: Record<string, unknown>
  ): Promise<string> {
    const parsed = DataAnalysisInputSchema.parse(input);
    const schemas = await this.database.getSchema();
    const schema = schemas.find((s) => s.tableName === parsed.table);

    if (!schema) {
      throw new Error(`Table '${parsed.table}' not found`);
    }

    switch (parsed.operation) {
      case "summary":
        return JSON.stringify(
          {
            table: parsed.table,
            rows: schema.rowCount,
            columns: schema.columns.map((c) => c.name),
          },
          null,
          2
        );

      case "top_n": {
        const col = parsed.column || schema.columns[0].name;
        const query = `SELECT * FROM "${parsed.table}" ORDER BY "${col}" DESC LIMIT $1`;
        const results = await this.database.query(query, [parsed.limit]);
        return JSON.stringify(results, null, 2);
      }

      case "distribution": {
        if (!parsed.column) {
          throw new Error("column required for distribution analysis");
        }
        const query = `
          SELECT "${parsed.column}", COUNT(*) as count
          FROM "${parsed.table}"
          GROUP BY "${parsed.column}"
          ORDER BY count DESC
          LIMIT 10
        `;
        const results = await this.database.query(query);
        return JSON.stringify(results, null, 2);
      }

      default:
        return JSON.stringify({ table: parsed.table, schema }, null, 2);
    }
  }

  private async executeHttpApi(
    input: Record<string, unknown>
  ): Promise<string> {
    const parsed = HttpApiInputSchema.parse(input);

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      parsed.timeout
    );

    try {
      const options: RequestInit = {
        method: parsed.method,
        headers: parsed.headers || { "Content-Type": "application/json" },
        signal: controller.signal,
      };

      if (parsed.body && ["POST", "PUT"].includes(parsed.method)) {
        options.body = parsed.body;
      }

      const response = await fetch(parsed.url, options);
      const data = await response.text();

      return JSON.stringify(
        {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: data,
        },
        null,
        2
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async executePortfolioHealth(
    input: Record<string, unknown>
  ): Promise<string> {
    const parsed = PortfolioHealthInputSchema.parse(input);

    const checks: Record<string, string> = {};
    const services =
      parsed.service === "all"
        ? ["gateway", "agent", "chatbot"]
        : [parsed.service];

    for (const service of services) {
      try {
        const port = {
          gateway: 8100,
          agent: 8200,
          chatbot: 8000,
        }[service];

        if (!port) continue;

        const response = await fetch(`http://localhost:${port}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        checks[service] = response.ok ? "healthy" : "unhealthy";
      } catch {
        checks[service] = "unreachable";
      }
    }

    return JSON.stringify(checks, null, 2);
  }
}

/**
 * Register tools with the MCP server.
 */
export function registerTools(
  server: Server,
  registry: ToolRegistry
): void {
  // Provide tool list
  server.setRequestHandler("tools/list", async () => ({
    tools: registry.getAllTools(),
  }));

  // Execute tool
  server.setRequestHandler("tools/call", async (request) => {
    const { name, arguments: args } = request.params;
    const result = await registry.executeTool(name, args as Record<string, unknown>);

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  });
}
