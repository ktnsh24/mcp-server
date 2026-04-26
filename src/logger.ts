import winston from "winston";
import { type Config } from "./config.js";

/**
 * Create a Winston logger instance.
 * Equivalent to Python's structlog/logging setup.
 */
export function createLogger(config: Config): winston.Logger {
  return winston.createLogger({
    level: config.logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      config.transport === "stdio"
        ? winston.format.json() // JSON to stderr for stdio (stdout is MCP)
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length
                ? ` ${JSON.stringify(meta)}`
                : "";
              return `${timestamp} [${level}] ${message}${metaStr}`;
            }),
          ),
    ),
    transports: [
      new winston.transports.Console({
        // For stdio transport, log to stderr (stdout is for MCP protocol)
        stderrLevels:
          config.transport === "stdio"
            ? ["error", "warn", "info", "debug"]
            : [],
      }),
    ],
  });
}
