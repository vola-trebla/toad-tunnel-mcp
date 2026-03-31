import pg from "pg";
import { type Config, type EnvConfig } from "../config/schema.js";
import { ConnectionError, UnknownEnvError } from "../utils/errors.js";
import type { TunnelProvider, TunnelConfig } from "../tunnel/types.js";

const { Pool } = pg;

export class ConnectionManager {
  // Stores in-flight promises so concurrent getPool() calls share the same connection attempt
  private readonly pools: Map<string, Promise<pg.Pool>> = new Map();

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
      this.pools.set(env, this._createPool(env, envConfig));
    }

    return this.pools.get(env)!;
  }

  private async _createPool(
    env: string,
    envConfig: EnvConfig,
  ): Promise<pg.Pool> {
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
      this.pools.delete(env); // remove failed promise so next call retries
      throw new ConnectionError(env, err);
    }

    return pool;
  }

  /** Called by TunnelProvider.onReconnect to force pool recreation on next getPool() */
  invalidatePool(env: string): void {
    const poolPromise = this.pools.get(env);
    if (poolPromise) {
      void poolPromise.then((pool) => pool.end()).catch(() => {});
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
    const poolPromises = [...this.pools.values()];
    this.pools.clear();
    await Promise.all(
      poolPromises.map((p) => p.then((pool) => pool.end()).catch(() => {})),
    );
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
