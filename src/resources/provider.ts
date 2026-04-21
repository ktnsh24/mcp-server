import type { SchemaInfo } from "../types.js";
import type winston from "winston";

/**
 * Resource provider for MCP server.
 * Resources are read-only data the server exposes (like GET endpoints).
 * Example: database schema, available tables, documentation.
 */
export class ResourceProvider {
  private logger: winston.Logger;

  constructor(logger: winston.Logger) {
    this.logger = logger;
  }

  /**
   * Get available resources.
   * In MCP, this defines what read-only data clients can access.
   */
  getAvailableResources(): Array<{
    uri: string;
    name: string;
    description: string;
    mimeType: string;
  }> {
    return [
      {
        uri: "database://schema",
        name: "Database Schema",
        description:
          "Current database schema including all tables and columns",
        mimeType: "application/json",
      },
      {
        uri: "mcp://capabilities",
        name: "MCP Server Capabilities",
        description: "List of all tools and resources this server provides",
        mimeType: "application/json",
      },
      {
        uri: "portfolio://services",
        name: "Portfolio Services",
        description: "Available services in the AI portfolio",
        mimeType: "application/json",
      },
    ];
  }

  /**
   * Read a resource by URI.
   */
  async readResource(uri: string): Promise<string> {
    switch (uri) {
      case "database://schema":
        return this.getSchemaResource();
      case "mcp://capabilities":
        return this.getCapabilitiesResource();
      case "portfolio://services":
        return this.getPortfolioServicesResource();
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }

  private getSchemaResource(): string {
    return JSON.stringify(
      {
        tables: [
          {
            name: "products",
            description: "Product catalog",
            columns: [
              {
                name: "id",
                type: "integer",
                description: "Product ID",
              },
              { name: "name", type: "text", description: "Product name" },
              {
                name: "category",
                type: "text",
                description: "Product category",
              },
              { name: "price", type: "numeric", description: "Product price" },
              {
                name: "stock",
                type: "integer",
                description: "Units in stock",
              },
            ],
          },
          {
            name: "orders",
            description: "Customer orders",
            columns: [
              { name: "id", type: "integer", description: "Order ID" },
              {
                name: "product_id",
                type: "integer",
                description: "FK to products",
              },
              {
                name: "quantity",
                type: "integer",
                description: "Quantity ordered",
              },
              {
                name: "total",
                type: "numeric",
                description: "Total order amount",
              },
              {
                name: "status",
                type: "text",
                description: "Order status",
              },
              {
                name: "created_at",
                type: "date",
                description: "Order date",
              },
            ],
          },
        ],
      },
      null,
      2
    );
  }

  private getCapabilitiesResource(): string {
    return JSON.stringify(
      {
        tools: [
          "echo",
          "database_query",
          "data_analysis",
          "http_api",
          "portfolio_health",
        ],
        resources: [
          "database://schema",
          "mcp://capabilities",
          "portfolio://services",
        ],
        maxToolIterations: 10,
        supportedTransports: ["stdio", "sse"],
      },
      null,
      2
    );
  }

  private getPortfolioServicesResource(): string {
    return JSON.stringify(
      {
        services: [
          {
            name: "RAG Chatbot",
            port: 8000,
            endpoint: "http://localhost:8000",
            description: "Document-based Q&A system",
            health: "/health",
          },
          {
            name: "AI Gateway",
            port: 8100,
            endpoint: "http://localhost:8100",
            description: "LLM provider gateway with caching and rate limiting",
            health: "/health",
          },
          {
            name: "AI Agent",
            port: 8200,
            endpoint: "http://localhost:8200",
            description:
              "Agentic AI with tool use and multi-turn conversations",
            health: "/health",
          },
          {
            name: "MCP Server",
            port: 8300,
            endpoint: "http://localhost:8300",
            description: "Model Context Protocol server with database tools",
            health: "sse://capabilities",
          },
        ],
      },
      null,
      2
    );
  }
}
