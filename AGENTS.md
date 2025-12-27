# Repository Guidelines

## Project Structure & Module Organization

- `src/` holds TypeScript source. `src/index.ts` is the entry point and `src/server.ts` wires the MCP server. Subfolders include `config/`, `lib/`, `tools/`, `resources/`, `prompts/`, `schemas/`, and `types/`.
- `tests/` contains Vitest suites; test files use the `*.test.ts` naming pattern.
- `dist/` is generated build output (do not edit by hand).
- `docs/` stores static assets. `CONFIGURATION.md` documents runtime environment variables.

## Build, Test, and Development Commands

- `npm run dev` / `npm run dev:http`: run from source with tsx watch (HTTP variant adds `--http`).
- `npm run build`: compile TypeScript into `dist/` and set executable permissions.
- `npm run start` / `npm run start:http`: run the compiled server from `dist/`.
- `npm run test` / `npm run test:watch`: run Vitest once or in watch mode.
- `npm run lint` and `npm run format`: ESLint checks and Prettier formatting.
- `npm run type-check`: `tsc --noEmit` for strict type validation.

## Coding Style & Naming Conventions

- TypeScript, ES modules, Node >= 20.
- Prettier rules: 2-space indentation, single quotes, trailing commas, 80-char line width, sorted imports.
- ESLint is strict; avoid `any`, unused imports, and floating promises; prefer `type` imports.
- Naming: `camelCase` for variables/functions, `PascalCase` for types, `UPPER_CASE` for constants; leading `_` is allowed for unused args.

## Testing Guidelines

- Use Vitest in the Node environment; keep tests in `tests/` and name `*.test.ts`.
- Favor deterministic tests and keep individual tests under the 15s timeout.

## Commit & Pull Request Guidelines

- History favors short, imperative summaries; common pattern is `refactor: ...`, plus plain `Add ...` and version bumps like `1.0.5`.
- PRs should include a brief summary, tests run (for example, `npm run test`), and note any config or environment changes. Link related issues when applicable.

## Security & Configuration Tips

- Runtime behavior is driven by environment variables; see `CONFIGURATION.md` for required keys and limits.
- Never commit API keys. Be cautious with `INCLUDE_ERROR_CONTEXT=true` in production.
