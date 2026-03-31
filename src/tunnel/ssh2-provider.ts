import net from "net";
import { readFileSync } from "fs";
import { homedir } from "os";
import { Client } from "ssh2";
import type { TunnelProvider, TunnelConfig, Tunnel } from "./types.js";
import {
  IdleTracker,
  DEFAULT_LIFECYCLE,
  type TunnelLifecycleOptions,
} from "./lifecycle.js";
import { ToadError } from "../utils/errors.js";

export class TunnelError extends ToadError {
  constructor(
    public readonly env: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Tunnel error for "${env}": ${message}`, cause);
    this.name = "TunnelError";
  }
}

interface ActiveTunnel {
  tunnel: Tunnel;
  conn: Client;
  server: net.Server;
  sockets: Set<net.Socket>;
  config: TunnelConfig;
  intentionalClose: boolean;
}

export class Ssh2TunnelProvider implements TunnelProvider {
  private readonly active = new Map<string, ActiveTunnel>();
  private readonly inflight = new Map<string, Promise<Tunnel>>();
  private readonly usedPorts = new Set<number>();
  private readonly opts: TunnelLifecycleOptions;
  private readonly idle: IdleTracker;

  /** Set externally after construction to avoid circular references */
  onReconnect?: (env: string) => void;

  constructor(opts: Partial<TunnelLifecycleOptions> = {}) {
    this.opts = { ...DEFAULT_LIFECYCLE, ...opts };
    this.idle = new IdleTracker(this.opts.idle_timeout_ms, (env) => {
      void this.disconnect(env);
    });
  }

  async connect(env: string, config: TunnelConfig): Promise<Tunnel> {
    const existing = this.active.get(env);
    if (existing && existing.tunnel.status === "active") {
      return existing.tunnel;
    }

    // Coalesce concurrent connect calls for the same env
    const pending = this.inflight.get(env);
    if (pending) return pending;

    // Validate local_port uniqueness across active tunnels
    if (this.usedPorts.has(config.local_port)) {
      throw new TunnelError(
        env,
        `local_port ${config.local_port} is already in use by another tunnel`,
      );
    }

    const promise = this._openConnection(env, config).finally(() => {
      this.inflight.delete(env);
    });
    this.inflight.set(env, promise);
    return promise;
  }

  private _openConnection(env: string, config: TunnelConfig): Promise<Tunnel> {
    return new Promise<Tunnel>((resolve, reject) => {
      const conn = new Client();

      const keyPath = config.key_path.replace(/^~/, homedir());
      let privateKey: Buffer;
      try {
        privateKey = readFileSync(keyPath);
      } catch (err) {
        return reject(
          new TunnelError(env, `Cannot read key file: ${keyPath}`, err),
        );
      }

      conn
        .on("ready", () => {
          const sockets = new Set<net.Socket>();

          const server = net.createServer((socket) => {
            sockets.add(socket);
            socket.on("close", () => sockets.delete(socket));

            this.idle.touch(env);
            const active = this.active.get(env);
            if (active) active.tunnel.last_query_at = new Date();

            conn.forwardOut(
              "127.0.0.1",
              0,
              config.remote_host,
              config.remote_port,
              (err, stream) => {
                if (err) {
                  socket.destroy();
                  return;
                }
                socket.pipe(stream).pipe(socket);
                stream.on("close", () => socket.destroy());
                socket.on("close", () => stream.destroy());
              },
            );
          });

          server.listen(config.local_port, "127.0.0.1", () => {
            const tunnel: Tunnel = {
              env,
              local_port: config.local_port,
              status: "active",
              connected_at: new Date(),
              last_query_at: new Date(),
            };
            const record: ActiveTunnel = {
              tunnel,
              conn,
              server,
              sockets,
              config,
              intentionalClose: false,
            };
            this.active.set(env, record);
            this.usedPorts.add(config.local_port);
            this.idle.start(env);
            resolve(tunnel);
          });

          server.on("error", (err) => {
            conn.end();
            reject(
              new TunnelError(
                env,
                `Local server error on port ${config.local_port}`,
                err,
              ),
            );
          });
        })
        .on("error", (err) => {
          reject(new TunnelError(env, "SSH connection error", err));
        })
        .on("close", () => {
          const record = this.active.get(env);
          if (record && !record.intentionalClose) {
            // Pass config and start retry count from 0; retryCount is a local
            // counter passed through the recursion — not stored on the record
            void this._scheduleReconnect(env, record.config, 0);
          }
        })
        .connect({
          host: config.bastion,
          port: config.bastion_port,
          username: config.username,
          privateKey,
          passphrase: config.passphrase,
          readyTimeout: 10_000,
          keepaliveInterval: this.opts.keepalive_interval_ms,
          keepaliveCountMax: 3,
        });
    });
  }

  // retryCount is passed explicitly so delete+recreate of the active record
  // never loses the count (fixes: active.delete before stale read)
  private async _scheduleReconnect(
    env: string,
    config: TunnelConfig,
    retryCount: number,
  ): Promise<void> {
    if (retryCount >= this.opts.max_retries) {
      const record = this.active.get(env);
      if (record) record.tunnel.status = "disconnected";
      this.idle.stop(env);
      this.opts.onGiveUp?.(env);
      this.active.delete(env);
      this.usedPorts.delete(config.local_port);
      return;
    }

    const record = this.active.get(env);
    if (record) record.tunnel.status = "connecting";

    const delay = this.opts.retry_delay_ms * Math.pow(2, retryCount);
    await new Promise<void>((r) => setTimeout(r, delay));

    // Force-close sockets and server before reopening
    await this._closeServerForEnv(env);

    try {
      // Delete stale record only after cleanup, right before opening new one
      this.active.delete(env);
      await this._openConnection(env, config);
      this.onReconnect?.(env);
    } catch {
      void this._scheduleReconnect(env, config, retryCount + 1);
    }
  }

  private async _closeServerForEnv(env: string): Promise<void> {
    const record = this.active.get(env);
    if (!record) return;
    // Destroy all open sockets so server.close() resolves immediately
    for (const socket of record.sockets) {
      socket.destroy();
    }
    record.sockets.clear();
    await new Promise<void>((resolve) => {
      record.server.close(() => resolve());
    });
  }

  async disconnect(env: string): Promise<void> {
    const active = this.active.get(env);
    if (!active) return;

    active.intentionalClose = true;
    this.idle.stop(env);

    // Destroy sockets first so server.close() resolves without waiting for idle timeout
    for (const socket of active.sockets) {
      socket.destroy();
    }
    active.sockets.clear();

    await new Promise<void>((resolve) => {
      active.server.close(() => {
        active.conn.end();
        resolve();
      });
    });

    this.usedPorts.delete(active.config.local_port);
    this.active.delete(env);
  }

  getStatus(env: string): Tunnel | null {
    return this.active.get(env)?.tunnel ?? null;
  }

  async disconnectAll(): Promise<void> {
    this.idle.stopAll();
    await Promise.all(
      [...this.active.keys()].map((env) => this.disconnect(env)),
    );
  }
}
