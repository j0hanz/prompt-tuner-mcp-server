# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the TypeScript source: server setup, tools, resources, prompts, schemas, and shared utilities.
- `tests/` holds Vitest specs (for example `tests/server.test.ts`).
- `docs/` contains documentation assets (logo, guides). `CONFIGURATION.md` documents environment variables.
- `dist/` is the compiled output (do not edit by hand).

## Build, Test, and Development Commands

Run commands from the repo root.

- `npm install` installs dependencies.
- `npm run build` compiles TypeScript and sets the executable bit on `dist/index.js`.
- `npm run dev` runs the server in watch mode; `npm run dev:http` enables HTTP mode.
- `npm start` runs the built server; `npm run start:http` enables HTTP mode.
- `npm test` runs Vitest once; `npm run test:watch` watches tests.
- `npm run lint` runs ESLint; `npm run format` runs Prettier; `npm run type-check` runs `tsc --noEmit`.
- `npm run inspector` starts the MCP Inspector (use `inspector:http` for HTTP).

## Coding Style & Naming Conventions

- TypeScript ESM (`"type": "module"`). Prefer explicit return types and `type` imports.
- Prettier enforces 2-space indentation, single quotes, semicolons, 80-char width, LF, and sorted imports.
- ESLint is strict: no `any`, no unused imports, prefer `const`, and avoid floating promises.
- Naming: `camelCase` for variables/functions, `PascalCase` for types/classes, `UPPER_CASE` for constants. Leading `_` is allowed for intentionally unused params.

## Testing Guidelines

- Framework: Vitest (node environment). Test files live in `tests/**/*.test.ts`.
- Add or update tests when changing tools, scoring logic, or server behavior.

## Commit & Pull Request Guidelines

- Commit subjects in this repo are short, imperative, and sentence case (for example "Refactor cache handling"). Release commits may be version-only (for example "1.0.2").
- PRs should include a clear description, reasoning, and the tests run. Update `README.md` or `CONFIGURATION.md` when changing tools, prompts, or environment variables.

## Security & Configuration Tips

- Configure via environment variables only; do not commit secrets. Set exactly one provider API key for the chosen `LLM_PROVIDER`.
- Be cautious with `INCLUDE_ERROR_CONTEXT=true` since it can include prompt excerpts in errors.
