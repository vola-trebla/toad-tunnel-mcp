# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-03-31

### Fixed

- Remove sandbox-only test and broken npm scripts (`sandbox:verify`, `sandbox:wait`)
- Remove redundant `.npmignore` (superseded by `files` whitelist in `package.json`)
- Exclude `mock-provider.ts` from production build
- Cache `getVersion()` result to avoid repeated `readFileSync` on every call
- Fix README Quick Start config copy command

## [0.1.0] — 2026-03-31

Initial release.

### Added

**Core MCP router**

- Multi-environment PostgreSQL routing — single MCP server, multiple DB environments defined in YAML
- Five MCP tools under `toad_tunnel__` namespace:
  - `toad_tunnel__execute_query` — run SQL against a named environment
  - `toad_tunnel__list_nodes` — list environments and their connection status
  - `toad_tunnel__get_overview` — schema overview (tables, row counts) with TTL cache
  - `toad_tunnel__describe_columns` — column-level schema detail for a table
  - `toad_tunnel__tunnel_status` — SSH tunnel health for all environments

**SSH tunnel management**

- Automatic SSH tunnel setup via `ssh2` for environments with `tunnel:` config
- Idle timeout with configurable duration (default 5 min) — tunnel closes when unused
- Auto-reconnect with exponential backoff and configurable retry limit
- Per-env `local_port` with uniqueness validation at startup
- Transparent pool invalidation on reconnect

**Safety layer (defense-in-depth)**

- PostgreSQL read-only roles — primary defence via `default_transaction_read_only = ON`
- Keyword blocklist — fast-fail for destructive SQL before reaching the DB (configurable per env via `permissions: read-only`)
- Row budget — queries are wrapped in a subquery with `LIMIT max_rows+1`; truncated results include a summary message
- HITL elicitation — environments with `approval: hitl` require human confirmation via MCP form elicitation before execution; configurable timeout (default 60 s)
- Structured audit log — every query attempt is logged as a JSON line (stderr by default, or configurable file path) with `status: success | blocked | rejected`

**CLI**

- `toad-tunnel-mcp --version` / `-v`
- `toad-tunnel-mcp --help` / `-h`
- `toad-tunnel-mcp validate [--config <path>]` — validate config and exit without starting server
- `--config <path>` flag for all commands (also via `TOAD_CONFIG` env var)
