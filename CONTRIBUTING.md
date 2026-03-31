# Contributing

## Development setup

```bash
git clone https://github.com/vola-trebla/toad-tunnel-mcp.git
cd toad-tunnel-mcp
npm install
```

Start the local PostgreSQL sandbox (requires Docker):

```bash
npm run sandbox:up
```

## Workflow

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes, add tests
3. Run checks: `npm run format:check && npx tsc --noEmit && npm test`
4. Push and open a PR against `main`
5. Wait for CI and review

**Do not push directly to `main`.**

## Code conventions

- TypeScript strict mode, ESM (`"type": "module"`)
- Zod v4 for all validation (`import * as z from 'zod/v4'`)
- Co-locate tests with source (`foo.ts` → `foo.test.ts`)
- Code comments, commit messages, and PR titles in English
- Error handling: fail fast, explicit error types, no swallowed exceptions

## Running tests

```bash
npm test                   # all unit tests (no DB required)
npm run sandbox:verify     # integration tests against local sandbox DB
```

## Building

```bash
npm run build              # outputs to dist/
npm pack --dry-run         # verify tarball contents before publishing
```
