# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains TypeScript source. Key entry points: `src/index.ts` and `src/server.ts`. Feature areas include `src/tools/`, `src/resources/`, `src/prompts/`, `src/schemas/`, `src/config/`, and `src/lib/`.
- `tests/` holds Vitest suites (for example, `tests/integration.test.ts`).
- `docs/` contains documentation and assets such as `docs/logo.png`.
- `dist/` is generated build output; do not edit directly.

## Build, Test, and Development Commands

- `npm run build`: compile TypeScript to `dist/` and mark `dist/index.js` executable.
- `npm run dev` / `npm run dev:http`: run the server from `src/` in watch mode (stdio or HTTP).
- `npm run start` / `npm run start:http`: run the compiled server from `dist/`.
- `npm run test`: run Vitest once; `npm run test:watch` for watch mode.
- `npm run lint`: ESLint checks; `npm run format`: Prettier formatting; `npm run type-check`: TypeScript without emit.
- `npm run inspector`: launch the MCP inspector against `dist/`.

## Coding Style & Naming Conventions

- Formatting is enforced by Prettier: 2-space indentation, single quotes, semicolons, 80-char print width.
- ESLint with typescript-eslint is strict: no unused imports, no `any`, prefer type-only imports, explicit return types.
- Naming: camelCase for variables/functions, PascalCase for types/classes, UPPER_CASE for constants. Leading underscores are allowed for intentionally unused args.

## Testing Guidelines

- Tests use Vitest and live in `tests/` using `*.test.ts` filenames.
- Integration tests require an API key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY`) and a built `dist/` (`npm run build`). If no key is set, integration tests are skipped.
- Keep unit tests fast; add integration coverage for new tools/resources when behavior depends on the running server.

## Commit & Pull Request Guidelines

- Commit subjects in this repo are short, descriptive, imperative sentences (for example, "Refactor cache configuration..."). Version bumps may be bare tags like `1.0.4`.
- Before opening a PR, run `npm run lint`, `npm run type-check`, and `npm run test`.
- PRs should describe the change, include test commands run, and update `README.md` or `CONFIGURATION.md` when behavior or env vars change.

## Security & Configuration

- Runtime configuration is via environment variables documented in `CONFIGURATION.md`. Never commit API keys; prefer MCP client config or a local `.env` file.
