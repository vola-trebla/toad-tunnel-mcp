import pg from "pg";
import { type Config, type EnvConfig } from "../config/schema.js";
import { ConnectionError, UnknownEnvError } from "../utils/errors.js";

const { Pool } = pg;

export class ConnectionManager {
  private readonly pools: Map<string, pg.Pool> = new Map();

  constructor(private readonly config: Config) {}

  async getPool(env: string): Promise<pg.Pool> {
    const envConfig = this.config.environments[env];
    if (!envConfig) {
      throw new UnknownEnvError(env);
    }

    if (!this.pools.has(env)) {
      const pool = new Pool({
        host: envConfig.host,
        port: envConfig.port,
        database: envConfig.database,
        user: envConfig.user,
        password: envConfig.password,
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });

      // Fail fast: verify connection on first pool creation
      try {
        const client = await pool.connect();
        client.release();
      } catch (err) {
        await pool.end().catch(() => {});
        throw new ConnectionError(env, err);
      }

      this.pools.set(env, pool);
    }

    return this.pools.get(env)!;
  }

  getEnvNames(): string[] {
    return Object.keys(this.config.environments);
  }

  getEnvConfig(env: string): EnvConfig {
    const envConfig = this.config.environments[env];
    if (!envConfig) throw new UnknownEnvError(env);
    return envConfig;
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.pools.values()].map((pool) => pool.end()));
    this.pools.clear();
  }
}
