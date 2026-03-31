export class ToadError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ToadError";
  }
}

export class ConfigError extends ToadError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ConfigError";
  }
}

export class ConnectionError extends ToadError {
  constructor(
    public readonly env: string,
    cause?: unknown,
  ) {
    super(`Failed to connect to environment "${env}"`, cause);
    this.name = "ConnectionError";
  }
}

export class UnknownEnvError extends ToadError {
  constructor(env: string) {
    super(`Unknown environment "${env}"`);
    this.name = "UnknownEnvError";
  }
}
