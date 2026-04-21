import type { Pool, PoolConfig } from "pg";
import type { Config } from "../config.js";
import type { SchemaInfo, ColumnInfo } from "../types.js";
import type winston from "winston";

// ─── Database Provider Interface (Strategy Pattern) ─────────────

/**
 * Base interface for database providers.
 * Equivalent to Python's ABC.
 */
export interface DatabaseProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  getSchema(): Promise<SchemaInfo[]>;
  isConnected(): boolean;
}

// ─── PostgreSQL Provider ────────────────────────────────────────

export class PostgresProvider implements DatabaseProvider {
  private pool: Pool | null = null;
  private config: PoolConfig;
  private logger: winston.Logger;

  constructor(config: Config, logger: winston.Logger) {
    this.config = {
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: 10,
      idleTimeoutMillis: 30000,
    };
    this.logger = logger;
  }

  async connect(): Promise<void> {
    // Dynamic import to avoid issues when pg is not available
    const pg = await import("pg");
    this.pool = new pg.default.Pool(this.config);
    // Test connection
    const client = await this.pool.connect();
    client.release();
    this.logger.info("PostgreSQL connected", {
      host: this.config.host,
      database: this.config.database,
    });
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.logger.info("PostgreSQL disconnected");
    }
  }

  isConnected(): boolean {
    return this.pool !== null;
  }

  async query(
    sql: string,
    params?: unknown[]
  ): Promise<Record<string, unknown>[]> {
    if (!this.pool) {
      throw new Error("Database not connected");
    }
    const result = await this.pool.query(sql, params);
    return result.rows as Record<string, unknown>[];
  }

  async getSchema(): Promise<SchemaInfo[]> {
    if (!this.pool) {
      throw new Error("Database not connected");
    }

    const tablesResult = await this.pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const schemas: SchemaInfo[] = [];

    for (const row of tablesResult.rows) {
      const tableName = row.table_name as string;

      const columnsResult = await this.pool.query(
        `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `,
        [tableName]
      );

      const columns: ColumnInfo[] = columnsResult.rows.map((col) => ({
        name: col.column_name as string,
        type: col.data_type as string,
        nullable: col.is_nullable === "YES",
        defaultValue: col.column_default as string | null,
      }));

      const countResult = await this.pool.query(
        `SELECT COUNT(*) as count FROM "${tableName}"`
      );
      const rowCount = parseInt(countResult.rows[0].count as string, 10);

      schemas.push({ tableName, columns, rowCount });
    }

    return schemas;
  }
}

// ─── In-Memory Provider (for testing/development) ───────────────

export class InMemoryDatabaseProvider implements DatabaseProvider {
  private tables: Map<string, Record<string, unknown>[]> = new Map();
  private schemas: Map<string, ColumnInfo[]> = new Map();
  private connected = false;

  async connect(): Promise<void> {
    this.seedSampleData();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async query(
    sql: string,
    _params?: unknown[]
  ): Promise<Record<string, unknown>[]> {
    if (!this.connected) {
      throw new Error("Database not connected");
    }

    // Simple SQL parser for SELECT queries on sample data
    const normalized = sql.trim().toLowerCase();

    if (!normalized.startsWith("select")) {
      throw new Error("Only SELECT queries are allowed");
    }

    // Match: SELECT ... FROM table_name ...
    const fromMatch = normalized.match(/from\s+["']?(\w+)["']?/);
    if (!fromMatch) {
      throw new Error("Could not parse table name from query");
    }

    const tableName = fromMatch[1];
    const data = this.tables.get(tableName);
    if (!data) {
      throw new Error(`Table '${tableName}' not found`);
    }

    // Handle LIMIT
    const limitMatch = normalized.match(/limit\s+(\d+)/);
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : data.length;

    // Handle ORDER BY ... DESC
    let result = [...data];
    const orderMatch = normalized.match(
      /order\s+by\s+["']?(\w+)["']?\s*(asc|desc)?/
    );
    if (orderMatch) {
      const col = orderMatch[1];
      const dir = orderMatch[2] === "desc" ? -1 : 1;
      result.sort((a, b) => {
        const va = a[col] as number;
        const vb = b[col] as number;
        return (va - vb) * dir;
      });
    }

    return result.slice(0, limit);
  }

  async getSchema(): Promise<SchemaInfo[]> {
    const schemas: SchemaInfo[] = [];
    for (const [tableName, data] of this.tables) {
      const columns = this.schemas.get(tableName) || [];
      schemas.push({ tableName, columns, rowCount: data.length });
    }
    return schemas;
  }

  private seedSampleData(): void {
    // Products table
    this.tables.set("products", [
      { id: 1, name: "Wireless Earbuds", category: "Electronics", price: 29.99, stock: 150 },
      { id: 2, name: "USB-C Hub", category: "Electronics", price: 45.99, stock: 80 },
      { id: 3, name: "Mechanical Keyboard", category: "Electronics", price: 89.99, stock: 45 },
      { id: 4, name: "Standing Desk Mat", category: "Office", price: 34.99, stock: 200 },
      { id: 5, name: "Monitor Light Bar", category: "Office", price: 54.99, stock: 60 },
      { id: 6, name: "Webcam HD", category: "Electronics", price: 69.99, stock: 35 },
      { id: 7, name: "Desk Organizer", category: "Office", price: 19.99, stock: 300 },
      { id: 8, name: "Laptop Stand", category: "Office", price: 39.99, stock: 120 },
      { id: 9, name: "Noise Cancelling Headphones", category: "Electronics", price: 199.99, stock: 25 },
      { id: 10, name: "Wireless Mouse", category: "Electronics", price: 24.99, stock: 180 },
    ]);
    this.schemas.set("products", [
      { name: "id", type: "integer", nullable: false, defaultValue: null },
      { name: "name", type: "text", nullable: false, defaultValue: null },
      { name: "category", type: "text", nullable: false, defaultValue: null },
      { name: "price", type: "numeric", nullable: false, defaultValue: null },
      { name: "stock", type: "integer", nullable: false, defaultValue: null },
    ]);

    // Orders table
    this.tables.set("orders", [
      { id: 1, product_id: 1, quantity: 2, total: 59.98, status: "shipped", created_at: "2024-01-15" },
      { id: 2, product_id: 3, quantity: 1, total: 89.99, status: "delivered", created_at: "2024-01-16" },
      { id: 3, product_id: 5, quantity: 3, total: 164.97, status: "pending", created_at: "2024-01-17" },
      { id: 4, product_id: 2, quantity: 1, total: 45.99, status: "shipped", created_at: "2024-01-18" },
      { id: 5, product_id: 9, quantity: 1, total: 199.99, status: "delivered", created_at: "2024-01-19" },
      { id: 6, product_id: 7, quantity: 5, total: 99.95, status: "pending", created_at: "2024-01-20" },
      { id: 7, product_id: 4, quantity: 2, total: 69.98, status: "shipped", created_at: "2024-01-21" },
      { id: 8, product_id: 10, quantity: 4, total: 99.96, status: "delivered", created_at: "2024-01-22" },
    ]);
    this.schemas.set("orders", [
      { name: "id", type: "integer", nullable: false, defaultValue: null },
      { name: "product_id", type: "integer", nullable: false, defaultValue: null },
      { name: "quantity", type: "integer", nullable: false, defaultValue: null },
      { name: "total", type: "numeric", nullable: false, defaultValue: null },
      { name: "status", type: "text", nullable: false, defaultValue: null },
      { name: "created_at", type: "date", nullable: false, defaultValue: null },
    ]);
  }
}

// ─── Factory ────────────────────────────────────────────────────

export function createDatabaseProvider(
  config: Config,
  logger: winston.Logger
): DatabaseProvider {
  if (
    config.postgres.host !== "localhost" ||
    config.postgres.password !== "mcp_pass"
  ) {
    // Real PostgreSQL configured
    return new PostgresProvider(config, logger);
  }

  // Default to in-memory for development
  logger.info("Using in-memory database (set POSTGRES_* env vars for PostgreSQL)");
  return new InMemoryDatabaseProvider();
}
