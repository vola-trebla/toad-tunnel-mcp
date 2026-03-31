# toad-tunnel-mcp

Multi-environment PostgreSQL MCP router with SSH tunnel management.

## Git Workflow

- Never push directly to `main`
- Create a feature branch per task (e.g. `feature/phase-0-sandbox`)
- After completing work: commit → push → create PR
- Wait for user to review and merge
- After merge: close related issue, switch to main, pull latest

## Naming

- This is a **public repo**. Never use names from work projects (company names, internal product names, domain-specific terms from employer). Use generic/abstract names in all code, configs, seed data, and issues.

## Project Structure

- `.planning/` — local planning docs (gitignored, never pushed)
- `sandbox/` — Docker Compose + init scripts for local multi-env PostgreSQL
- `src/` — TypeScript source code

## Code Conventions

- TypeScript strict mode, ESM (`"type": "module"`)
- Zod v4 for validation (`import * as z from 'zod/v4'`)
- `@modelcontextprotocol/sdk` for MCP server
- `pg` for PostgreSQL connections
- `vitest` for tests, co-located with source when possible
- Code comments, commit messages, PR titles/descriptions — always in English

## Tools & Docs

- Always use Context7 MCP to verify library APIs before writing integration code
- Key deps: `@modelcontextprotocol/sdk@1.29`, `zod@4.x`, `pg@8.x`, `yaml@2.x`

## Roadmap

Tracked via GitHub Issues (#1–#6), one per phase:

1. Phase 0: Sandbox Setup (#1)
2. Phase 1: Core MCP Router (#2)
3. Phase 2: Progressive Disclosure (#3)
4. Phase 3: SSH Tunnel Management (#4)
5. Phase 4: Safety Layer (#5)
6. Phase 5: Ship It (#6)
