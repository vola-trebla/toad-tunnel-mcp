import pg from "pg";
import { type Config, type EnvConfig } from "../config/schema.js";
import { ConnectionError, UnknownEnvError } from "../utils/errors.js";
import type { TunnelProvider, TunnelConfig } from "../tunnel/types.js";

const { Pool } = pg;

export class ConnectionManager {
  private readonly pools: Map<string, pg.Pool> = new Map();

  constructor(
    private readonly config: Config,
    private readonly tunnelProvider?: TunnelProvider,
  ) {}

  async getPool(env: string): Promise<pg.Pool> {
    const envConfig = this.config.environments[env];
    if (!envConfig) {
      throw new UnknownEnvError(env);
    }

    if (!this.pools.has(env)) {
      // Open SSH tunnel lazily if this env requires one
      let host = envConfig.host;
      let port = envConfig.port;

      if (envConfig.tunnel && this.tunnelProvider) {
        const tunnelConfig = this.buildTunnelConfig(env, envConfig);
        const tunnel = await this.tunnelProvider.connect(env, tunnelConfig);
        host = "127.0.0.1";
        port = tunnel.local_port;
      }

      const pool = new Pool({
        host,
        port,
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

  /** Called by TunnelProvider.onReconnect to force pool recreation on next getPool() */
  invalidatePool(env: string): void {
    const pool = this.pools.get(env);
    if (pool) {
      void pool.end().catch(() => {});
      this.pools.delete(env);
    }
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
    await this.tunnelProvider?.disconnectAll();
  }

  private buildTunnelConfig(env: string, envConfig: EnvConfig): TunnelConfig {
    const t = envConfig.tunnel!;
    return {
      bastion: t.bastion,
      bastion_port: t.bastion_port,
      username: t.username,
      key_path: t.key_path,
      passphrase: t.passphrase,
      local_port: t.local_port,
      remote_host: t.remote_host ?? envConfig.host,
      remote_port: t.remote_port ?? envConfig.port,
    };
  }
}
