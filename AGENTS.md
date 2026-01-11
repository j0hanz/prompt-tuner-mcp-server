# AGENTS.md

## Project Overview

- TypeScript MCP server that improves user prompts via three tools:
  - `fix_prompt`: polish and refine a prompt for clarity and flow.
  - `boost_prompt`: enhance a prompt using prompt-engineering best practices.
  - `crafting_prompt`: generate a reusable “workflow prompt” from a request.
- Runs over **stdio transport** (no HTTP transport in this repo).
- Uses `@modelcontextprotocol/sdk`, `zod` (v4), and provider SDKs (`openai`, `@anthropic-ai/sdk`, `@google/genai`).

## Repo Map / Structure

- `src/`: server implementation
  - `src/index.ts`: CLI entrypoint (stdio server)
  - `src/server.ts`: MCP server wiring + stdio transport
  - `src/tools.ts`: tool implementations
  - `src/schemas.ts`: Zod schemas for tool IO
  - `src/config.ts`: configuration/constants
  - `src/lib/`: LLM + retry + telemetry + prompt utilities
- `tests/`: `node:test` suites
- `dist/`: build output (generated)
- `docs/`: static assets (e.g., `docs/logo.png`)
- `scripts/`: repo utilities (e.g., `scripts/Quality-Gates.ps1`)
- `metrics/`, `logs/`: local artifacts (ignored by git)

## Setup & Environment

- Node.js: `>=22.0.0` (see `package.json` `engines.node`).
- Install dependencies:
  - `npm ci` (matches CI)
  - `npm install`
- Runtime configuration (env vars): documented in `README.md` and `CONFIGURATION.md`.
  - Required: `LLM_PROVIDER` plus one provider API key (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY`).
  - Optional: `LLM_MODEL`, `DEBUG`.

## Development Workflow

- Dev (watch from source): `npm run dev`
- Build (emit `dist/`): `npm run build`
- Run compiled server: `npm run start`
- MCP Inspector (stdio): `npm run inspector`

Notes:

- `dev:http` / `start:http` are compatibility aliases of `dev` / `start` (no HTTP transport).

## Testing

- Run tests once: `npm run test`
- Watch mode: `npm run test:watch`
- Coverage: `npm run test:coverage` (writes `coverage/lcov.info`)
- Test location: `tests/` (executed by Node’s built-in test runner).

## Code Style & Conventions

- Language: TypeScript (ESM, `"type": "module"`).
- Type-check: `npm run type-check` (runs `tsc --noEmit` for both `tsconfig.json` and `tsconfig.test.json`).
- Lint: `npm run lint` (ESLint flat config in `eslint.config.mjs`).
- Format: `npm run format` (Prettier; import ordering via `@trivago/prettier-plugin-sort-imports`).

Conventions reflected in repo config/docs:

- Local imports use `.js` extensions (NodeNext resolution).
- Prefer type-only imports (`import { type X } from ...`).
- Zod objects are typically strict (`z.strictObject(...)`) to reject unknown fields.

Related repo guidance:

- `.github/instructions/typescript-mcp-server.instructions.md`
- `.github/instructions/zod-v4.instructions.md`

## Build / Release

- Build output directory: `dist/`.
- Package entrypoints:
  - `bin.prompt-tuner-mcp-server` → `./dist/index.js`
  - `main` / `exports` → `dist/index.js` (and `dist/index.d.ts`)
- Pre-publish gate: `npm run prepublishOnly` (runs `lint`, `type-check`, `build`).
- GitHub workflow: `.github/workflows/publish.yml` publishes to npm on GitHub Release publish.

## Security & Safety

- Secrets: provider API keys are supplied via environment variables (do not commit keys).
- Transport: stdio server should not write non-protocol output to stdout.
- Inputs: tool inputs are validated/trimmed and use strict schemas (unknown fields rejected).
- Google safety: content filtering is enabled (documented in `README.md` / `CONFIGURATION.md`).

## Pull Request / Commit Guidelines

- No commit message convention is enforced by repo configuration.
- Before opening a PR, run the same gates used by publish:
  - `npm run lint`
  - `npm run type-check`
  - `npm run test`
  - `npm run build`

Optional helper:

- `scripts/Quality-Gates.ps1` provides a PowerShell workflow for measuring/comparing metrics and doing “safe refactors” with validation gates.

## Troubleshooting

- Server exits immediately:
  - Ensure `LLM_PROVIDER` is set and the matching provider API key env var is present.
- MCP client reports malformed JSON-RPC / corrupted stdio:
  - Avoid writing logs to stdout; use stderr logging patterns only.
- Type-check failures that mention Node types:
  - Confirm you’re on Node `>=22` and dependencies are installed.
- Slow responses or timeouts:
  - Try setting `LLM_MODEL` to a faster model (see defaults in `README.md`).

## Open Questions / TODO

- `.github/workflows/publish.yml` uses Node 20, but `package.json` requires Node `>=22.0.0`. Decide whether to align the workflow Node version or relax `engines.node`.
