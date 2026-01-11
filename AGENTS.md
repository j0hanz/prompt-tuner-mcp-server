# AGENTS.md

## Project Overview

- PromptTuner MCP is an MCP server (stdio transport) that edits user prompts via an LLM provider.
- Primary tech: TypeScript (ESM/NodeNext), Zod v4, `@modelcontextprotocol/sdk`.
- Tools exposed:
  - `fix_prompt`: spelling/grammar + minor clarity improvements.
  - `boost_prompt`: prompt-engineering enhancements for clarity/effectiveness.

## Repo Map / Structure

- `src/`: server implementation
  - `index.ts`: CLI entrypoint; bootstraps logging/telemetry and starts the server
  - `cli.ts`: CLI parsing (`--help`, `--version`, env overrides), shutdown handlers
  - `server.ts`: MCP server wiring (stdio transport) and capability negotiation
  - `tools.ts`: tool registration + implementations
  - `schemas.ts`: Zod input schemas + prompt length enforcement
  - `config.ts`: environment/config parsing + server instructions/constants
  - `lib/`: shared utilities (LLM clients, errors, telemetry, prompt utils)
- `tests/`: `node:test` suites
  - `unit.test.ts`: schema/config/prompt-utils tests
  - `integration.test.ts`: runs MCP client against `dist/index.js` (skipped without API key)
- `docs/`: static assets (e.g., `docs/logo.png`)
- `dist/`: build output (generated)
- `.github/workflows/publish.yml`: npm publish workflow (GitHub release → npm Trusted Publishing)
- `.github/instructions/`: repo-local guidance for MCP/TypeScript and Zod

## Setup & Environment

- Prerequisite: Node.js `>=22.0.0` (see `package.json` `engines.node`).
- Install deps (CI-style): `npm ci`
- Build output directory: `dist/`

Configuration is via environment variables (full reference in `CONFIGURATION.md`):

- Provider selection + API key (required):
  - `LLM_PROVIDER` (`openai` | `anthropic` | `google`)
  - One of: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY`
- Common tuning:
  - `LLM_MODEL`, `LLM_TIMEOUT_MS`, `LLM_MAX_TOKENS`, `MAX_PROMPT_LENGTH`
  - `RETRY_MAX_ATTEMPTS`, `RETRY_BASE_DELAY_MS`, `RETRY_MAX_DELAY_MS`, `RETRY_TOTAL_TIMEOUT_MS`
- Provider-specific:
  - `GOOGLE_SAFETY_DISABLED`
- Logging/error context:
  - `DEBUG`, `INCLUDE_ERROR_CONTEXT`

## Development Workflow

- Run from source (watch mode): `npm run dev`
  - Note: `dev:http` is an alias of `dev` (no HTTP transport implemented).
- Build: `npm run build`
- Run compiled server: `npm run start`
  - Note: `start:http` is an alias of `start` (no HTTP transport implemented).
- Format: `npm run format`
- Lint: `npm run lint`
- Type-check: `npm run type-check`
- Inspect with MCP Inspector: `npm run inspector` (runs `node dist/index.js` under the inspector)

## Testing

- All tests: `npm run test`
- Watch mode: `npm run test:watch`
- Coverage: `npm run test:coverage` (writes `coverage/lcov.info`)
- Test locations: `tests/*.test.ts`

Integration tests:

- `tests/integration.test.ts` starts `node dist/index.js` via `StdioClientTransport`.
- Integration tests are skipped unless one of these env vars is set:
  - `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY`

## Code Style & Conventions

- Language/runtime:
  - TypeScript `^5.9.3`
  - ESM with NodeNext resolution (`"type": "module"`)
  - Local imports use `.js` extensions (e.g., `./server.js`).
- Linting: `npm run lint` (ESLint flat config in `eslint.config.mjs`)
  - Type-checked ESLint rules for `src/**/*.ts`.
  - `unused-imports/no-unused-imports` is an error.
  - Consistent type-only imports are enforced.
  - Exported functions are expected to have explicit return types.
- Formatting: `npm run format` (Prettier; includes `@trivago/prettier-plugin-sort-imports`).

## Build / Release

- Build: `npm run build` runs `tsc -p tsconfig.build.json` and sets executable permissions on `dist/index.js`.
- Package entrypoint:
  - `bin`: `prompt-tuner-mcp-server` → `./dist/index.js`
  - `main`: `dist/index.js`
- Release/publish (GitHub Actions): `.github/workflows/publish.yml`
  - Trigger: GitHub Release `published`
  - Steps: `npm ci` → `npm run lint` → `npm run type-check` → `npm run test` → `npm run build` → `npm publish --access public`
  - Version is extracted from the release tag by stripping a leading `v` (expects tags like `v1.2.3`).
  - Uses npm Trusted Publishing (OIDC); no `NODE_AUTH_TOKEN` in the workflow.

## Security & Safety

- Do not commit secrets. API keys are provided via environment variables only.
- Transport is stdio; avoid writing non-protocol output to stdout.
- Error context is optional and intentionally sanitized/truncated when enabled (`INCLUDE_ERROR_CONTEXT=true`).
- External calls can be retried; treat tooling as “open world” (depends on third-party providers and network).

## Pull Request / Commit Guidelines

- No repo-specific commit convention is defined in this repository.
- Before opening a PR, run the same checks used by publishing:
  - `npm run lint`
  - `npm run type-check`
  - `npm run test`
  - `npm run build`
- If you change configuration behavior, update `CONFIGURATION.md` and the relevant README sections.

## Troubleshooting

- Server exits at startup with config errors:
  - Ensure `LLM_PROVIDER` is set correctly and the matching API key env var is present.
  - Numeric env vars (e.g., `LLM_TIMEOUT_MS`) must be digits-only strings.
- Integration tests are skipped:
  - Set `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` before running `npm run test`.
- Confusion about HTTP scripts:
  - `dev:http` and `start:http` are compatibility aliases; the server currently runs over stdio.
