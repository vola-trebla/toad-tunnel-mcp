import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./loader.js";
import { ConfigError } from "../utils/errors.js";

describe("loadConfig", () => {
  const validYaml = `
project: test-project
environments:
  dev:
    host: localhost
    port: 5432
    database: testdb
    user: testuser
    password: testpass
    permissions: read-write
    approval: auto
`;

  it("loads a valid config", () => {
    const config = loadConfigFromString(validYaml);
    expect(config.project).toBe("test-project");
    expect(config.environments["dev"]!.host).toBe("localhost");
  });

  it("throws ConfigError for missing file", () => {
    expect(() => loadConfig("/nonexistent/path.yaml")).toThrow(ConfigError);
  });

  it("throws ConfigError for invalid YAML", () => {
    expect(() => loadConfigFromString(":::invalid")).toThrow(ConfigError);
  });

  it("throws ConfigError for missing required fields", () => {
    expect(() =>
      loadConfigFromString(`
project: test
environments:
  dev:
    host: localhost
`),
    ).toThrow(ConfigError);
  });

  it("throws ConfigError for invalid permissions enum", () => {
    expect(() =>
      loadConfigFromString(`
project: test
environments:
  dev:
    host: localhost
    port: 5432
    database: db
    user: u
    password: p
    permissions: admin
    approval: auto
`),
    ).toThrow(ConfigError);
  });

  it("throws ConfigError for invalid approval enum", () => {
    expect(() =>
      loadConfigFromString(`
project: test
environments:
  dev:
    host: localhost
    port: 5432
    database: db
    user: u
    password: p
    permissions: read-only
    approval: manual
`),
    ).toThrow(ConfigError);
  });

  it("applies default port 5432", () => {
    const config = loadConfigFromString(`
project: test
environments:
  dev:
    host: localhost
    database: db
    user: u
    password: p
    permissions: read-write
    approval: auto
`);
    expect(config.environments["dev"]!.port).toBe(5432);
  });

  describe("env var interpolation", () => {
    beforeEach(() => {
      vi.stubEnv("TEST_DB_PASSWORD", "secret123");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("interpolates ${VAR} in config values", () => {
      const config = loadConfigFromString(`
project: test
environments:
  dev:
    host: localhost
    port: 5432
    database: db
    user: u
    password: \${TEST_DB_PASSWORD}
    permissions: read-write
    approval: auto
`);
      expect(config.environments["dev"]!.password).toBe("secret123");
    });

    it("throws ConfigError for undefined env var", () => {
      expect(() =>
        loadConfigFromString(`
project: test
environments:
  dev:
    host: localhost
    port: 5432
    database: db
    user: u
    password: \${NONEXISTENT_VAR}
    permissions: read-write
    approval: auto
`),
      ).toThrow(ConfigError);
    });
  });
});

/** Helper: write yaml to a temp file and load it */
function loadConfigFromString(yaml: string) {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const tmpFile = path.join(os.tmpdir(), `toad-test-${Date.now()}.yaml`);
  fs.writeFileSync(tmpFile, yaml);
  try {
    return loadConfig(tmpFile);
  } finally {
    fs.unlinkSync(tmpFile);
  }
}
