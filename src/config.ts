import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

/**
 * Cloud provider for infrastructure deployment.
 */
export const CloudProvider = z.enum(["aws", "azure", "local"]);
export type CloudProvider = z.infer<typeof CloudProvider>;

/**
 * Transport mode for MCP server.
 */
export const TransportMode = z.enum(["stdio", "sse"]);
export type TransportMode = z.infer<typeof TransportMode>;

/**
 * Application configuration validated with Zod.
 * Equivalent to Pydantic Settings in Python.
 */
export const ConfigSchema = z.object({
  // Server
  transport: TransportMode.default("sse"),
  port: z.coerce.number().default(8300),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Cloud
  cloudProvider: CloudProvider.default("local"),

  // PostgreSQL
  postgres: z.object({
    host: z.string().default("localhost"),
    port: z.coerce.number().default(5432),
    database: z.string().default("mcp_data"),
    user: z.string().default("mcp_user"),
    password: z.string().default("mcp_pass"),
  }),

  // API Integration
  portfolioApiUrl: z.string().url().default("http://localhost:8200"),

  // Authentication
  apiKey: z.string().optional(),
  rateLimitRpm: z.coerce.number().default(60),

  // AWS
  awsRegion: z.string().default("eu-west-1"),

  // Azure
  azureResourceGroup: z.string().default("rg-mcp-server"),
  azureLocation: z.string().default("westeurope"),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from environment variables.
 */
export function loadConfig(): Config {
  return ConfigSchema.parse({
    transport: process.env.MCP_TRANSPORT,
    port: process.env.MCP_PORT,
    logLevel: process.env.LOG_LEVEL,
    cloudProvider: process.env.CLOUD_PROVIDER,
    postgres: {
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT,
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
    },
    portfolioApiUrl: process.env.PORTFOLIO_API_URL,
    apiKey: process.env.MCP_API_KEY || undefined,
    rateLimitRpm: process.env.MCP_RATE_LIMIT_RPM,
    awsRegion: process.env.AWS_REGION,
    azureResourceGroup: process.env.AZURE_RESOURCE_GROUP,
    azureLocation: process.env.AZURE_LOCATION,
  });
}
