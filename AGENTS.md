# AGENTS.md

## Project Overview

- **Goal**: MCP server for refining, analyzing, optimizing, and validating AI prompts.
- **Stack**: Node.js (>=20), TypeScript, Model Context Protocol (MCP), Zod, Vitest.
- **Key Libraries**: `@modelcontextprotocol/sdk`, `openai`, `@anthropic-ai/sdk`, `@google/genai`, `zod`.

## Repo Map / Structure

- `src/`: TypeScript source code.
  - `index.ts`: CLI entry point.
  - `server.ts`: MCP server initialization and tool registration.
  - `config/`: Environment variables, constants, and configuration logic.
  - `lib/`: Core logic (LLM clients, retry mechanisms, validation, prompt analysis).
  - `tools/`: Tool implementations (`refine_prompt`, `analyze_prompt`, etc.).
  - `schemas/`: Zod schemas for inputs and outputs.
  - `prompts/`: Internal prompt templates used by the server.
- `tests/`: Integration and unit tests (`*.test.ts`).
- `dist/`: Compiled JavaScript output (generated).
- `docs/`: Documentation assets.
- `CONFIGURATION.md`: Detailed environment variable reference.

## Setup & Environment

- **Install dependencies**: `npm install`
- **Environment variables**:
  - Defined in `src/config/env.ts` and documented in `CONFIGURATION.md`.
  - Key variables: `LLM_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`.
- **Node.js Version**: `>=20.0.0` (enforced in `package.json`).

## Development Workflow

- **Dev mode**: `npm run dev` (runs `src/index.ts` with `tsx watch`).
- **Build**: `npm run build` (compiles to `dist/` and sets executable permissions).
- **Start production**: `npm run start` (runs `dist/index.js`).
- **MCP Inspector**: `npm run inspector` (debugs the server using the MCP inspector).

## Testing

- **Run all tests**: `npm run test` (uses Vitest).
- **Watch mode**: `npm run test:watch`.
- **Coverage**: `npm run test:coverage`.
- **Test files**: Located in `tests/` directory, matching `*.test.ts`.

## Code Style & Conventions

- **Language**: TypeScript (ES2022 target, NodeNext module resolution).
- **Linting**: `npm run lint` (ESLint with `typescript-eslint` and `unused-imports`).
- **Formatting**: `npm run format` (Prettier).
- **Type Checking**: `npm run type-check` (runs `tsc --noEmit`).
- **Naming Conventions**:
  - Variables/Functions: `camelCase`.
  - Types/Interfaces/Classes: `PascalCase`.
  - Constants: `UPPER_CASE`.
  - Files: `kebab-case`.
- **Rules**:
  - No `any` types (`@typescript-eslint/no-explicit-any`).
  - Explicit function return types required.
  - Unused imports are forbidden.
  - Prefer `type` imports.

## Build / Release

- **Output Directory**: `dist/` (cleared and regenerated on build).
- **Process**: `npm run build` compiles TS to JS and makes `dist/index.js` executable.

## Security & Safety

- **Secrets**: API keys must be passed via environment variables; never committed.
- **Validation**: All tool inputs are validated using Zod schemas in `src/schemas/`.
- **Error Handling**: Error context is sanitized to prevent leaking sensitive info (controlled by `INCLUDE_ERROR_CONTEXT`).

## Pull Request / Commit Guidelines

- **Commit Messages**: Imperative mood (e.g., "Add feature", "Fix bug").
- **Required Checks**: Ensure `npm run lint`, `npm run type-check`, and `npm run test` pass before submitting.

## Troubleshooting

- **Missing API Key**: Ensure `LLM_PROVIDER` matches the set API key (e.g., `OPENAI_API_KEY` for `openai`).
- **Build Errors**: Run `npm run type-check` to identify TypeScript issues.
