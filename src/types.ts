import { z } from "zod";

// ─── Tool Schemas ───────────────────────────────────────────────

/**
 * Echo tool input schema.
 */
export const EchoInputSchema = z.object({
  message: z.string().describe("The message to echo back"),
});

/**
 * Database query tool input schema.
 */
export const DatabaseQueryInputSchema = z.object({
  query: z.string().describe("SQL SELECT query to execute"),
  params: z
    .array(z.union([z.string(), z.number()]))
    .optional()
    .describe("Query parameters for parameterized queries"),
});

/**
 * Data analysis tool input schema.
 */
export const DataAnalysisInputSchema = z.object({
  table: z.string().describe("Table name to analyze"),
  operation: z
    .enum(["summary", "top_n", "distribution", "correlations"])
    .describe("Type of analysis to perform"),
  column: z.string().optional().describe("Column to focus on"),
  limit: z.coerce.number().default(10).describe("Number of results"),
});

/**
 * HTTP API tool input schema.
 */
export const HttpApiInputSchema = z.object({
  url: z.string().url().describe("The URL to call"),
  method: z
    .enum(["GET", "POST", "PUT", "DELETE"])
    .default("GET")
    .describe("HTTP method"),
  headers: z.record(z.string()).optional().describe("Request headers"),
  body: z.string().optional().describe("Request body (JSON string)"),
  timeout: z.coerce.number().default(10000).describe("Timeout in milliseconds"),
});

/**
 * Portfolio health check tool input schema.
 */
export const PortfolioHealthInputSchema = z.object({
  service: z
    .enum(["gateway", "agent", "chatbot", "all"])
    .default("all")
    .describe("Which portfolio service to check"),
});

// ─── Resource Types ─────────────────────────────────────────────

export interface SchemaInfo {
  tableName: string;
  columns: ColumnInfo[];
  rowCount: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
}

// ─── MCP Types ──────────────────────────────────────────────────

export interface ToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text";
    text: string;
  };
}

// ─── Server Health ──────────────────────────────────────────────

export interface HealthStatus {
  status: "healthy" | "unhealthy";
  version: string;
  transport: string;
  components: Record<string, string>;
}
